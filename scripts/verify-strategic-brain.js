import { promises as fs } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { simulateStrategicBrain } from "./simulate-strategic-brain.js";

const ROOT = process.cwd();
const CHECK_REPORT_PATH = path.join(ROOT, "reports", "checks", "strategic_brain_verification_report.md");

const REQUIRED_FILES = [
  "runtime/strategy/strategic-brain.js",
  "runtime/strategy/authority-pacing.js",
  "runtime/strategy/trust-building-engine.js",
  "runtime/strategy/emotional-funnel-engine.js",
  "runtime/strategy/conversion-pressure-detector.js",
  "runtime/strategy/audience-state-engine.js",
  "runtime/strategy/positioning-manager.js",
  "runtime/strategy/narrative-loop-engine.js",
  "runtime/strategy/strategic-memory-store.js",
  "scripts/simulate-strategic-brain.js",
  "scripts/verify-strategic-brain.js",
  "scripts/runtime-generation-adapter.js",
  "index.js",
];

const REQUIRED_REPORTS = [
  "reports/runtime-strategy/strategic_brain_report.md",
  "reports/runtime-strategy/trust_building_report.md",
  "reports/runtime-strategy/authority_pacing_report.md",
  "reports/runtime-strategy/emotional_funnel_report.md",
  "reports/runtime-strategy/conversion_pressure_report.md",
  "reports/runtime-strategy/positioning_report.md",
  "reports/runtime-strategy/narrative_loop_report.md",
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
    telegram_polling_or_webhook_mutation: index.includes("strategic_brain") && index.includes("bot.onText(/\\/runtime_preview") ? "NO" : "REVIEW",
    external_api_usage: adapter.includes("allowExternalApi: options.allowExternalApi === true") && adapter.includes("external_api_calls") ? "NO" : "REVIEW",
    strategic_admin_local_flags: adapter.includes("strategic_brain_admin_only: true") && adapter.includes("strategic_brain_local_only: true"),
  };
}

function computeStatus({ syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  const risks = [];
  if (!syntaxChecks.every((item) => item.ok)) risks.push("syntax_check_failed");
  if (!fileChecks.every((item) => item.exists)) risks.push("required_strategy_files_missing");
  if (!reportChecks.every((item) => item.exists)) risks.push("required_strategy_reports_missing");
  if (simulation.simulated_requests < 20) risks.push("strategic_simulation_too_short");
  if (simulation.final_strategic_brain_score == null) risks.push("strategic_score_missing");
  if (simulation.final_run?.state_run_count < 20) risks.push("strategic_state_not_accumulating");
  if (simulation.final_trust_level == null) risks.push("trust_level_missing");
  if (simulation.final_authority_level == null) risks.push("authority_level_missing");
  if (simulation.final_overselling_risk == null) risks.push("overselling_risk_missing");
  if (boundary.production_mutation !== "NO") risks.push("production_mutation_review_required");
  if (boundary.telegram_polling_or_webhook_mutation !== "NO") risks.push("telegram_boundary_review_required");
  if (!boundary.strategic_admin_local_flags) risks.push("strategic_scope_flags_missing");

  const status = risks.length ? "FAIL" : "PASS";
  return {
    STATUS: status,
    SAFE_TO_COMMIT: status === "PASS" ? "YES" : "NO",
    SAFE_TO_DEPLOY: "NO",
    STRATEGIC_BRAIN_ENABLED: simulation.final_strategic_brain_score != null ? "YES" : "NO",
    TRUST_ENGINE_ENABLED: simulation.final_trust_level != null ? "YES" : "NO",
    AUTHORITY_PACING_ENABLED: simulation.final_authority_level != null ? "YES" : "NO",
    EMOTIONAL_FUNNEL_ENABLED: simulation.final_emotional_warmth_level != null ? "YES" : "NO",
    POSITIONING_ENGINE_ENABLED: simulation.final_authority_level != null ? "YES" : "NO",
    OVERSALE_PROTECTION_ENABLED: simulation.final_overselling_risk != null ? "YES" : "NO",
    PRODUCTION_MUTATION: boundary.production_mutation === "NO" ? "NO" : "REVIEW",
    RISKS: risks,
    NEXT_STEP: status === "PASS"
      ? "Commit local admin-only strategic brain; keep deployment blocked until explicit production review."
      : "Fix strategic brain verification risks and rerun this script before commit.",
  };
}

function renderReport({ status, syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
STRATEGIC_BRAIN_ENABLED: ${status.STRATEGIC_BRAIN_ENABLED}
TRUST_ENGINE_ENABLED: ${status.TRUST_ENGINE_ENABLED}
AUTHORITY_PACING_ENABLED: ${status.AUTHORITY_PACING_ENABLED}
EMOTIONAL_FUNNEL_ENABLED: ${status.EMOTIONAL_FUNNEL_ENABLED}
POSITIONING_ENGINE_ENABLED: ${status.POSITIONING_ENGINE_ENABLED}
OVERSALE_PROTECTION_ENABLED: ${status.OVERSALE_PROTECTION_ENABLED}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Strategic Metrics

- Simulated requests: ${simulation.simulated_requests}
- Strategic brain score: ${simulation.final_strategic_brain_score}
- Strategic next move: ${simulation.final_strategic_next_move}
- State run count: ${simulation.final_run?.state_run_count}

## Trust Metrics

- Final trust level: ${simulation.final_trust_level}
- Trust retention probability: ${simulation.final_trust_retention_probability}
- Trust evolution: \`${simulation.trust_evolution.join(" -> ")}\`

## Authority Metrics

- Final authority level: ${simulation.final_authority_level}
- Authority evolution: \`${simulation.authority_evolution.join(" -> ")}\`

## Emotional Pacing Metrics

- Emotional warmth: ${simulation.final_emotional_warmth_level}
- Intimacy pacing: ${simulation.final_intimacy_pacing}
- Audience fatigue: ${simulation.final_audience_fatigue}

## Overselling Metrics

- Final conversion pressure: ${simulation.final_conversion_pressure}
- Max conversion pressure: ${simulation.max_conversion_pressure}
- Final overselling risk: ${simulation.final_overselling_risk}
- Max overselling risk: ${simulation.max_overselling_risk}

## Narrative Loop Metrics

- Final narrative loop: ${simulation.final_narrative_loop}
- Loop counts: \`${JSON.stringify(simulation.narrative_loop_counts)}\`

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
- Strategic admin/local flags: ${boundary.strategic_admin_local_flags ? "YES" : "NO"}
`;
}

async function verifyStrategicBrain() {
  const syntaxChecks = REQUIRED_FILES.map(runCheck);
  const simulation = await simulateStrategicBrain({ reset: true });
  const fileChecks = [];
  for (const file of REQUIRED_FILES) fileChecks.push({ path: file, exists: await exists(file) });
  const reportChecks = [];
  for (const report of REQUIRED_REPORTS) reportChecks.push({ path: report, exists: await exists(report) });
  const boundary = await scanProductionBoundary();
  const status = computeStatus({ syntaxChecks, fileChecks, reportChecks, simulation, boundary });
  await fs.mkdir(path.dirname(CHECK_REPORT_PATH), { recursive: true });
  await fs.writeFile(CHECK_REPORT_PATH, renderReport({ status, syntaxChecks, fileChecks, reportChecks, simulation, boundary }), "utf8");
  return {
    ...status,
    RISKS: status.RISKS.length ? status.RISKS : "none",
    reportPath: rel(CHECK_REPORT_PATH),
    strategyReportsDir: "reports/runtime-strategy",
    simulation,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyStrategicBrain()
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
  verifyStrategicBrain,
};
