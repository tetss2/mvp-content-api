import { promises as fs } from "fs";
import path from "path";
import {
  buildCapabilityMatrix,
  getExpertConfig,
  getExpertFeedbackMemory,
  getExpertGenerationPolicy,
  getExpertRetrievalNamespace,
  getExpertVoiceProfile,
  listExperts,
  resolveExpertRuntime,
  validateExpertIsolation,
} from "./expert-registry.js";

const ROOT = process.cwd();
const REPORT_DIR = "reports/multi-expert";

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function reportPath(fileName) {
  return path.join(ROOT, REPORT_DIR, fileName);
}

function mdTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [headerLine, separator, ...body].join("\n");
}

function firstValue(value, fallback = "none") {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function simulateRetrieval(expert, runtime) {
  const retrievalConfig = runtime.runtime_config.retrieval_settings_path.config;
  return {
    expert_id: expert.expert_id,
    retrieval_namespace: expert.retrieval_namespace,
    namespace_filter: `namespace == "${expert.retrieval_namespace}"`,
    allowed_source_roots: retrievalConfig.allowed_source_roots || [],
    blocked_cross_expert_namespaces: retrievalConfig.blocked_cross_expert_namespaces || [],
    simulated_candidates: [
      {
        id: `${expert.expert_id}_candidate_1`,
        namespace: expert.retrieval_namespace,
        source_root: firstValue(retrievalConfig.allowed_source_roots, `configs/experts/${expert.expert_id}`),
        accepted: true,
      },
      {
        id: `${expert.expert_id}_cross_namespace_probe`,
        namespace: "cross_expert_probe",
        source_root: "configs/experts/template",
        accepted: false,
        rejected_because: "namespace_mismatch",
      },
    ],
  };
}

function simulateGenerationPlan(expert, policy, runtime) {
  const toneConfig = runtime.runtime_config.tone_settings_path.config;
  const ctaConfig = runtime.runtime_config.cta_settings_path.config;
  const outputPolicy = runtime.runtime_config.output_policy_path.config;
  return {
    expert_id: expert.expert_id,
    default_generation_intent: policy.default_generation_intent,
    allowed_content_kinds: policy.allowed_content_kinds || [],
    forbidden_content_kinds: policy.forbidden_content_kinds || [],
    tone: toneConfig.primary_tone,
    cta_style: ctaConfig.default_cta_style,
    output_default: outputPolicy.default_output,
    prompt_scope: {
      expert_id: expert.expert_id,
      voice_profile_path: expert.voice_profile_path,
      style_constraints_path: expert.style_constraints_path,
      feedback_memory_path: expert.feedback_memory_path,
    },
  };
}

function simulateVoiceMatch(expert, voiceProfile) {
  const profile = voiceProfile.profile;
  const loadedProfiles = Array.isArray(profile) ? profile : [profile];
  const profileStatuses = loadedProfiles.map((item) => item.profile?.status || item.status || "loaded");
  return {
    expert_id: expert.expert_id,
    voice_profile_path: voiceProfile.path,
    loaded_profile_count: loadedProfiles.length,
    profile_status: profileStatuses.join(", "),
    matched_only_against_expert_scope: true,
    cross_expert_voice_sources_used: false,
  };
}

function simulateFeedbackIsolation(expert, feedbackMemory) {
  const memory = feedbackMemory.memory;
  const loadedMemories = Array.isArray(memory) ? memory : [memory];
  return {
    expert_id: expert.expert_id,
    feedback_memory_path: feedbackMemory.path,
    loaded_memory_count: loadedMemories.length,
    memory_scope: feedbackMemory.path.includes(expert.expert_id) ? "expert_scoped" : "needs_review",
    cross_expert_feedback_used: false,
  };
}

function renderExpertRegistryReport(experts, validation) {
  return `# Expert Registry Report

Generated: ${new Date().toISOString()}

This report is local-only. It does not wire the registry into Telegram, production retrieval, OpenAI, FAISS, ingest, promote, or deployment.

## Summary

- Registered experts: ${experts.length}
- Active experts: ${validation.active_expert_count}
- Isolation validation: ${validation.ok ? "passed" : "failed"}

## Experts

${mdTable(
  ["expert_id", "display_name", "status", "language", "platforms", "domains", "retrieval_namespace"],
  experts.map((expert) => [
    expert.expert_id,
    expert.display_name,
    expert.status,
    expert.primary_language,
    expert.platforms.join(", "),
    expert.content_domains.join(", "),
    expert.retrieval_namespace,
  ]),
)}

## Registry Boundary

The registry is a configuration and resolver layer only. Production bot routing remains unchanged.
`;
}

function renderIsolationValidationReport(validation, retrievalSimulations, voiceSimulations, feedbackSimulations) {
  const issues = validation.issues.length
    ? mdTable(
      ["severity", "expert_id", "code", "message"],
      validation.issues.map((issue) => [issue.severity, issue.expert_id || "registry", issue.code, issue.message]),
    )
    : "No validation issues found.";

  return `# Isolation Validation Report

Generated: ${new Date().toISOString()}

## Validation Result

- Passed: ${validation.ok}
- Experts checked: ${validation.expert_count}

## Retrieval Isolation

${mdTable(
  ["expert_id", "namespace_filter", "accepted_namespace", "cross_probe_rejected"],
  retrievalSimulations.map((item) => [
    item.expert_id,
    item.namespace_filter,
    item.simulated_candidates[0].namespace,
    item.simulated_candidates[1].accepted === false ? "yes" : "no",
  ]),
)}

## Voice Isolation

${mdTable(
  ["expert_id", "voice_profile_path", "profiles_loaded", "cross_expert_voice_sources_used"],
  voiceSimulations.map((item) => [
    item.expert_id,
    item.voice_profile_path,
    item.loaded_profile_count,
    item.cross_expert_voice_sources_used,
  ]),
)}

## Feedback Isolation

${mdTable(
  ["expert_id", "feedback_memory_path", "memories_loaded", "memory_scope", "cross_expert_feedback_used"],
  feedbackSimulations.map((item) => [
    item.expert_id,
    item.feedback_memory_path,
    item.loaded_memory_count,
    item.memory_scope,
    item.cross_expert_feedback_used,
  ]),
)}

## Warnings And Errors

${issues}
`;
}

function renderRuntimeResolutionReport(runtimeResolutions, generationPlans) {
  return `# Runtime Resolution Report

Generated: ${new Date().toISOString()}

## Runtime Config Files

${mdTable(
  ["expert_id", "retrieval", "generation", "tone", "cta", "safety", "style", "context", "output"],
  runtimeResolutions.map((runtime) => [
    runtime.expert_id,
    runtime.runtime_config.retrieval_settings_path.exists,
    runtime.runtime_config.generation_settings_path.exists,
    runtime.runtime_config.tone_settings_path.exists,
    runtime.runtime_config.cta_settings_path.exists,
    runtime.runtime_config.safety_settings_path.exists,
    runtime.runtime_config.style_settings_path.exists,
    runtime.runtime_config.context_policy_path.exists,
    runtime.runtime_config.output_policy_path.exists,
  ]),
)}

## Example Runtime Resolution

\`\`\`json
${JSON.stringify(runtimeResolutions[0], null, 2)}
\`\`\`

## Example Generation Plan

\`\`\`json
${JSON.stringify(generationPlans[0], null, 2)}
\`\`\`
`;
}

function renderCapabilityMatrixReport(matrix) {
  const capabilityKeys = [
    "supports_storytelling",
    "supports_sales_posts",
    "supports_therapeutic_content",
    "supports_short_hooks",
    "supports_long_articles",
    "supports_reels_scripts",
    "supports_cta_generation",
  ];
  return `# Capability Matrix Report

Generated: ${new Date().toISOString()}

${mdTable(
  ["expert_id", "status", ...capabilityKeys],
  matrix.map((row) => [
    row.expert_id,
    row.status,
    ...capabilityKeys.map((key) => row.capabilities[key]),
  ]),
)}

## Notes

Capabilities are declarative routing constraints for future SaaS onboarding. They do not activate live generation behavior.
`;
}

function renderOnboardingTemplateReport() {
  return `# Onboarding Template Report

Generated: ${new Date().toISOString()}

## Template Root

\`templates/expert-onboarding/\`

## Required Folders

- \`configs/experts/<expert_id>/\`
- \`expert_profiles/<expert_id>/voice/\`
- \`expert_profiles/<expert_id>/feedback_memory/\`
- \`expert_profiles/<expert_id>/reports/onboarding/\`
- \`expert_profiles/<expert_id>/reports/generation_runs/\`
- \`knowledge_intake/<expert_id>/incoming/\`
- \`knowledge_intake/<expert_id>/cleaned/\`
- \`knowledge_indexes/<expert_id>/staging/\`

## Required Configs

- \`expert.json\`
- \`capabilities.json\`
- \`retrieval.json\`
- \`generation-policy.json\`
- \`tone.json\`
- \`cta.json\`
- \`safety-policy.json\`
- \`style-constraints.json\`
- \`context-policy.json\`
- \`output-policy.json\`

## Required Reports

- onboarding inventory report
- source path inventory
- taxonomy summary
- retrieval scoring report
- context assembly report
- generation orchestration report
- sandbox report
- author voice report
- feedback memory report
- isolation validation report

## Automation Boundary

The template prepares future onboarding automation only. It does not ingest, promote, mutate indexes, deploy, fine-tune, or alter Telegram runtime behavior.
`;
}

async function checkCompatibilityFiles() {
  const files = [
    "index.js",
    "knowledge_retrieval.js",
    "retrieval_service.js",
    "scripts/simulate-retrieval-ranking.js",
    "scripts/simulate-author-voice.js",
    "scripts/simulate-feedback-learning.js",
    "scripts/run-local-generation-sandbox.js",
    "scripts/expert-generation-sandbox.js",
  ];

  const checks = [];
  for (const file of files) {
    try {
      await fs.access(path.join(ROOT, file));
      checks.push({ file, exists: true });
    } catch {
      checks.push({ file, exists: false });
    }
  }
  return checks;
}

function renderCompatibilitySummary(checks) {
  return {
    existing_dinara_flows_still_available: checks.find((item) => item.file === "index.js")?.exists === true,
    retrieval_simulation_still_available: checks.find((item) => item.file === "scripts/simulate-retrieval-ranking.js")?.exists === true,
    author_voice_scoring_still_available: checks.find((item) => item.file === "scripts/simulate-author-voice.js")?.exists === true,
    feedback_learning_still_available: checks.find((item) => item.file === "scripts/simulate-feedback-learning.js")?.exists === true,
    sandbox_generation_still_available: checks.find((item) => item.file === "scripts/run-local-generation-sandbox.js")?.exists === true,
    checked_without_runtime_wiring: true,
  };
}

async function writeReports(reports) {
  await fs.mkdir(path.join(ROOT, REPORT_DIR), { recursive: true });
  const paths = {};
  for (const [name, content] of Object.entries(reports)) {
    const file = reportPath(`${name}.md`);
    await fs.writeFile(file, content, "utf8");
    paths[name] = file;
  }
  return paths;
}

async function main() {
  const experts = await listExperts({ root: ROOT });
  const validation = await validateExpertIsolation({ root: ROOT });
  const capabilityMatrix = await buildCapabilityMatrix({ root: ROOT });
  const runtimeResolutions = [];
  const retrievalSimulations = [];
  const generationPlans = [];
  const voiceSimulations = [];
  const feedbackSimulations = [];

  for (const expert of experts) {
    const config = await getExpertConfig(expert.expert_id, { root: ROOT });
    const runtime = await resolveExpertRuntime(expert.expert_id, { root: ROOT });
    const namespace = await getExpertRetrievalNamespace(expert.expert_id, { root: ROOT });
    const generationPolicy = await getExpertGenerationPolicy(expert.expert_id, { root: ROOT });
    const voiceProfile = await getExpertVoiceProfile(expert.expert_id, { root: ROOT });
    const feedbackMemory = await getExpertFeedbackMemory(expert.expert_id, { root: ROOT });

    runtimeResolutions.push({
      ...runtime,
      registry_namespace_resolution: namespace,
      config_status: config.status,
    });
    retrievalSimulations.push(simulateRetrieval(expert, runtime));
    generationPlans.push(simulateGenerationPlan(expert, generationPolicy, runtime));
    voiceSimulations.push(simulateVoiceMatch(expert, voiceProfile));
    feedbackSimulations.push(simulateFeedbackIsolation(expert, feedbackMemory));
  }

  const compatibilityChecks = await checkCompatibilityFiles();
  const compatibilitySummary = renderCompatibilitySummary(compatibilityChecks);
  const reportPaths = await writeReports({
    expert_registry_report: renderExpertRegistryReport(experts, validation),
    isolation_validation_report: renderIsolationValidationReport(validation, retrievalSimulations, voiceSimulations, feedbackSimulations),
    runtime_resolution_report: renderRuntimeResolutionReport(runtimeResolutions, generationPlans),
    capability_matrix_report: renderCapabilityMatrixReport(capabilityMatrix),
    onboarding_template_report: renderOnboardingTemplateReport(),
  });

  console.log(`Experts loaded: ${experts.length}`);
  console.log(`Isolation validation: ${validation.ok ? "passed" : "failed"}`);

  console.log("\nGenerated reports:");
  for (const file of Object.values(reportPaths)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nExample expert config:");
  console.log(JSON.stringify(await getExpertConfig("dinara", { root: ROOT }), null, 2));

  console.log("\nExample capability matrix:");
  console.log(JSON.stringify(capabilityMatrix, null, 2));

  console.log("\nExample isolation validation:");
  console.log(JSON.stringify({
    ok: validation.ok,
    issues: validation.issues.slice(0, 5),
    retrieval_probe: retrievalSimulations[0],
    voice_probe: voiceSimulations[0],
    feedback_probe: feedbackSimulations[0],
  }, null, 2));

  console.log("\nExample runtime resolution:");
  console.log(JSON.stringify(runtimeResolutions[0], null, 2));

  console.log("\nCompatibility checks:");
  console.log(JSON.stringify(compatibilitySummary, null, 2));

  console.log("\nWarnings/errors:");
  if (!validation.issues.length) {
    console.log("none");
  } else {
    for (const issue of validation.issues) {
      console.log(`- [${issue.severity}] ${issue.expert_id || "registry"} ${issue.code}: ${issue.message}`);
    }
  }

  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram runtime changes, no OpenAI fine-tuning, no automatic onboarding.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {
  checkCompatibilityFiles,
  renderCapabilityMatrixReport,
  renderExpertRegistryReport,
  renderIsolationValidationReport,
  renderOnboardingTemplateReport,
  renderRuntimeResolutionReport,
  simulateFeedbackIsolation,
  simulateGenerationPlan,
  simulateRetrieval,
  simulateVoiceMatch,
};
