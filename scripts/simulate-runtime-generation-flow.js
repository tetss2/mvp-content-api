import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ADAPTER_CONSTRAINTS, runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-generation");
const EXPERT_ID = "dinara";

const REQUESTS = [
  {
    runName: "short-instagram-post",
    expertId: EXPERT_ID,
    day: 31,
    topic: "relationship anxiety",
    userRequest: "Короткий пост о тревоге в отношениях",
    intent: "educational_post",
    platform: "instagram_post",
    length: "short",
    format: "post",
    tone: "expert_warm",
    audienceState: "warming",
    ctaType: "save_share_cta",
  },
  {
    runName: "normal-telegram-post",
    expertId: EXPERT_ID,
    day: 32,
    topic: "emotional dependency",
    userRequest: "Обычный пост про эмоциональную зависимость",
    intent: "storytelling",
    platform: "telegram_longread",
    length: "medium",
    format: "post",
    tone: "empathetic",
    audienceState: "engaged",
    ctaType: "emotional_cta",
  },
  {
    runName: "long-article-mode",
    expertId: EXPERT_ID,
    day: 33,
    topic: "female sexuality myths",
    userRequest: "Длинная статья о мифах женской сексуальности",
    intent: "longform_article",
    platform: "telegram_longread",
    length: "long",
    format: "article",
    tone: "calm",
    audienceState: "trusting",
    ctaType: "educational_cta",
  },
  {
    runName: "direct-faq-answer",
    expertId: EXPERT_ID,
    day: 34,
    topic: "shame and desire",
    userRequest: "FAQ-ответ: почему рядом со стыдом пропадает желание?",
    intent: "faq_answer",
    platform: "instagram_post",
    length: "medium",
    format: "answer",
    tone: "direct",
    audienceState: "trusting",
    ctaType: "trust_cta",
  },
  {
    runName: "soft-sales-consultation",
    expertId: EXPERT_ID,
    day: 35,
    topic: "boundaries in intimacy",
    userRequest: "Мягкий продающий пост про консультацию и границы в близости",
    intent: "sales_post",
    platform: "instagram_post",
    length: "medium",
    format: "post",
    tone: "expert_warm",
    audienceState: "considering_purchase",
    ctaType: "dm_cta",
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function average(values) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value));
  return clean.length ? Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(3)) : 0;
}

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

async function writeReport(name, content) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const target = path.join(REPORT_DIR, name);
  await fs.writeFile(target, `${content.trim()}\n`, "utf8");
  return target;
}

function reportHeader(title) {
  return `# ${title}\n\nGenerated: ${new Date().toISOString()}\n\nLocal-only constraints: ${Object.entries(ADAPTER_CONSTRAINTS).filter(([, value]) => value === true || typeof value === "string").map(([key, value]) => `\`${key}${typeof value === "string" ? `=${value}` : ""}\``).join(", ")}.\n`;
}

function resultRows(results) {
  return [
    "| Run | Request | Length | Tone | Runtime Decision | Context | Score | Warnings |",
    "| --- | --- | --- | --- | --- | ---: | ---: | --- |",
    ...results.map((result) => {
      const req = result.request;
      const decision = result.runtime.selected_generation_decisions;
      const context = result.generation_pipeline.assembled_context_summary;
      const warnings = result.integrated_validation.warnings;
      return `| ${req.runName || req.run_name || "run"} | ${req.topic} | ${req.length} | ${req.tone || "auto"} | ${decision.hook_type}/${decision.emotional_depth}/${decision.cta_strength} | ${context.selected_count} | ${result.integrated_validation.combined_quality_score} | ${warnings.length ? warnings.join(", ") : "none"} |`;
    }),
  ].join("\n");
}

function renderFlowReport(results) {
  const first = results[0];
  return `${reportHeader("Runtime Generation Flow Report")}
## Summary

- Requests simulated: ${results.length}
- Average combined quality: ${average(results.map((result) => result.integrated_validation.combined_quality_score))}
- Average generation evaluation: ${average(results.map((result) => result.generation_pipeline.evaluation.overall_score))}
- Adapter mode: \`${first.adapter_mode}\`
- Generator used: \`mock\`

## Simulation Runs

${resultRows(results)}

## Example Runtime State

\`\`\`json
${JSON.stringify(first.runtime.runtime_state, null, 2)}
\`\`\`

## Example Generation Decisions

\`\`\`json
${JSON.stringify(first.runtime.selected_generation_decisions, null, 2)}
\`\`\`

## Example Generated Content Structure

\`\`\`json
${JSON.stringify(first.generation_pipeline.generated_content_structure, null, 2)}
\`\`\`
`;
}

function renderAdapterReport(results) {
  const first = results[0];
  return `${reportHeader("Runtime Adapter Report")}
## Connected Files

${first.connected_files.map((file) => `- \`${file}\``).join("\n")}

## What Is Real

