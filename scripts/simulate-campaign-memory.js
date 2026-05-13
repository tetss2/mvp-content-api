import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";
import { resetCampaignState } from "../runtime/campaign-memory/campaign-state-store.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-campaign-memory");
const DEFAULT_EXPERT_ID = "dinara";

const REQUESTS = [
  { topic: "стыд и близость", format: "post", ctaType: "low_pressure_cta", platform: "telegram_longread" },
  { topic: "страх желания", format: "post", ctaType: "save_share_cta", platform: "instagram_post" },
  { topic: "как говорить о сексе без давления", format: "carousel_script", ctaType: "educational_cta", platform: "instagram_carousel" },
  { topic: "почему тело закрывается в близости", format: "post", ctaType: "low_pressure_cta", platform: "telegram_longread" },
  { topic: "женское желание и усталость", format: "post", ctaType: "emotional_cta", platform: "instagram_post" },
  { topic: "стыд и близость", format: "answer", ctaType: "low_pressure_cta", platform: "telegram_longread" },
  { topic: "границы в отношениях", format: "post", ctaType: "trust_cta", platform: "telegram_longread" },
  { topic: "почему пропадает желание", format: "reel_script", ctaType: "save_share_cta", platform: "instagram_reels" },
  { topic: "безопасность в разговоре с партнером", format: "post", ctaType: "low_pressure_cta", platform: "instagram_post" },
  { topic: "стыд после конфликта", format: "post", ctaType: "emotional_cta", platform: "telegram_longread" },
  { topic: "как возвращать контакт с телом", format: "carousel_script", ctaType: "educational_cta", platform: "instagram_carousel" },
  { topic: "желание и тревога", format: "post", ctaType: "low_pressure_cta", platform: "telegram_longread" },
  { topic: "когда нужна консультация сексолога", format: "post", ctaType: "consultation_cta", platform: "instagram_post" },
  { topic: "как не давить на себя в близости", format: "answer", ctaType: "save_share_cta", platform: "telegram_longread" },
  { topic: "стыд и близость без давления", format: "post", ctaType: "low_pressure_cta", platform: "instagram_post" },
];

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function summarizeRun(result) {
  const campaign = result.campaign_memory || {};
  const signals = campaign.adapter_signals || {};
  return {
    run_id: result.runtime?.run_id,
    topic: result.request?.topic,
    format: result.request?.format,
    cta_type: result.request?.ctaType,
    campaign_memory_score: signals.campaign_memory_score,
    topic_repetition_risk: signals.topic_repetition_risk,
    recent_topic_overlap: signals.recent_topic_overlap,
    cta_fatigue_level: signals.cta_fatigue_level,
    audience_fatigue_risk: signals.audience_fatigue_risk,
    narrative_arc_status: signals.narrative_arc_status,
    suggested_next_move: signals.suggested_next_move,
    format_variety: signals.format_variety,
    state_run_count: campaign.campaign_state_run_count,
    warnings: campaign.warnings || [],
  };
}

function aggregateSimulation(runs) {
  const last = runs.at(-1) || {};
  const ctaFatigueCounts = runs.reduce((acc, run) => {
    acc[run.cta_fatigue_level] = (acc[run.cta_fatigue_level] || 0) + 1;
    return acc;
  }, {});
  const audienceFatigueCounts = runs.reduce((acc, run) => {
    acc[run.audience_fatigue_risk] = (acc[run.audience_fatigue_risk] || 0) + 1;
    return acc;
  }, {});
  return {
    simulated_requests: runs.length,
    final_campaign_memory_score: last.campaign_memory_score,
    final_topic_repetition_risk: last.topic_repetition_risk,
    final_cta_fatigue_level: last.cta_fatigue_level,
    final_audience_fatigue_risk: last.audience_fatigue_risk,
    final_narrative_arc_status: last.narrative_arc_status,
    final_format_variety: last.format_variety,
    accumulated_topics: runs.map((run) => run.topic),
    accumulated_ctas: runs.map((run) => run.cta_type),
    cta_fatigue_counts: ctaFatigueCounts,
    audience_fatigue_counts: audienceFatigueCounts,
    warning_count: runs.reduce((sum, run) => sum + run.warnings.length, 0),
  };
}

