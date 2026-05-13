import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  RUNTIME_CONSTRAINTS,
  loadPersistentCognition,
  runUnifiedGenerationRuntime,
} from "./unified-generation-runtime.js";

const ROOT = process.cwd();
const EXPERT_ID = "dinara";
const REPORT_DIR = path.join(ROOT, "reports", "runtime");

const TOPIC_ROTATION = [
  "relationship anxiety",
  "emotional dependency",
  "female sexuality myths",
  "boundaries in intimacy",
  "shame and desire",
  "trust after conflict",
  "body sensitivity",
  "self-worth in relationships",
  "adult attachment",
  "soft communication",
];

const PLATFORM_ROTATION = [
  "instagram_post",
  "reels_script",
  "telegram_longread",
  "carousel_concept",
  "story_sequence",
  "faq_thread",
];

const INTENT_ROTATION = [
  "audience_warming",
  "educational_post",
  "storytelling",
  "authority",
  "therapeutic",
  "FAQ",
  "soft_sales",
  "objection_handling",
];

const CTA_ROTATION = [
  "low_pressure_cta",
  "save_share_cta",
  "educational_cta",
  "emotional_cta",
  "trust_cta",
  "soft_cta",
  "dm_cta",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pick(items, index) {
  return items[index % items.length];
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

function audienceStateForDay(day) {
  if (day <= 5) return "warming";
  if (day <= 11) return "engaged";
  if (day <= 18) return "trusting";
  if (day <= 24) return "considering_purchase";
  return "returning_reader";
}

function simulationInput(day) {
  const audienceState = audienceStateForDay(day);
  const cta = audienceState === "warming"
    ? pick(CTA_ROTATION.slice(0, 3), day - 1)
    : audienceState === "considering_purchase"
      ? pick(["trust_cta", "soft_cta", "dm_cta"], day - 1)
      : pick(CTA_ROTATION, day - 1);
  return {
    expertId: EXPERT_ID,
    day,
    topic: pick(TOPIC_ROTATION, day - 1),
    intent: pick(INTENT_ROTATION, day - 1),
    platform: pick(PLATFORM_ROTATION, day - 1),
    audienceState,
    ctaType: cta,
    campaignType: "trust_building_flow",
    length: day % 6 === 0 ? "long" : "medium",
  };
}

function warningTable(runs) {
  const rows = runs.map((run) => {
    const warnings = asArray(run.validation?.warnings);
    return `| ${run.runtime_state.campaign_context.campaign_day} | ${run.runtime_state.generation_intent.topic} | ${run.validation.status} | ${run.quality_score.final_quality_score} | ${warnings.length ? warnings.join(", ") : "none"} |`;
  });
  return ["| Day | Topic | Validation | Quality | Warnings |", "| --- | --- | --- | ---: | --- |", ...rows].join("\n");
}

function orchestrationExample(run) {
  return JSON.stringify(run.orchestration_flow.map((step) => ({
    step: step.step,
    status: step.status,
    ...Object.fromEntries(Object.entries(step).filter(([key]) => !["at", "step", "status"].includes(key))),
  })), null, 2);
}

function runtimeStateExample(run) {
  return JSON.stringify({
    expert_identity: run.runtime_state.expert_identity,
    generation_intent: run.runtime_state.generation_intent,
    audience_state: run.runtime_state.audience_state,
    campaign_context: run.runtime_state.campaign_context,
    narrative_continuity: run.runtime_state.narrative_continuity,
    emotional_pacing: run.runtime_state.emotional_pacing,
    cta_pacing: run.runtime_state.cta_pacing,
    trust_progression: run.runtime_state.trust_progression,
    repetition_risk: run.runtime_state.repetition_risk,
    platform_target: run.runtime_state.platform_target,
    production_format: run.runtime_state.production_format,
    decision_engine: run.runtime_state.decision_engine,
  }, null, 2);
}

function runtimeOutputExample(run) {
  return JSON.stringify({
    output_type: run.final_runtime_output.output_type,
    publication_status: run.final_runtime_output.publication_status,
    telegram_runtime_mutation: run.final_runtime_output.telegram_runtime_mutation,
    external_api_calls: run.final_runtime_output.external_api_calls,
    faiss_or_index_mutation: run.final_runtime_output.faiss_or_index_mutation,
    validation_status: run.final_runtime_output.validation_status,
    warnings: run.final_runtime_output.warnings,
    primary_output_shape: {
      output_id: run.final_runtime_output.primary_output.output_id,
      output_format: run.final_runtime_output.primary_output.output_format,
      content_block_count: asArray(run.final_runtime_output.primary_output.content_blocks).length,
    },
  }, null, 2);
}

function reportHeader(title) {
  return `# ${title}\n\nGenerated: ${new Date().toISOString()}\n\nLocal-only constraints: ${Object.entries(RUNTIME_CONSTRAINTS).filter(([, value]) => value).map(([key]) => `\`${key}\``).join(", ")}.\n`;
}

function renderExecutionReport(runs) {
  const first = runs[0];
  const last = runs.at(-1);
  return `${reportHeader("Unified Runtime Execution Report")}
## Summary

- Runs simulated: ${runs.length}
- Average final quality: ${average(runs.map((run) => run.quality_score.final_quality_score))}
- First run id: \`${first.run_id}\`
- Last run id: \`${last.run_id}\`
- External APIs called: \`false\`
- Telegram runtime mutated: \`false\`
- FAISS/index mutated: \`false\`

## Example Runtime State

\`\`\`json
${runtimeStateExample(first)}
\`\`\`

## Example Generation Orchestration Flow

\`\`\`json
${orchestrationExample(first)}
\`\`\`

## 30-Day Validation Table

${warningTable(runs)}
`;
}

