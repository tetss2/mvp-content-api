import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";
import { resetCampaignState } from "../runtime/campaign-memory/campaign-state-store.js";
import { resetStrategicState } from "../runtime/strategy/strategic-memory-store.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-strategy");
const DEFAULT_EXPERT_ID = "dinara";

const REQUESTS = [
  { topic: "стыд и близость", ctaType: "low_pressure_cta", audienceState: "warming", format: "post" },
  { topic: "страх желания", ctaType: "save_share_cta", audienceState: "warming", format: "post" },
  { topic: "почему тело закрывается", ctaType: "educational_cta", audienceState: "warming", format: "carousel_script" },
  { topic: "как говорить о сексе без давления", ctaType: "low_pressure_cta", audienceState: "warming", format: "post" },
  { topic: "женское желание и усталость", ctaType: "emotional_cta", audienceState: "warming", format: "post" },
  { topic: "границы в близости", ctaType: "trust_cta", audienceState: "warming", format: "answer" },
  { topic: "стыд после конфликта", ctaType: "low_pressure_cta", audienceState: "warming", format: "post" },
  { topic: "почему пропадает желание", ctaType: "save_share_cta", audienceState: "warming", format: "reel_script" },
  { topic: "безопасность в разговоре с партнером", ctaType: "educational_cta", audienceState: "warming", format: "post" },
  { topic: "как возвращать контакт с телом", ctaType: "low_pressure_cta", audienceState: "trusting", format: "carousel_script" },
  { topic: "желание и тревога", ctaType: "emotional_cta", audienceState: "trusting", format: "post" },
  { topic: "когда нужна консультация сексолога", ctaType: "consultation_cta", audienceState: "trusting", format: "post" },
  { topic: "как не давить на себя в близости", ctaType: "save_share_cta", audienceState: "trusting", format: "answer" },
  { topic: "стыд и близость без давления", ctaType: "low_pressure_cta", audienceState: "trusting", format: "post" },
  { topic: "интимность после паузы", ctaType: "trust_cta", audienceState: "trusting", format: "post" },
  { topic: "как просить о нежности", ctaType: "emotional_cta", audienceState: "trusting", format: "post" },
  { topic: "сексологическая консультация без стыда", ctaType: "consultation_cta", audienceState: "trusting", format: "post" },
  { topic: "отношения и телесная безопасность", ctaType: "educational_cta", audienceState: "trusting", format: "carousel_script" },
  { topic: "как замечать свои границы", ctaType: "low_pressure_cta", audienceState: "trusting", format: "post" },
  { topic: "мягкий путь к разговору о сексе", ctaType: "save_share_cta", audienceState: "trusting", format: "post" },
];

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function summarizeRun(result) {
  const strategy = result.strategic_brain || {};
  const signals = strategy.adapter_signals || {};
  return {
    run_id: result.runtime?.run_id,
    topic: result.request?.topic,
    cta_type: result.request?.ctaType,
    audience_state: result.request?.audienceState,
    strategic_brain_score: signals.strategic_brain_score,
    trust_level: signals.trust_level,
    authority_level: signals.authority_level,
    emotional_warmth_level: signals.emotional_warmth_level,
    audience_fatigue: signals.audience_fatigue,
    conversion_pressure: signals.conversion_pressure,
    intimacy_pacing: signals.intimacy_pacing,
    overselling_risk: signals.overselling_risk,
    current_narrative_loop: signals.current_narrative_loop,
    strategic_next_move: signals.strategic_next_move,
    trust_retention_probability: signals.trust_retention_probability,
    state_run_count: strategy.strategic_state_run_count,
    warnings: strategy.warnings || [],
  };
}

function aggregateSimulation(runs) {
  const last = runs.at(-1) || {};
  const maxOversellingRisk = Math.max(...runs.map((run) => Number(run.overselling_risk || 0)));
  const maxConversionPressure = Math.max(...runs.map((run) => Number(run.conversion_pressure || 0)));
  const narrativeLoopCounts = runs.reduce((acc, run) => {
    acc[run.current_narrative_loop] = (acc[run.current_narrative_loop] || 0) + 1;
    return acc;
  }, {});
  return {
    simulated_requests: runs.length,
    final_strategic_brain_score: last.strategic_brain_score,
    final_trust_level: last.trust_level,
    final_authority_level: last.authority_level,
    final_emotional_warmth_level: last.emotional_warmth_level,
    final_audience_fatigue: last.audience_fatigue,
    final_conversion_pressure: last.conversion_pressure,
    final_intimacy_pacing: last.intimacy_pacing,
    final_overselling_risk: last.overselling_risk,
    max_overselling_risk: maxOversellingRisk,
    max_conversion_pressure: maxConversionPressure,
    final_narrative_loop: last.current_narrative_loop,
    final_strategic_next_move: last.strategic_next_move,
    final_trust_retention_probability: last.trust_retention_probability,
    narrative_loop_counts: narrativeLoopCounts,
    trust_evolution: runs.map((run) => run.trust_level),
    authority_evolution: runs.map((run) => run.authority_level),
    conversion_pressure_evolution: runs.map((run) => run.conversion_pressure),
    overselling_evolution: runs.map((run) => run.overselling_risk),
    warning_count: runs.reduce((sum, run) => sum + run.warnings.length, 0),
  };
}

function rows(runs, fields) {
  return runs.map((run, index) => `| ${index + 1} | ${fields.map((field) => run[field]).join(" | ")} |`).join("\n");
}

