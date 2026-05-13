import { promises as fs } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { simulateCampaignMemory } from "./simulate-campaign-memory.js";

const ROOT = process.cwd();
const CHECK_REPORT_PATH = path.join(ROOT, "reports", "checks", "campaign_memory_verification_report.md");

const REQUIRED_FILES = [
  "runtime/campaign-memory/campaign-memory-engine.js",
  "runtime/campaign-memory/topic-history.js",
  "runtime/campaign-memory/cta-history.js",
  "runtime/campaign-memory/narrative-arcs.js",
  "runtime/campaign-memory/audience-fatigue-detector.js",
  "runtime/campaign-memory/content-sequence-planner.js",
  "runtime/campaign-memory/campaign-state-store.js",
  "scripts/simulate-campaign-memory.js",
  "scripts/verify-campaign-memory.js",
  "scripts/runtime-generation-adapter.js",
  "index.js",
];

const REQUIRED_REPORTS = [
  "reports/runtime-campaign-memory/campaign_memory_report.md",
  "reports/runtime-campaign-memory/topic_history_report.md",
  "reports/runtime-campaign-memory/cta_fatigue_report.md",
  "reports/runtime-campaign-memory/narrative_arc_report.md",
  "reports/runtime-campaign-memory/audience_fatigue_report.md",
  "reports/runtime-campaign-memory/campaign_sequence_report.md",
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
    telegram_polling_or_webhook_mutation: index.includes("campaign_memory") && index.includes("bot.onText(/\\/runtime_preview") ? "NO" : "REVIEW",
    external_api_usage: adapter.includes("allowExternalApi: options.allowExternalApi === true") && adapter.includes("external_api_calls") ? "NO" : "REVIEW",
    campaign_admin_local_flags: adapter.includes("campaign_memory_admin_only: true") && adapter.includes("campaign_memory_local_only: true"),
  };
}

function computeStatus({ syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  const risks = [];
  if (!syntaxChecks.every((item) => item.ok)) risks.push("syntax_check_failed");
  if (!fileChecks.every((item) => item.exists)) risks.push("required_campaign_memory_files_missing");
  if (!reportChecks.every((item) => item.exists)) risks.push("required_campaign_memory_reports_missing");
  if (simulation.simulated_requests < 15) risks.push("campaign_simulation_too_short");
  if (simulation.final_campaign_memory_score == null) risks.push("campaign_memory_score_missing");
  if (simulation.final_run?.state_run_count < 15) risks.push("campaign_state_not_accumulating");
  if (boundary.production_mutation !== "NO") risks.push("production_mutation_review_required");
  if (boundary.telegram_polling_or_webhook_mutation !== "NO") risks.push("telegram_boundary_review_required");
  if (!boundary.campaign_admin_local_flags) risks.push("campaign_memory_scope_flags_missing");

  const status = risks.length ? "FAIL" : "PASS";
  return {
    STATUS: status,
    SAFE_TO_COMMIT: status === "PASS" ? "YES" : "NO",
    SAFE_TO_DEPLOY: "NO",
    CAMPAIGN_MEMORY_ENABLED: simulation.final_campaign_memory_score != null ? "YES" : "NO",
    TOPIC_HISTORY_ENABLED: simulation.accumulated_topics?.length >= 15 ? "YES" : "NO",
    CTA_HISTORY_ENABLED: simulation.accumulated_ctas?.length >= 15 ? "YES" : "NO",
    NARRATIVE_ARCS_ENABLED: simulation.final_narrative_arc_status ? "YES" : "NO",
    AUDIENCE_FATIGUE_DETECTION_ENABLED: simulation.final_audience_fatigue_risk ? "YES" : "NO",
    PRODUCTION_MUTATION: boundary.production_mutation === "NO" ? "NO" : "REVIEW",
    RISKS: risks,
    NEXT_STEP: status === "PASS"
      ? "Commit local admin-only campaign memory; keep deployment blocked until explicit production review."
      : "Fix campaign memory verification risks and rerun this script before commit.",
  };
}

function renderReport({ status, syntaxChecks, fileChecks, reportChecks, simulation, boundary }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
CAMPAIGN_MEMORY_ENABLED: ${status.CAMPAIGN_MEMORY_ENABLED}
TOPIC_HISTORY_ENABLED: ${status.TOPIC_HISTORY_ENABLED}
CTA_HISTORY_ENABLED: ${status.CTA_HISTORY_ENABLED}
NARRATIVE_ARCS_ENABLED: ${status.NARRATIVE_ARCS_ENABLED}
AUDIENCE_FATIGUE_DETECTION_ENABLED: ${status.AUDIENCE_FATIGUE_DETECTION_ENABLED}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Campaign Memory Metrics

- Simulated requests: ${simulation.simulated_requests}
- Final campaign memory score: ${simulation.final_campaign_memory_score}
- Final format variety: ${simulation.final_format_variety}
- Warning count: ${simulation.warning_count}

## Topic History Metrics

- Accumulated topics: ${simulation.accumulated_topics.length}
- Final topic repetition risk: ${simulation.final_topic_repetition_risk}

## CTA Fatigue Metrics

- Accumulated CTAs: ${simulation.accumulated_ctas.length}
- Final CTA fatigue level: ${simulation.final_cta_fatigue_level}

## Narrative Arc Metrics

- Final narrative arc status: ${simulation.final_narrative_arc_status}
- Suggested next move: ${simulation.final_run?.suggested_next_move}

## Audience Fatigue Metrics

- Final audience fatigue risk: ${simulation.final_audience_fatigue_risk}
- CTA fatigue counts: \`${JSON.stringify(simulation.cta_fatigue_counts)}\`
- Audience fatigue counts: \`${JSON.stringify(simulation.audience_fatigue_counts)}\`

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
- Campaign admin/local flags: ${boundary.campaign_admin_local_flags ? "YES" : "NO"}
`;
}

async function verifyCampaignMemory() {
  const syntaxChecks = REQUIRED_FILES.map(runCheck);
  const simulation = await simulateCampaignMemory({ reset: true });
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
    campaignReportsDir: "reports/runtime-campaign-memory",
    simulation,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyCampaignMemory()
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
  verifyCampaignMemory,
};