function renderCognitionReport(runs, cognition) {
  const last = runs.at(-1);
  return `${reportHeader("Cognition State Report")}
## Example Cognition Loading

\`\`\`json
${JSON.stringify(last.cognition_loading, null, 2)}
\`\`\`

## Persistent State Snapshot

- Loaded from disk on final run: \`${last.cognition_loading.loaded_from_disk}\`
- Persisted after run: \`${last.cognition_loading.persisted_after_run}\`
- Cognitive day: ${cognition.state.day}
- Topic nodes: ${asArray(cognition.state.topicGraph?.nodes).length}
- Topic relationships: ${asArray(cognition.state.topicGraph?.relationships).length}
- Optimization events: ${asArray(cognition.state.optimizationHistory).length}

## Storage Files

${Object.values(last.cognition_loading.storage_paths).map((target) => `- \`${target}\``).join("\n")}
`;
}

function renderValidationReport(runs) {
  const warnings = runs.flatMap((run) => asArray(run.validation.warnings).map((warning) => ({
    day: run.runtime_state.campaign_context.campaign_day,
    topic: run.runtime_state.generation_intent.topic,
    warning,
  })));
  return `${reportHeader("Runtime Validation Report")}
## Validation Coverage

- Tone consistency
- Narrative continuity
- Repetition risk
- CTA overload risk
- Audience fatigue
- Emotional overload
- AI-generic patterns

## Warnings

${warnings.length ? warnings.map((item) => `- Day ${item.day}, ${item.topic}: \`${item.warning}\``).join("\n") : "- No validation warnings produced."}
`;
}

function renderNarrativeReport(runs) {
  return `${reportHeader("Narrative Continuity Report")}
## Continuity Progression

${runs.map((run) => `- Day ${run.runtime_state.campaign_context.campaign_day}: ${run.runtime_state.generation_intent.topic} -> ${run.runtime_state.decision_engine.narrative_continuation} (${run.validation.narrative_continuity.risk} risk)`).join("\n")}
`;
}

function renderRepetitionReport(runs) {
  const example = runs.find((run) => run.validation.repetition_risk.same_topic_recent_count > 0) || runs[0];
  return `${reportHeader("Repetition Risk Report")}
## Example Repetition Validation

\`\`\`json
${JSON.stringify(example.validation.repetition_risk, null, 2)}
\`\`\`

## Daily Scores

${runs.map((run) => `- Day ${run.runtime_state.campaign_context.campaign_day}: score ${run.validation.repetition_risk.risk_score}, status \`${run.validation.repetition_risk.status}\`, topic ${run.runtime_state.generation_intent.topic}`).join("\n")}
`;
}

function renderTrustReport(runs) {
  const example = runs.find((run) => run.trust_pacing.overload_risk !== "low") || runs[0];
  return `${reportHeader("Trust Pacing Report")}
## Example Trust Pacing Validation

