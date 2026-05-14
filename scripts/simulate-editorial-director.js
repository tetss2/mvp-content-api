import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";
import { resetEditorialState } from "../runtime/editorial/editorial-memory-store.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-editorial");
const DEFAULT_EXPERT_ID = "dinara";

const TOPICS = [
  "стыд и близость", "желание и тревога", "границы в отношениях", "как говорить о сексе спокойно",
  "усталость и тело", "безопасность рядом с партнером", "страх быть отвергнутой", "почему пропадает желание",
  "нежность без давления", "конфликт и восстановление контакта", "зачем нужна консультация", "интимность после паузы",
  "как просить о поддержке", "женское желание и вина", "разговор о фантазиях", "телесная чувствительность",
  "стыд после ссоры", "когда хочется дистанции", "ритм доверия в паре", "мягкий путь к разговору",
  "сексуальность и самокритика", "что делать с напряжением", "как возвращать интерес", "партнер не слышит",
  "право на медленность", "желание без обязанности", "как не давить на себя", "сексолог без стыда",
  "практика телесного контакта", "новый взгляд на близость",
];

const FORMATS = ["post", "story", "reel_script", "long_form_post", "post", "story"];
const CTAS = ["low_pressure_cta", "save_share_cta", "educational_cta", "emotional_cta", "trust_cta", "consultation_cta"];

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function summarizeRun(result) {
  const editorial = result.editorial_director || {};
  const signals = editorial.adapter_signals || {};
  return {
    run_id: result.runtime?.run_id,
    topic: result.request?.topic,
    format: result.request?.format,
    cta_type: result.request?.ctaType,
    editorial_director_score: signals.editorial_director_score,
    audience_temperature: signals.audience_temperature_score,
    audience_temperature_label: signals.current_audience_temperature,
    attention_decay: editorial.attention_loop?.attention_decay,
    attention_stability: editorial.attention_loop?.attention_loop_stability,
    storytelling_continuity: editorial.storytelling?.storytelling_continuity,
    saturation_risk: signals.saturation_risk,
    fatigue_risk: signals.fatigue_risk,
    freshness: signals.editorial_freshness,
    narrative_stage: editorial.storytelling?.narrative_progression_stage,
    current_arc: editorial.storytelling?.current_content_arc,
    category: editorial.content_balance?.selected_category,
    recommended_next_format: signals.recommended_content_format,
    recommended_next_narrative_move: signals.recommended_next_narrative_move,
    format_distribution_quality: editorial.format_orchestration?.format_distribution_quality,
    category_balance: signals.content_category_balancing_signals,
    state_run_count: editorial.editorial_state_run_count,
    warnings: editorial.warnings || [],
  };
}

function countBy(runs, key) {
  return runs.reduce((acc, run) => {
    acc[run[key]] = (acc[run[key]] || 0) + 1;
    return acc;
  }, {});
}

function aggregateSimulation(runs) {
  const last = runs.at(-1) || {};
  return {
    simulated_requests: runs.length,
    final_editorial_director_score: last.editorial_director_score,
    final_audience_temperature: last.audience_temperature,
    final_audience_temperature_label: last.audience_temperature_label,
    final_attention_decay: last.attention_decay,
    final_attention_stability: last.attention_stability,
    final_storytelling_continuity: last.storytelling_continuity,
    final_saturation_risk: last.saturation_risk,
    final_fatigue_risk: last.fatigue_risk,
    final_freshness: last.freshness,
    final_narrative_stage: last.narrative_stage,
    final_current_arc: last.current_arc,
    final_recommended_next_format: last.recommended_next_format,
    final_recommended_next_narrative_move: last.recommended_next_narrative_move,
    max_saturation_risk: Math.max(...runs.map((run) => Number(run.saturation_risk || 0))),
    max_fatigue_risk: Math.max(...runs.map((run) => Number(run.fatigue_risk || 0))),
    min_freshness: Math.min(...runs.map((run) => Number(run.freshness || 1))),
    format_distribution: countBy(runs, "format"),
    category_distribution: countBy(runs, "category"),
    narrative_stage_distribution: countBy(runs, "narrative_stage"),
    audience_temperature_evolution: runs.map((run) => run.audience_temperature),
    attention_decay_evolution: runs.map((run) => run.attention_decay),
    saturation_evolution: runs.map((run) => run.saturation_risk),
    freshness_evolution: runs.map((run) => run.freshness),
    warning_count: runs.reduce((sum, run) => sum + run.warnings.length, 0),
    final_run: last,
  };
}

function table(runs, fields) {
  return runs.map((run, index) => `| ${index + 1} | ${fields.map((field) => run[field]).join(" | ")} |`).join("\n");
}

