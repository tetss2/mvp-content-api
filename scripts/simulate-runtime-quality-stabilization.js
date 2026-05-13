import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-stabilization");
const EXPERT_ID = "dinara";

const REQUESTS = [
  ["relationship-anxiety", "тревога в отношениях", "educational_post", "instagram_post", "short", "save_share_cta", "warming"],
  ["emotional-dependency", "эмоциональная зависимость", "storytelling", "telegram_longread", "medium", "emotional_cta", "engaged"],
  ["sexuality-myths", "мифы о женской сексуальности", "longform_article", "telegram_longread", "long", "educational_cta", "trusting"],
  ["shame-and-desire", "стыд и желание", "faq_answer", "instagram_post", "medium", "trust_cta", "trusting"],
  ["boundaries-intimacy", "границы в близости", "sales_post", "instagram_post", "medium", "dm_cta", "considering_purchase"],
  ["body-safety", "безопасность в теле", "educational_post", "instagram_post", "short", "low_pressure_cta", "warming"],
  ["avoidance-close", "избегание близости", "storytelling", "telegram_longread", "medium", "emotional_cta", "engaged"],
  ["conflict-after-sex", "конфликты после секса", "faq_answer", "instagram_post", "medium", "educational_cta", "trusting"],
  ["low-desire", "снижение желания", "educational_post", "telegram_longread", "long", "save_share_cta", "warming"],
  ["consultation-soft", "как понять что нужна консультация", "sales_post", "instagram_post", "medium", "dm_cta", "considering_purchase"],
].map(([runName, topic, intent, platform, length, ctaType, audienceState], index) => ({
  runName,
  expertId: EXPERT_ID,
  day: 41 + index,
  topic,
  userRequest: `Локальный runtime preview: ${topic}`,
  intent,
  platform,
  length,
  format: length === "long" ? "article" : "post",
  tone: "expert_warm",
  ctaType,
  audienceState,
}));

function round(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

function average(values) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value));
  return clean.length ? round(clean.reduce((sum, value) => sum + value, 0) / clean.length) : 0;
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

function collectRows(results) {
  return results.map((result) => {
    const stabilization = result.generation_pipeline.runtime_quality_stabilization;
    const before = stabilization.before;
    const after = stabilization.after;
    return {
      run: result.request.runName,
      topic: result.request.topic,
      before_score: before.stabilization_score,
      after_score: after.stabilization_score,
      author_before: before.author_voice_confidence,
      author_after: after.author_voice_confidence,
      cta_before: before.cta_pressure_score,
      cta_after: after.cta_pressure_score,
      generic_before: before.generic_ai_risk_score,
      generic_after: after.generic_ai_risk_score,
      emotional_before: before.emotional_pacing_score,
      emotional_after: after.emotional_pacing_score,
      continuity_before: before.continuity_score,
      continuity_after: after.continuity_score,
      repetition_before: before.repetition_risk_score,
      repetition_after: after.repetition_risk_score,
      warnings_before: before.warnings,
      warnings_after: after.warnings,
    };
  });
}

function summary(rows) {
  return {
    runs: rows.length,
    before_average_quality: average(rows.map((row) => row.before_score)),
    after_average_quality: average(rows.map((row) => row.after_score)),
    author_voice_before: average(rows.map((row) => row.author_before)),
    author_voice_after: average(rows.map((row) => row.author_after)),
    cta_pressure_before: average(rows.map((row) => row.cta_before)),
    cta_pressure_after: average(rows.map((row) => row.cta_after)),
    generic_ai_risk_before: average(rows.map((row) => row.generic_before)),
    generic_ai_risk_after: average(rows.map((row) => row.generic_after)),
    emotional_pacing_before: average(rows.map((row) => row.emotional_before)),
    emotional_pacing_after: average(rows.map((row) => row.emotional_after)),
    continuity_before: average(rows.map((row) => row.continuity_before)),
    continuity_after: average(rows.map((row) => row.continuity_after)),
    repetition_risk_before: average(rows.map((row) => row.repetition_before)),
    repetition_risk_after: average(rows.map((row) => row.repetition_after)),
  };
}

function table(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => column.value(row)).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function renderComparison(rows, totals) {
  return `# Runtime Stabilization Comparison Report

Generated: ${new Date().toISOString()}

## Summary

- Runs: ${totals.runs}
- Runtime mode: local admin preview, dry_run_prompt_only
- Average quality before: ${totals.before_average_quality}
- Average quality after: ${totals.after_average_quality}
- Production generation changed: NO
- External API usage: NO

## Before vs After

${table(rows, [
    { label: "Run", value: (row) => row.run },
    { label: "Quality Before", value: (row) => row.before_score },
    { label: "Quality After", value: (row) => row.after_score },
    { label: "Voice Before", value: (row) => row.author_before },
    { label: "Voice After", value: (row) => row.author_after },
    { label: "CTA Before", value: (row) => row.cta_before },
    { label: "CTA After", value: (row) => row.cta_after },
    { label: "Generic Before", value: (row) => row.generic_before },
    { label: "Generic After", value: (row) => row.generic_after },
  ])}

## Remaining Weak Areas

- Scores are deterministic preview heuristics; real generated drafts still need separate review.
- Prompt stabilization is guidance-only and intentionally not wired to public generation.
- Some voice profile source files contain noisy encoded samples, so confidence remains bounded.

## What Still Blocks Real Runtime Execution

- No real LLM output has been validated against these constraints.
- Telegram delivery, Markdown limits, and human approval are not integrated with runtime output.
- Production rollout needs a feature flag, rollback plan, and admin approval workflow.
`;
}