\`\`\`json
${JSON.stringify(example.trust_pacing, null, 2)}
\`\`\`

## Daily Trust/CTA Fit

${runs.map((run) => `- Day ${run.runtime_state.campaign_context.campaign_day}: trust ${run.trust_pacing.trust_score}, CTA level ${run.trust_pacing.selected_cta_level}/${run.trust_pacing.allowed_cta_level}, risk \`${run.trust_pacing.overload_risk}\``).join("\n")}
`;
}

function renderCtaReport(runs) {
  const distribution = runs.reduce((acc, run) => {
    const cta = run.runtime_state.cta_pacing.selected_cta_type;
    acc[cta] = (acc[cta] || 0) + 1;
    return acc;
  }, {});
  return `${reportHeader("CTA Pacing Report")}
## CTA Distribution

${Object.entries(distribution).map(([cta, count]) => `- \`${cta}\`: ${count}`).join("\n")}

## Recent CTA Memory At Final Run

\`\`\`json
${JSON.stringify(runs.at(-1).runtime_state.cta_pacing, null, 2)}
\`\`\`
`;
}

function renderQualityReport(runs) {
  return `${reportHeader("Runtime Quality Report")}
## Score Summary

- Average final quality: ${average(runs.map((run) => run.quality_score.final_quality_score))}
- Average author voice score: ${average(runs.map((run) => run.quality_score.author_voice_score))}
- Average base production score: ${average(runs.map((run) => run.quality_score.base_production_score))}

## Example Runtime Output Structure

\`\`\`json
${runtimeOutputExample(runs[0])}
\`\`\`
`;
}

async function writeReports(runs, cognition) {
  const reports = {};
  reports.runtime_execution_report = await writeReport("runtime_execution_report.md", renderExecutionReport(runs));
  reports.cognition_state_report = await writeReport("cognition_state_report.md", renderCognitionReport(runs, cognition));
  reports.runtime_validation_report = await writeReport("runtime_validation_report.md", renderValidationReport(runs));
  reports.narrative_continuity_report = await writeReport("narrative_continuity_report.md", renderNarrativeReport(runs));
  reports.repetition_risk_report = await writeReport("repetition_risk_report.md", renderRepetitionReport(runs));
  reports.trust_pacing_report = await writeReport("trust_pacing_report.md", renderTrustReport(runs));
  reports.CTA_pacing_report = await writeReport("CTA_pacing_report.md", renderCtaReport(runs));
  reports.runtime_quality_report = await writeReport("runtime_quality_report.md", renderQualityReport(runs));
  return reports;
}

async function simulateUnifiedRuntime() {
  const runs = [];
  const previousPacks = [];

  await loadPersistentCognition(EXPERT_ID, { root: ROOT, initialize: true });

  for (let day = 1; day <= 30; day += 1) {
    const result = await runUnifiedGenerationRuntime({
      ...simulationInput(day),
      previousPacks,
    }, {
      root: ROOT,
      persist: true,
      initializeStorage: true,
      contextLimit: 6,
    });
    previousPacks.push(result.production_pack);
    runs.push(result);
  }

  const cognition = await loadPersistentCognition(EXPERT_ID, { root: ROOT, initialize: true });
  const reports = await writeReports(runs, cognition);
  const summary = {
    simulated_days: runs.length,
    average_quality: average(runs.map((run) => run.quality_score.final_quality_score)),
    generated_reports: Object.values(reports).map(rel),
    storage_paths: Object.values(runs.at(-1).cognition_loading.storage_paths),
    example_runtime_state: runs[0].runtime_state,
    example_generation_orchestration_flow: runs[0].orchestration_flow,
    example_cognition_loading: runs[0].cognition_loading,
    example_repetition_validation: runs.find((run) => run.validation.repetition_risk.same_topic_recent_count > 0)?.validation.repetition_risk || runs[0].validation.repetition_risk,
    example_trust_pacing_validation: runs.find((run) => run.trust_pacing.overload_risk !== "low")?.trust_pacing || runs[0].trust_pacing,
    example_runtime_output_structure: runs[0].final_runtime_output,
    warnings: runs.flatMap((run) => asArray(run.validation.warnings)),
    safety_confirmation: {
      no_deploy: true,
      no_telegram_runtime_mutation: true,
      no_faiss_or_index_mutation: true,
      no_external_apis: true,
      no_auto_posting: true,
    },
  };
  return { runs, reports, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  simulateUnifiedRuntime()
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
  simulateUnifiedRuntime,
  simulationInput,
};
