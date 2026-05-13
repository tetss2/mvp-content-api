import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { simulateRuntimeQualityStabilization } from "./simulate-runtime-quality-stabilization.js";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports", "checks", "runtime_stabilization_verification_report.md");

const REQUIRED_FILES = [
  "scripts/runtime-quality-analyzer.js",
  "scripts/simulate-runtime-quality-stabilization.js",
  "scripts/verify-runtime-stabilization.js",
  "runtime/stabilization/author-voice-rules.js",
  "runtime/stabilization/cta-pacing-rules.js",
  "runtime/stabilization/emotional-pacing-rules.js",
  "runtime/stabilization/anti-generic-rules.js",
  "runtime/stabilization/repetition-risk-rules.js",
  "runtime/stabilization/utils.js",
];

const REQUIRED_REPORTS = [
  "reports/runtime-stabilization/stabilization_comparison_report.md",
  "reports/runtime-stabilization/author_voice_stability_report.md",
  "reports/runtime-stabilization/cta_pacing_report.md",
  "reports/runtime-stabilization/anti_generic_behavior_report.md",
  "reports/runtime-stabilization/emotional_pacing_report.md",
  "reports/runtime-stabilization/runtime_quality_improvement_report.md",
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

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

async function scanProductionBoundary() {
  const index = await read("index.js");
  const adapter = await read("scripts/runtime-generation-adapter.js");
  const previewBlockStart = index.indexOf("bot.onText(/\\/runtime_preview");
  const previewBlock = previewBlockStart >= 0 ? index.slice(previewBlockStart, previewBlockStart + 3500) : "";
  return {
    production_mutation: adapter.includes("production_generation_replaced: false") ? "NO" : "REVIEW",
    telegram_production_changed: previewBlock.includes("persistRuntime: false") && previewBlock.includes("initializeStorage: false") ? "NO" : "REVIEW",
    faiss_mutation: adapter.includes("faiss_or_index_mutation: false") ? "NO" : "REVIEW",
    external_api_usage: adapter.includes("llm_execution_disabled: true") && adapter.includes("external_api_calls: false") ? "NO" : "REVIEW",
    admin_only_preview: index.includes("async function canUseRuntimePreview") && index.includes("ADMIN_TG_ID"),
  };
}

function statusFrom({ filesOk, reportsOk, syntaxOk, metrics, boundary }) {
  const risks = [];
  if (!filesOk) risks.push("required_stabilization_files_missing");
  if (!reportsOk) risks.push("required_stabilization_reports_missing");
  if (!syntaxOk) risks.push("syntax_check_failed");
  if (!metrics.author_voice_drift_improved) risks.push("author_voice_not_improved");
  if (!metrics.cta_pressure_improved) risks.push("cta_pressure_not_reduced");
  if (!metrics.generic_ai_risk_improved) risks.push("generic_ai_risk_not_reduced");
  if (boundary.production_mutation !== "NO") risks.push("production_mutation_review_required");
  if (boundary.telegram_production_changed !== "NO") risks.push("telegram_production_change_review_required");
  if (boundary.faiss_mutation !== "NO") risks.push("faiss_mutation_review_required");
  if (boundary.external_api_usage !== "NO") risks.push("external_api_usage_review_required");
  if (!boundary.admin_only_preview) risks.push("admin_only_preview_gate_missing");

  return {
    STATUS: risks.length ? "FAIL" : "PASS",
    SAFE_TO_COMMIT: risks.length ? "NO" : "YES",
    SAFE_TO_DEPLOY: "NO",
    PRODUCTION_MUTATION: boundary.production_mutation,
    TELEGRAM_PRODUCTION_CHANGED: boundary.telegram_production_changed,
    FAISS_MUTATION: boundary.faiss_mutation,
    EXTERNAL_API_USAGE: boundary.external_api_usage,
    AUTHOR_VOICE_IMPROVED: metrics.author_voice_drift_improved ? "YES" : "NO",
    CTA_PRESSURE_REDUCED: metrics.cta_pressure_improved ? "YES" : "NO",
    GENERIC_AI_RISK_REDUCED: metrics.generic_ai_risk_improved ? "YES" : "NO",
    RISKS: risks,
    NEXT_STEP: risks.length
      ? "Fix stabilization risks, rerun verification, and keep deployment blocked."
      : "Commit local admin-preview stabilization only; real runtime execution remains blocked pending human review.",
  };
}

function renderReport({ status, fileChecks, reportChecks, syntaxChecks, metrics, boundary }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
TELEGRAM_PRODUCTION_CHANGED: ${status.TELEGRAM_PRODUCTION_CHANGED}
FAISS_MUTATION: ${status.FAISS_MUTATION}
EXTERNAL_API_USAGE: ${status.EXTERNAL_API_USAGE}
AUTHOR_VOICE_IMPROVED: ${status.AUTHOR_VOICE_IMPROVED}
CTA_PRESSURE_REDUCED: ${status.CTA_PRESSURE_REDUCED}
GENERIC_AI_RISK_REDUCED: ${status.GENERIC_AI_RISK_REDUCED}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Stabilization Metrics

- Simulated requests: ${metrics.simulated_requests}
- Quality before: ${metrics.before_average_quality}
- Quality after: ${metrics.after_average_quality}
- Author voice before: ${metrics.author_voice_before}
- Author voice after: ${metrics.author_voice_after}
- CTA pressure before: ${metrics.cta_pressure_before}
- CTA pressure after: ${metrics.cta_pressure_after}
- Generic AI risk before: ${metrics.generic_ai_risk_before}
- Generic AI risk after: ${metrics.generic_ai_risk_after}

## Required Files

${fileChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}

## Required Reports

${reportChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}

## Syntax Checks

${syntaxChecks.map((item) => `- node --check ${item.file}: ${item.ok ? "PASS" : "FAIL"}${item.stderr ? ` - ${item.stderr}` : ""}`).join("\n")}

## Boundary Checks

- Production mutation: ${boundary.production_mutation}
- Telegram production changed: ${boundary.telegram_production_changed}
- FAISS/index mutation: ${boundary.faiss_mutation}
- External API usage: ${boundary.external_api_usage}
- Admin-only preview gate detected: ${boundary.admin_only_preview ? "YES" : "NO"}
`;
}

async function verifyRuntimeStabilization() {
  const syntaxChecks = REQUIRED_FILES.map(runCheck);
  const simulation = await simulateRuntimeQualityStabilization();
  const fileChecks = [];
  for (const file of REQUIRED_FILES) fileChecks.push({ path: file, exists: await exists(file) });
  const reportChecks = [];
  for (const report of REQUIRED_REPORTS) reportChecks.push({ path: report, exists: await exists(report) });
  const boundary = await scanProductionBoundary();
  const status = statusFrom({
    filesOk: fileChecks.every((item) => item.exists),
    reportsOk: reportChecks.every((item) => item.exists),
    syntaxOk: syntaxChecks.every((item) => item.ok),
    metrics: simulation,
    boundary,
  });
  const content = renderReport({ status, fileChecks, reportChecks, syntaxChecks, metrics: simulation, boundary });
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, content, "utf8");
  return {
    ...status,
    RISKS: status.RISKS.length ? status.RISKS : "none",
    reportPath: rel(REPORT_PATH),
    metrics: simulation,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRuntimeStabilization()
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
  verifyRuntimeStabilization,
};