function report(title, lines) {
  return `# ${title}\n\nGenerated: ${new Date().toISOString()}\n\n${lines}\n`;
}

async function writeReports(summary, runs) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "editorial_director_report.md"), report("Editorial Director Report", [
    `- Simulated requests: ${summary.simulated_requests}`,
    `- Final editorial score: ${summary.final_editorial_director_score}`,
    `- Final next format: ${summary.final_recommended_next_format}`,
    `- Final next narrative move: ${summary.final_recommended_next_narrative_move}`,
    "",
    "| # | topic | category | format | score | next format | next move |",
    "| - | - | - | - | - | - | - |",
    table(runs, ["topic", "category", "format", "editorial_director_score", "recommended_next_format", "recommended_next_narrative_move"]),
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "storytelling_report.md"), report("Storytelling Report", [
    `- Final storytelling continuity: ${summary.final_storytelling_continuity}`,
    `- Final narrative stage: ${summary.final_narrative_stage}`,
    `- Narrative stage distribution: \`${JSON.stringify(summary.narrative_stage_distribution)}\``,
    "",
    table(runs, ["topic", "current_arc", "narrative_stage", "storytelling_continuity"]),
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "audience_temperature_report.md"), report("Audience Temperature Report", [
    `- Final audience temperature: ${summary.final_audience_temperature}`,
    `- Label: ${summary.final_audience_temperature_label}`,
    `- Evolution: \`${summary.audience_temperature_evolution.join(" -> ")}\``,
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "editorial_balance_report.md"), report("Editorial Balance Report", [
    `- Category distribution: \`${JSON.stringify(summary.category_distribution)}\``,
    `- Format distribution: \`${JSON.stringify(summary.format_distribution)}\``,
    "",
    table(runs, ["topic", "category", "format", "format_distribution_quality"]),
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "attention_loop_report.md"), report("Attention Loop Report", [
    `- Final attention decay: ${summary.final_attention_decay}`,
    `- Final attention stability: ${summary.final_attention_stability}`,
    `- Attention decay evolution: \`${summary.attention_decay_evolution.join(" -> ")}\``,
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "format_orchestration_report.md"), report("Format Orchestration Report", [
    `- Final recommended next format: ${summary.final_recommended_next_format}`,
    `- Format distribution: \`${JSON.stringify(summary.format_distribution)}\``,
    "",
    table(runs, ["topic", "format", "recommended_next_format", "format_distribution_quality"]),
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "freshness_report.md"), report("Freshness Report", [
    `- Final freshness: ${summary.final_freshness}`,
    `- Minimum freshness: ${summary.min_freshness}`,
    `- Freshness evolution: \`${summary.freshness_evolution.join(" -> ")}\``,
  ].join("\n")), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "narrative_timeline_report.md"), report("Narrative Timeline Report", [
    `- Final current arc: ${summary.final_current_arc}`,
    `- Final narrative stage: ${summary.final_narrative_stage}`,
    "",
    "| # | topic | temperature | attention decay | saturation | freshness | stage |",
    "| - | - | - | - | - | - | - |",
    table(runs, ["topic", "audience_temperature", "attention_decay", "saturation_risk", "freshness", "narrative_stage"]),
  ].join("\n")), "utf8");
}

async function simulateEditorialDirector({ reset = true } = {}) {
  if (reset) {
    await resetEditorialState(DEFAULT_EXPERT_ID, { root: ROOT });
  }

  const runs = [];
  for (let index = 0; index < TOPICS.length; index += 1) {
    const format = FORMATS[index % FORMATS.length];
    const result = await runRuntimeGenerationAdapter({
      expertId: DEFAULT_EXPERT_ID,
      userRequest: TOPICS[index],
      topic: TOPICS[index],
      intent: index % 11 === 10 ? "sales_post" : index % 4 === 0 ? "therapeutic_case" : "educational_post",
      platform: format === "reel_script" || format === "story" ? "instagram_reels" : "telegram_longread",
      length: format === "long_form_post" ? "long" : "medium",
      format,
      tone: "expert_warm",
      audienceState: index < 10 ? "warming" : "trusting",
      ctaType: CTAS[index % CTAS.length],
      llmExecutionMode: "dry_run_prompt_only",
    }, {
      persistRuntime: false,
      persistIdentity: false,
      persistCampaignMemory: false,
      persistStrategicBrain: false,
      persistEditorialDirector: true,
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
    local_only: true,
    admin_only: true,
    production_mutation: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  simulateEditorialDirector()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  TOPICS,
  simulateEditorialDirector,
};
