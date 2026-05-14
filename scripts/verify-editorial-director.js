import { promises as fs } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { simulateEditorialDirector } from "./simulate-editorial-director.js";

const ROOT = process.cwd();
const CHECK_REPORT_PATH = path.join(ROOT, "reports", "checks", "editorial_director_verification_report.md");

const REQUIRED_FILES = [
  "runtime/editorial/editorial-director.js",
  "runtime/editorial/editorial-calendar-engine.js",
  "runtime/editorial/content-balance-engine.js",
  "runtime/editorial/format-orchestrator.js",
  "runtime/editorial/storytelling-engine.js",
  "runtime/editorial/editorial-pacing-engine.js",
  "runtime/editorial/attention-loop-engine.js",
  "runtime/editorial/emotional-arc-planner.js",
  "runtime/editorial/audience-temperature-engine.js",
  "runtime/editorial/editorial-memory-store.js",
  "scripts/simulate-editorial-director.js",
  "scripts/verify-editorial-director.js",
  "scripts/runtime-generation-adapter.js",
  "index.js",
];

const REQUIRED_REPORTS = [
  "reports/runtime-editorial/editorial_director_report.md",
  "reports/runtime-editorial/storytelling_report.md",
  "reports/runtime-editorial/audience_temperature_report.md",
  "reports/runtime-editorial/editorial_balance_report.md",
  "reports/runtime-editorial/attention_loop_report.md",
  "reports/runtime-editorial/format_orchestration_report.md",
  "reports/runtime-editorial/freshness_report.md",
  "reports/runtime-editorial/narrative_timeline_report.md",
];

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function runCheck(file) {
  const result = spawnSync("node", ["--check", file], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    file,
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function scanProductionBoundary() {
  const adapter = await fs.readFile(path.join(ROOT, "scripts", "runtime-generation-adapter.js"), "utf8");
  const index = await fs.readFile(path.join(ROOT, "index.js"), "utf8");
  return {
    production_mutation: adapter.includes("production_generation_replaced: false") && adapter.includes("faiss_or_index_mutation: false") ? "NO" : "REVIEW",
    telegram_polling_or_webhook_mutation: index.includes("editorial_director") && index.includes("bot.onText(/\\/runtime_preview") ? "NO" : "REVIEW",
    external_api_usage: adapter.includes("allowExternalApi: options.allowExternalApi === true") && adapter.includes("external_api_calls") ? "NO" : "REVIEW",
    editorial_admin_local_flags: adapter.includes("editorial_director_admin_only: true") && adapter.includes("editorial_director_local_only: true"),
  };
}

function computeStatus({ syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  const risks = [];
  if (!syntaxChecks.every((item) => item.ok)) risks.push("syntax_check_failed");
  if (!fileChecks.every((item) => item.exists)) risks.push("required_editorial_files_missing");
  if (!reportChecks.every((item) => item.exists)) risks.push("required_editorial_reports_missing");
  if (simulation.simulated_requests < 30) risks.push("editorial_simulation_too_short");
  if (simulation.final_editorial_director_score == null) risks.push("editorial_score_missing");
  if (simulation.final_storytelling_continuity == null) risks.push("storytelling_metric_missing");
  if (simulation.final_freshness == null) risks.push("freshness_metric_missing");
  if (simulation.final_audience_temperature == null) risks.push("audience_temperature_missing");
  if (simulation.final_attention_stability == null) risks.push("attention_loop_metric_missing");
  if (simulation.final_run?.state_run_count < 30) risks.push("editorial_state_not_accumulating");
  if (boundary.production_mutation !== "NO") risks.push("production_mutation_review_required");
  if (boundary.telegram_polling_or_webhook_mutation !== "NO") risks.push("telegram_boundary_review_required");
  if (!boundary.editorial_admin_local_flags) risks.push("editorial_scope_flags_missing");

  const status = risks.length ? "FAIL" : "PASS";
  return {
    STATUS: status,
    SAFE_TO_COMMIT: status === "PASS" ? "YES" : "NO",
    SAFE_TO_DEPLOY: "NO",
    EDITORIAL_DIRECTOR_ENABLED: simulation.final_editorial_director_score != null ? "YES" : "NO",
    STORYTELLING_ENGINE_ENABLED: simulation.final_storytelling_continuity != null ? "YES" : "NO",
    FORMAT_ORCHESTRATION_ENABLED: simulation.final_recommended_next_format != null ? "YES" : "NO",
    ATTENTION_LOOP_ENGINE_ENABLED: simulation.final_attention_stability != null ? "YES" : "NO",
    AUDIENCE_TEMPERATURE_ENGINE_ENABLED: simulation.final_audience_temperature != null ? "YES" : "NO",
    EDITORIAL_MEMORY_ENABLED: simulation.final_run?.state_run_count >= 30 ? "YES" : "NO",
    FRESHNESS_MONITOR_ENABLED: simulation.final_freshness != null ? "YES" : "NO",
    PRODUCTION_MUTATION: boundary.production_mutation === "NO" ? "NO" : "REVIEW",
    RISKS: risks,
    NEXT_STEP: status === "PASS"
      ? "Commit local admin-only editorial director; keep deployment blocked until explicit production review."
      : "Fix editorial director verification risks and rerun this script before commit.",
  };
}

function renderReport({ status, syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
EDITORIAL_DIRECTOR_ENABLED: ${status.EDITORIAL_DIRECTOR_ENABLED}
STORYTELLING_ENGINE_ENABLED: ${status.STORYTELLING_ENGINE_ENABLED}
FORMAT_ORCHESTRATION_ENABLED: ${status.FORMAT_ORCHESTRATION_ENABLED}
ATTENTION_LOOP_ENGINE_ENABLED: ${status.ATTENTION_LOOP_ENGINE_ENABLED}
AUDIENCE_TEMPERATURE_ENGINE_ENABLED: ${status.AUDIENCE_TEMPERATURE_ENGINE_ENABLED}
EDITORIAL_MEMORY_ENABLED: ${status.EDITORIAL_MEMORY_ENABLED}
FRESHNESS_MONITOR_ENABLED: ${status.FRESHNESS_MONITOR_ENABLED}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Editorial Metrics

- Simulated requests: ${simulation.simulated_requests}
- Editorial director score: ${simulation.final_editorial_director_score}
- Final recommended format: ${simulation.final_recommended_next_format}
- Final recommended narrative move: ${simulation.final_recommended_next_narrative_move}
- Editorial state run count: ${simulation.final_run?.state_run_count}

## Storytelling Metrics

- Storytelling continuity: ${simulation.final_storytelling_continuity}
- Narrative stage: ${simulation.final_narrative_stage}
- Current arc: ${simulation.final_current_arc}
- Stage distribution: \`${JSON.stringify(simulation.narrative_stage_distribution)}\`

## Freshness Metrics

- Final freshness: ${simulation.final_freshness}
- Minimum freshness: ${simulation.min_freshness}
- Freshness evolution: \`${simulation.freshness_evolution.join(" -> ")}\`

## Audience Temperature Metrics

- Final audience temperature: ${simulation.final_audience_temperature}
- Final label: ${simulation.final_audience_temperature_label}
- Temperature evolution: \`${simulation.audience_temperature_evolution.join(" -> ")}\`

## Saturation Metrics

- Final saturation risk: ${simulation.final_saturation_risk}
- Max saturation risk: ${simulation.max_saturation_risk}
- Final fatigue risk: ${simulation.final_fatigue_risk}
- Max fatigue risk: ${simulation.max_fatigue_risk}

## Format Orchestration Metrics

- Format distribution: \`${JSON.stringify(simulation.format_distribution)}\`
- Category distribution: \`${JSON.stringify(simulation.category_distribution)}\`

## Attention Loop Metrics

- Final attention decay: ${simulation.final_attention_decay}
- Final attention stability: ${simulation.final_attention_stability}
- Attention decay evolution: \`${simulation.attention_decay_evolution.join(" -> ")}\`

## Syntax Checks

${syntaxChecks.map((item) => `- node --check ${item.file}: ${item.ok ? "PASS" : "FAIL"}${item.stderr ? ` - ${item.stderr}` : ""}`).join("\n")}

## Required Files

${fileChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}

## Required Reports

${reportChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}

## Boundary Checks

- Production mutation: ${boundary.production_mutation}
- Telegram polling/webhook mutation: ${boundary.telegram_polling_or_webhook_mutation}
- External API usage: ${boundary.external_api_usage}
- Editorial admin/local flags: ${boundary.editorial_admin_local_flags ? "YES" : "NO"}
`;
}

async function verifyEditorialDirector() {
  const syntaxChecks = REQUIRED_FILES.map(runCheck);
  const simulation = await simulateEditorialDirector({ reset: true });
  const fileChecks = [];
  for (const file of REQUIRED_FILES) fileChecks.push({ path: file, exists: await exists(file) });
  const reportChecks = [];
  for (const reportPath of REQUIRED_REPORTS) reportChecks.push({ path: reportPath, exists: await exists(reportPath) });
  const boundary = await scanProductionBoundary();
  const status = computeStatus({ syntaxChecks, fileChecks, reportChecks, simulation, boundary });
  await fs.mkdir(path.dirname(CHECK_REPORT_PATH), { recursive: true });
  await fs.writeFile(CHECK_REPORT_PATH, renderReport({ status, syntaxChecks, fileChecks, reportChecks, simulation, boundary }), "utf8");
  return {
    ...status,
    RISKS: status.RISKS.length ? status.RISKS : "none",
    reportPath: rel(CHECK_REPORT_PATH),
    editorialReportsDir: "reports/runtime-editorial",
    simulation,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyEditorialDirector()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.STATUS !== "PASS") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  verifyEditorialDirector,
};