function renderCampaignMemoryReport(summary, runs) {
  return `# Campaign Memory Report

Generated: ${new Date().toISOString()}

- Simulated requests: ${summary.simulated_requests}
- Final campaign memory score: ${summary.final_campaign_memory_score}
- Final topic repetition risk: ${summary.final_topic_repetition_risk}
- Final CTA fatigue level: ${summary.final_cta_fatigue_level}
- Final audience fatigue risk: ${summary.final_audience_fatigue_risk}
- Final narrative arc status: ${summary.final_narrative_arc_status}
- Final format variety: ${summary.final_format_variety}

## Run Summary

${runs.map((run, index) => `| ${index + 1} | ${run.topic} | ${run.format} | ${run.cta_type} | ${run.campaign_memory_score} | ${run.topic_repetition_risk} | ${run.cta_fatigue_level} | ${run.audience_fatigue_risk} | ${run.suggested_next_move} |`).join("\n")}
`;
}

function renderTopicHistoryReport(summary, runs) {
  return `# Topic History Report

Generated: ${new Date().toISOString()}

- Accumulated topics: ${summary.accumulated_topics.length}
- Final topic repetition risk: ${summary.final_topic_repetition_risk}

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: overlap ${run.recent_topic_overlap}, repetition risk ${run.topic_repetition_risk}`).join("\n")}
`;
}

function renderCtaFatigueReport(summary, runs) {
  return `# CTA Fatigue Report

Generated: ${new Date().toISOString()}

- Accumulated CTAs: ${summary.accumulated_ctas.length}
- Final CTA fatigue level: ${summary.final_cta_fatigue_level}

${runs.map((run, index) => `- ${index + 1}. ${run.cta_type}: fatigue ${run.cta_fatigue_level}`).join("\n")}
`;
}

function renderNarrativeArcReport(summary, runs) {
  return `# Narrative Arc Report

Generated: ${new Date().toISOString()}

- Final narrative arc status: ${summary.final_narrative_arc_status}

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: ${run.narrative_arc_status}, next \`${run.suggested_next_move}\``).join("\n")}
`;
}

function renderAudienceFatigueReport(summary, runs) {
  return `# Audience Fatigue Report

Generated: ${new Date().toISOString()}

- Final audience fatigue risk: ${summary.final_audience_fatigue_risk}
- Audience fatigue counts: \`${JSON.stringify(summary.audience_fatigue_counts)}\`

${runs.map((run, index) => `- ${index + 1}. ${run.topic}: audience fatigue ${run.audience_fatigue_risk}, CTA fatigue ${run.cta_fatigue_level}`).join("\n")}
`;
}

function renderSequenceReport(summary, runs) {
  const formats = runs.reduce((acc, run) => {
    acc[run.format] = (acc[run.format] || 0) + 1;
    return acc;
  }, {});
  return `# Campaign Sequence Report

Generated: ${new Date().toISOString()}

- Final campaign memory score: ${summary.final_campaign_memory_score}
- Final format variety: ${summary.final_format_variety}
- Format distribution: \`${JSON.stringify(formats)}\`

${runs.map((run, index) => `- ${index + 1}. ${run.format}: score ${run.campaign_memory_score}, next \`${run.suggested_next_move}\``).join("\n")}
`;
}

async function writeReports(summary, runs) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "campaign_memory_report.md"), renderCampaignMemoryReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "topic_history_report.md"), renderTopicHistoryReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "cta_fatigue_report.md"), renderCtaFatigueReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "narrative_arc_report.md"), renderNarrativeArcReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "audience_fatigue_report.md"), renderAudienceFatigueReport(summary, runs), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "campaign_sequence_report.md"), renderSequenceReport(summary, runs), "utf8");
}

async function simulateCampaignMemory({ reset = true } = {}) {
  if (reset) await resetCampaignState(DEFAULT_EXPERT_ID, { root: ROOT });
  const runs = [];
  for (const [index, request] of REQUESTS.entries()) {
    const result = await runRuntimeGenerationAdapter({
      expertId: DEFAULT_EXPERT_ID,
      userRequest: request.topic,
      topic: request.topic,
      intent: index % 5 === 2 ? "educational_post" : "educational_post",
      platform: request.platform,
      length: index % 4 === 0 ? "long" : "medium",
      format: request.format,
      tone: "expert_warm",
      audienceState: index > 10 ? "trusting" : "warming",
      ctaType: request.ctaType,
      llmExecutionMode: "dry_run_prompt_only",
    }, {
      persistRuntime: false,
      persistIdentity: false,
      persistCampaignMemory: true,
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
  simulateCampaignMemory()
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
  simulateCampaignMemory,
};