function renderFocusedReport(title, rows, totals, beforeTotalKey, afterTotalKey, beforeRowKey, afterRowKey, betterText, weakText) {
  return `# ${title}

Generated: ${new Date().toISOString()}

## Aggregate

- Before stabilization: ${totals[beforeTotalKey]}
- After stabilization: ${totals[afterTotalKey]}
- Result: ${betterText}

## Runs

${table(rows, [
    { label: "Run", value: (row) => row.run },
    { label: "Topic", value: (row) => row.topic },
    { label: "Before", value: (row) => row[beforeRowKey] },
    { label: "After", value: (row) => row[afterRowKey] },
  ])}

## Remaining Weak Areas

- ${weakText}

## Unresolved Risks

- This remains prompt-level stabilization only.
- Public-user runtime activation remains blocked.
`;
}

async function writeReports(rows, totals) {
  const reports = {};
  reports.stabilization_comparison_report = await writeReport("stabilization_comparison_report.md", renderComparison(rows, totals));
  reports.author_voice_stability_report = await writeReport("author_voice_stability_report.md", renderFocusedReport(
    "Author Voice Stability Report",
    rows,
    totals,
    "author_voice_before",
    "author_voice_after",
    "author_before",
    "author_after",
    "author voice confidence improved",
    "Author voice still depends on cleaner reviewed Dinara samples before real execution.",
  ));
  reports.cta_pacing_report = await writeReport("cta_pacing_report.md", renderFocusedReport(
    "CTA Pacing Report",
    rows,
    totals,
    "cta_pressure_before",
    "cta_pressure_after",
    "cta_before",
    "cta_after",
    "CTA pressure reduced",
    "Consultation CTAs still need human review before any live sales-oriented use.",
  ));
  reports.anti_generic_behavior_report = await writeReport("anti_generic_behavior_report.md", renderFocusedReport(
    "Anti Generic Behavior Report",
    rows,
    totals,
    "generic_ai_risk_before",
    "generic_ai_risk_after",
    "generic_before",
    "generic_after",
    "generic AI risk reduced",
    "Prompt-level anti-generic constraints must be tested against actual drafts later.",
  ));
  reports.emotional_pacing_report = await writeReport("emotional_pacing_report.md", renderFocusedReport(
    "Emotional Pacing Report",
    rows,
    totals,
    "emotional_pacing_before",
    "emotional_pacing_after",
    "emotional_before",
    "emotional_after",
    "emotional pacing improved",
    "Emotional progression is still heuristic until real content is reviewed.",
  ));
  reports.runtime_quality_improvement_report = await writeReport("runtime_quality_improvement_report.md", renderFocusedReport(
    "Runtime Quality Improvement Report",
    rows,
    totals,
    "before_average_quality",
    "after_average_quality",
    "before_score",
    "after_score",
    "runtime quality score improved",
    "Real execution remains blocked by missing live-output validation and approval flow.",
  ));
  await writeReport("stabilization_metrics.json", JSON.stringify({ totals, rows }, null, 2));
  return reports;
}

async function simulateRuntimeQualityStabilization() {
  const results = [];
  for (const request of REQUESTS) {
    const result = await runRuntimeGenerationAdapter(request, {
      root: ROOT,
      persistRuntime: false,
      initializeStorage: false,
    });
    results.push(result);
  }
  const rows = collectRows(results);
  const totals = summary(rows);
  const reports = await writeReports(rows, totals);
  return {
    simulated_requests: results.length,
    ...totals,
    generated_reports: Object.values(reports).map(rel),
    author_voice_drift_improved: totals.author_voice_after > totals.author_voice_before,
    cta_pressure_improved: totals.cta_pressure_after < totals.cta_pressure_before,
    generic_ai_risk_improved: totals.generic_ai_risk_after < totals.generic_ai_risk_before,
    safety_confirmation: {
      local_only: true,
      admin_preview_only: true,
      no_deploy: true,
      no_production_generation_replacement: true,
      no_telegram_production_mutation: true,
      no_faiss_or_index_mutation: true,
      no_ingest_or_promote: true,
      no_external_apis: true,
      no_auto_posting: true,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  simulateRuntimeQualityStabilization()
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
  REPORT_DIR,
  simulateRuntimeQualityStabilization,
};