function renderStrategicBrainReport(summary, runs) {
  return `# Strategic Brain Report

Generated: ${new Date().toISOString()}

- Simulated requests: ${summary.simulated_requests}
- Final strategic brain score: ${summary.final_strategic_brain_score}
- Final trust level: ${summary.final_trust_level}
- Final authority level: ${summary.final_authority_level}
- Final conversion pressure: ${summary.final_conversion_pressure}
- Final overselling risk: ${summary.final_overselling_risk}
- Final strategic next move: \`${summary.final_strategic_next_move}\`

## Run Summary

| # | topic | trust | authority | warmth | conversion | overselling | loop | next |
| - | - | - | - | - | - | - | - | - |
${rows(runs, ["topic", "trust_level", "authority_level", "emotional_warmth_level", "conversion_pressure", "overselling_risk", "current_narrative_loop", "strategic_next_move"])}
`;
}

function renderTrustReport(summary, runs) {
  return `# Trust Building Report

Generated: ${new Date().toISOString()}

- Final trust level: ${summary.final_trust_level}
- Trust retention probability: ${summary.final_trust_retention_probability}
- Trust evolution: \`${summary.trust_evolution.join(" -> ")}\`

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: trust ${run.trust_level}, retention ${run.trust_retention_probability}`).join("\n")}
`;
}

function renderAuthorityReport(summary, runs) {
  return `# Authority Pacing Report

Generated: ${new Date().toISOString()}

- Final authority level: ${summary.final_authority_level}
- Authority evolution: \`${summary.authority_evolution.join(" -> ")}\`

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: authority ${run.authority_level}, trust ${run.trust_level}`).join("\n")}
`;
}

function renderEmotionalReport(summary, runs) {
  return `# Emotional Funnel Report

Generated: ${new Date().toISOString()}

- Final emotional warmth: ${summary.final_emotional_warmth_level}
- Final intimacy pacing: ${summary.final_intimacy_pacing}
- Final audience fatigue: ${summary.final_audience_fatigue}

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: warmth ${run.emotional_warmth_level}, intimacy ${run.intimacy_pacing}`).join("\n")}
`;
}

function renderConversionReport(summary, runs) {
  return `# Conversion Pressure Report

Generated: ${new Date().toISOString()}

- Final conversion pressure: ${summary.final_conversion_pressure}
- Max conversion pressure: ${summary.max_conversion_pressure}
- Final overselling risk: ${summary.final_overselling_risk}
- Max overselling risk: ${summary.max_overselling_risk}
- Overselling evolution: \`${summary.overselling_evolution.join(" -> ")}\`

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: pressure ${run.conversion_pressure}, overselling ${run.overselling_risk}, next \`${run.strategic_next_move}\``).join("\n")}
`;
}

function renderPositioningReport(summary, runs) {
  return `# Positioning Report

Generated: ${new Date().toISOString()}

- Final authority level: ${summary.final_authority_level}
- Final trust level: ${summary.final_trust_level}

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: authority ${run.authority_level}, strategic score ${run.strategic_brain_score}`).join("\n")}
`;
}

function renderNarrativeLoopReport(summary, runs) {
  return `# Narrative Loop Report

Generated: ${new Date().toISOString()}

- Final narrative loop: ${summary.final_narrative_loop}
- Final strategic next move: ${summary.final_strategic_next_move}
- Loop counts: \`${JSON.stringify(summary.narrative_loop_counts)}\`

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: loop ${run.current_narrative_loop}, next \`${run.strategic_next_move}\``).join("\n")}
`;
}

async function writeReports(summary, runs) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "strategic_brain_report.md"), renderStrategicBrainReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "trust_building_report.md"), renderTrustReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "authority_pacing_report.md"), renderAuthorityReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "emotional_funnel_report.md"), renderEmotionalReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "conversion_pressure_report.md"), renderConversionReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "positioning_report.md"), renderPositioningReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "narrative_loop_report.md"), renderNarrativeLoopReport(summary, runs), "utf8");
}

async function simulateStrategicBrain({ reset = true } = {}) {
  if (reset) {
    await resetCampaignState(DEFAULT_EXPERT_ID, { root: ROOT });
    await resetStrategicState(DEFAULT_EXPERT_ID, { root: ROOT });
  }

  const runs = [];
  for (const [index, request] of REQUESTS.entries()) {
    const result = await runRuntimeGenerationAdapter({
      expertId: DEFAULT_EXPERT_ID,
      userRequest: request.topic,
      topic: request.topic,
      intent: index === 11 || index === 16 ? "sales_post" : "educational_post",
      platform: index % 3 === 0 ? "telegram_longread" : "instagram_post",
      length: index % 5 === 0 ? "long" : "medium",
      format: request.format,
      tone: "expert_warm",
      audienceState: request.audienceState,
      ctaType: request.ctaType,
      llmExecutionMode: "dry_run_prompt_only",
    }, {
      persistRuntime: false,
      persistIdentity: false,
      persistCampaignMemory: true,
      persistStrategicBrain: true,
      initializeStorage: true,
      llmExecutionMode: "dry_run_prompt_only",
      sandboxProvider: "mock",
      allowExternalApi: false,
    });
    runs.push(summarizeRun(result));
  }

  const summary = aggregateSimulation(runs);
  await writeReports(summary, runs);
  return {
    ...summary,
    reportDir: rel(REPORT_DIR),
    final_run: runs.at(-1),
    local_only: true,
    admin_only: true,
    production_mutation: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  simulateStrategicBrain()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  REQUESTS,
  simulateStrategicBrain,
};