- Unified runtime state loading and decision routing.
- Local cognition JSON loading and updating.
- Local metadata retrieval candidates from expert sidecars.
- Local context assembly through \`expert-context-assembly.js\`.
- Local generation orchestration through \`expert-generation-orchestration.js\`.
- Local output evaluation through \`expert-output-evaluation.js\`.
- Local artifact writing under expert report folders.

## What Remains Simulated

- Final draft generation uses \`scripts/adapters/mock-generation-adapter.js\`.
- Production publishing is not connected.
- Telegram handlers are not connected.
- External model calls are intentionally blocked by adapter choice.

## State Loading Flow

\`\`\`json
${JSON.stringify(first.cognition_loading, null, 2)}
\`\`\`

## Adapter Request Shape

\`\`\`json
${JSON.stringify(first.generation_pipeline.sandbox_request, null, 2)}
\`\`\`
`;
}

function renderValidationReport(results) {
  return `${reportHeader("Runtime Generation Validation Report")}
## Validation Coverage

- Runtime repetition risk
- Runtime trust and CTA pacing
- Runtime author voice status
- Generation sandbox output evaluation
- Context assembly warnings
- Mock adapter warnings

## Per-Run Validation

${results.map((result) => `- ${result.request.runName}: status \`${result.integrated_validation.status}\`, combined quality ${result.integrated_validation.combined_quality_score}, repetition \`${result.integrated_validation.repetition_risk?.status}\`, CTA risk \`${result.integrated_validation.trust_cta_pacing?.overload_risk}\`, author voice ${result.integrated_validation.author_voice_status.score}. Warnings: ${result.integrated_validation.warnings.length ? result.integrated_validation.warnings.join(", ") : "none"}.`).join("\n")}
`;
}

function renderRiskReport(results) {
  const artifactPaths = results.flatMap((result) => Object.values(result.generation_pipeline.generated_content_structure.artifact_paths || {}));
  return `${reportHeader("Runtime Integration Risks Report")}
## Integration Risks Before Production

- Mock output is not representative enough for final author voice scoring.
- Runtime and sandbox currently assemble context separately; production integration should decide whether runtime context becomes authoritative.
- CTA pacing warnings must be reviewed before enabling any live consultation CTA.
- Author voice drift should be tested against real generated drafts and human-reviewed samples.
- Prompt length, Telegram caption limits, and Markdown stripping must be validated in a separate Telegram-safe test harness.
- Production integration must include rollback and feature flag boundaries.

## Not Connected Yet

- Telegram polling handlers in \`index.js\`.
- Cloudinary/FAL/Fish Audio/OpenAI live generation paths.
- Railway deployment.
- Supabase production database writes.
- FAISS/vector index mutation.
- Auto-posting or publishing.

## Must Validate Before Telegram Runtime Integration

- Exact payload shape expected by existing Telegram delivery formats.
- Russian text encoding and Markdown escaping.
- State persistence failure behavior.
- Duplicate-topic suppression under real user sessions.
- CTA escalation under real campaign state.
- Human approval workflow before publishing.

## Local Artifacts Written

${artifactPaths.map((target) => `- \`${target}\``).join("\n")}
`;
}

async function writeReports(results) {
  return {
    runtime_generation_flow_report: await writeReport("runtime_generation_flow_report.md", renderFlowReport(results)),
    runtime_adapter_report: await writeReport("runtime_adapter_report.md", renderAdapterReport(results)),
    runtime_generation_validation_report: await writeReport("runtime_generation_validation_report.md", renderValidationReport(results)),
    runtime_integration_risks_report: await writeReport("runtime_integration_risks_report.md", renderRiskReport(results)),
  };
}

async function simulateRuntimeGenerationFlow() {
  const results = [];
  const previousPacks = [];

  for (const request of REQUESTS) {
    const result = await runRuntimeGenerationAdapter({
      ...request,
      previousPacks,
    }, {
      root: ROOT,
      persistRuntime: true,
      initializeStorage: true,
    });
    previousPacks.push(result.runtime?.production_pack || result.runtime);
    results.push(result);
  }

  const reports = await writeReports(results);
  const summary = {
    simulated_requests: results.length,
    average_combined_quality: average(results.map((result) => result.integrated_validation.combined_quality_score)),
    generated_reports: Object.values(reports).map(rel),
    generated_artifact_paths: results.map((result) => result.generation_pipeline.generated_content_structure.artifact_paths?.runSummary),
    simulation_output_summary: results.map((result) => ({
      run_name: result.request.runName,
      topic: result.request.topic,
      length: result.request.length,
      tone: result.request.tone,
      decisions: result.runtime.selected_generation_decisions,
      context_summary: result.generation_pipeline.assembled_context_summary,
      validation_warnings: result.integrated_validation.warnings,
      quality_score: result.integrated_validation.combined_quality_score,
      repetition_risk: result.integrated_validation.repetition_risk,
      trust_cta_pacing: result.integrated_validation.trust_cta_pacing,
      author_voice_status: result.integrated_validation.author_voice_status,
    })),
    warnings: [...new Set(results.flatMap((result) => result.integrated_validation.warnings))],
    safety_confirmation: {
      no_deploy: true,
      no_telegram_runtime_mutation: true,
      no_faiss_or_index_mutation: true,
      no_ingest_or_promote: true,
      no_production_database_migration: true,
      no_auto_posting: true,
      no_external_apis: true,
    },
  };
  return { results, reports, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  simulateRuntimeGenerationFlow()
    .then(({ summary }) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  REPORT_DIR,
  REQUESTS,
  simulateRuntimeGenerationFlow,
};
