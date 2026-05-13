import { promises as fs } from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "runtime-identity");
const CHECK_REPORT_PATH = path.join(ROOT, "reports", "checks", "runtime_identity_verification_report.md");

const REQUIRED_FILES = [
  "runtime/identity/author-identity-engine.js",
  "runtime/identity/persona-memory.js",
  "runtime/identity/worldview-profile.js",
  "runtime/identity/emotional-signature.js",
  "runtime/identity/rhetorical-patterns.js",
  "runtime/identity/narrative-continuity.js",
  "runtime/identity/identity-drift-detector.js",
  "scripts/runtime-generation-adapter.js",
  "scripts/verify-runtime-identity.js",
  "index.js",
];

const REQUIRED_REPORTS = [
  "reports/runtime-identity/identity_runtime_report.md",
  "reports/runtime-identity/persona_continuity_report.md",
  "reports/runtime-identity/identity_drift_report.md",
  "reports/runtime-identity/worldview_consistency_report.md",
  "reports/runtime-identity/rhetorical_pattern_report.md",
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

async function runIdentitySample({ topic, mode = "dry_run_prompt_only", persistIdentity = true }) {
  return runRuntimeGenerationAdapter({
    expertId: "dinara",
    topic,
    userRequest: topic,
    intent: "educational_post",
    platform: "telegram_longread",
    length: "medium",
    format: "post",
    tone: "expert_warm",
    audienceState: "warming",
    ctaType: "low_pressure_cta",
    llmExecutionMode: mode,
  }, {
    persistRuntime: false,
    initializeStorage: true,
    persistIdentity,
    llmExecutionMode: mode,
    sandboxProvider: "mock",
    allowExternalApi: false,
  });
}

function summarizeIdentity(result) {
  const identity = result.identity_runtime || {};
  const fingerprint = identity.identity_fingerprint || {};
  const preview = identity.preview_metrics || {};
  const drift = identity.drift_detection || {};
  const worldview = identity.worldview_profile || {};
  const emotional = identity.emotional_signature || {};
  const rhetorical = identity.rhetorical_patterns || {};
  const continuity = identity.persona_continuity || {};
  return {
    identity_confidence: preview.identity_confidence,
    persona_drift_level: preview.persona_drift_level,
    persona_drift_score: drift.persona_drift_score,
    worldview_stability: preview.worldview_stability,
    emotional_continuity: preview.emotional_continuity,
    rhetorical_continuity: preview.rhetorical_continuity,
    generic_ai_divergence: preview.generic_ai_divergence,
    narrative_persistence: preview.narrative_persistence,
    author_similarity: fingerprint.author_similarity,
    worldview_similarity: fingerprint.worldview_similarity,
    rhetorical_similarity: fingerprint.rhetorical_similarity,
    emotional_similarity: fingerprint.emotional_similarity,
    continuity_similarity: fingerprint.continuity_similarity,
    memory_persisted: identity.persona_memory_persisted_after_run === true,
    memory_loaded_from_disk: identity.persona_memory_loaded_from_disk === true,
    memory_run_count: identity.persona_memory_run_count,
    memory_path: identity.persona_memory_path,
    detected_worldview_anchors: worldview.detected_anchors || [],
    detected_emotions: emotional.detected_emotions || [],
    detected_rhetorical_patterns: rhetorical.detected_patterns || [],
    continuity_anchors: continuity.continuity_anchors || [],
    warnings: identity.warnings || [],
    local_only: identity.local_only === true,
    admin_only: identity.admin_only === true,
    production_generation_replaced: identity.production_generation_replaced === true,
    telegram_runtime_mutation: identity.telegram_runtime_mutation === true,
    external_api_calls: identity.external_api_calls === true,
    faiss_or_index_mutation: identity.faiss_or_index_mutation === true,
    ingest_or_promote: identity.ingest_or_promote === true,
  };
}

function compareMetrics(before, after) {
  return {
    identity_confidence_delta: Number((after.identity_confidence - before.identity_confidence).toFixed(3)),
    generic_ai_divergence_delta: Number((after.generic_ai_divergence - before.generic_ai_divergence).toFixed(3)),
    worldview_stability_delta: Number((after.worldview_stability - before.worldview_stability).toFixed(3)),
    rhetorical_continuity_delta: Number((after.rhetorical_continuity - before.rhetorical_continuity).toFixed(3)),
    narrative_persistence_delta: Number((after.narrative_persistence - before.narrative_persistence).toFixed(3)),
  };
}

function computeStatus({ syntaxChecks, fileChecks, reportChecks, firstSummary, secondSummary, deltas }) {
  const risks = [];
  if (!syntaxChecks.every((item) => item.ok)) risks.push("syntax_check_failed");
  if (!fileChecks.every((item) => item.exists)) risks.push("required_identity_files_missing");
  if (!reportChecks.every((item) => item.exists)) risks.push("required_identity_reports_missing");
  if (!secondSummary.memory_persisted) risks.push("persona_memory_not_persisted");
  if (!secondSummary.memory_loaded_from_disk) risks.push("persona_memory_not_loaded_from_disk");
  if (!secondSummary.local_only || !secondSummary.admin_only) risks.push("identity_scope_not_local_admin_only");
  if (secondSummary.production_generation_replaced || secondSummary.telegram_runtime_mutation || secondSummary.faiss_or_index_mutation || secondSummary.ingest_or_promote) {
    risks.push("production_mutation_detected");
  }
  if (secondSummary.external_api_calls) risks.push("external_api_called");
  if (Number(secondSummary.identity_confidence || 0) < 0.62) risks.push("identity_confidence_low");
  if (Number(secondSummary.generic_ai_divergence || 0) < 0.68) risks.push("generic_ai_divergence_low");

  const productionMutation = secondSummary.production_generation_replaced
    || secondSummary.telegram_runtime_mutation
    || secondSummary.faiss_or_index_mutation
    || secondSummary.ingest_or_promote;
  const status = risks.length ? "FAIL" : "PASS";

  return {
    STATUS: status,
    SAFE_TO_COMMIT: status === "PASS" ? "YES" : "NO",
    SAFE_TO_DEPLOY: "NO",
    IDENTITY_ENGINE_ENABLED: secondSummary.identity_confidence != null ? "YES" : "NO",
    PERSONA_MEMORY_ENABLED: secondSummary.memory_persisted ? "YES" : "NO",
    WORLDVIEW_TRACKING_ENABLED: secondSummary.worldview_stability != null ? "YES" : "NO",
    IDENTITY_DRIFT_DETECTION_ENABLED: secondSummary.persona_drift_score != null ? "YES" : "NO",
    GENERIC_AI_DIVERGENCE_REDUCED: deltas.generic_ai_divergence_delta >= 0 ? "YES" : "NO",
    IDENTITY_CONTINUITY_IMPROVED: deltas.identity_confidence_delta >= 0 || deltas.narrative_persistence_delta >= 0 ? "YES" : "NO",
    PRODUCTION_MUTATION: productionMutation ? "YES" : "NO",
    RISKS: risks,
    NEXT_STEP: status === "PASS"
      ? "Commit local admin-only identity runtime; keep deployment blocked until explicit production review."
      : "Fix identity verification risks and rerun this script before commit.",
    firstSummary,
    secondSummary,
  };
}

function renderIdentityRuntimeReport({ firstSummary, secondSummary, deltas, status }) {
  return `# Identity Runtime Report

Generated: ${new Date().toISOString()}

- STATUS: ${status.STATUS}
- Identity engine enabled: ${status.IDENTITY_ENGINE_ENABLED}
- Admin only: \`${secondSummary.admin_only}\`
- Local only: \`${secondSummary.local_only}\`
- Identity confidence: ${secondSummary.identity_confidence}
- Author similarity: ${secondSummary.author_similarity}
- Generic AI divergence: ${secondSummary.generic_ai_divergence}
- Identity confidence delta: ${deltas.identity_confidence_delta}
- Generic AI divergence delta: ${deltas.generic_ai_divergence_delta}
- Production generation replaced: \`${secondSummary.production_generation_replaced}\`
- Telegram runtime mutation: \`${secondSummary.telegram_runtime_mutation}\`

The identity engine is additive and runs as admin-local runtime metadata. It does not publish, auto-post, mutate Telegram polling/webhook setup, replace production generation, run ingest/promote, or mutate FAISS/index files.

## Before

\`\`\`json
${JSON.stringify(firstSummary, null, 2)}
\`\`\`

## After

\`\`\`json
${JSON.stringify(secondSummary, null, 2)}
\`\`\`
`;
}

function renderPersonaContinuityReport({ secondSummary, deltas }) {
  return `# Persona Continuity Report

Generated: ${new Date().toISOString()}

- Persona memory enabled: \`${secondSummary.memory_persisted}\`
- Loaded from disk: \`${secondSummary.memory_loaded_from_disk}\`
- Memory path: \`${secondSummary.memory_path}\`
- Memory run count: ${secondSummary.memory_run_count}
- Narrative persistence: ${secondSummary.narrative_persistence}
- Narrative persistence delta: ${deltas.narrative_persistence_delta}
- Continuity similarity: ${secondSummary.continuity_similarity}

## Continuity Anchors

${secondSummary.continuity_anchors.length ? secondSummary.continuity_anchors.map((item) => `- \`${item}\``).join("\n") : "- none"}
`;
}

function renderIdentityDriftReport({ secondSummary }) {
  return `# Identity Drift Report

Generated: ${new Date().toISOString()}

- Persona drift level: ${secondSummary.persona_drift_level}
- Persona drift score: ${secondSummary.persona_drift_score}
- Generic AI divergence: ${secondSummary.generic_ai_divergence}
- Warnings: ${secondSummary.warnings.length ? secondSummary.warnings.map((item) => `\`${item}\``).join(", ") : "none"}

Drift detection covers robotic behavior spikes, generic AI tone, worldview inconsistency, emotional inconsistency, rhetorical instability, over-sanitization, and excessive optimization artifacts.
`;
}

function renderWorldviewReport({ secondSummary, deltas }) {
  return `# Worldview Consistency Report

Generated: ${new Date().toISOString()}

- Worldview stability: ${secondSummary.worldview_stability}
- Worldview similarity: ${secondSummary.worldview_similarity}
- Worldview stability delta: ${deltas.worldview_stability_delta}

## Detected Anchors

${secondSummary.detected_worldview_anchors.length ? secondSummary.detected_worldview_anchors.map((item) => `- \`${item}\``).join("\n") : "- none"}
`;
}

function renderRhetoricalReport({ secondSummary, deltas }) {
  return `# Rhetorical Pattern Report

Generated: ${new Date().toISOString()}

- Rhetorical continuity: ${secondSummary.rhetorical_continuity}
- Rhetorical similarity: ${secondSummary.rhetorical_similarity}
- Rhetorical continuity delta: ${deltas.rhetorical_continuity_delta}

## Detected Patterns

${secondSummary.detected_rhetorical_patterns.length ? secondSummary.detected_rhetorical_patterns.map((item) => `- \`${item}\``).join("\n") : "- none"}
`;
}

function renderCheckReport({ status, syntaxChecks, fileChecks, reportChecks, deltas }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
IDENTITY_ENGINE_ENABLED: ${status.IDENTITY_ENGINE_ENABLED}
PERSONA_MEMORY_ENABLED: ${status.PERSONA_MEMORY_ENABLED}
WORLDVIEW_TRACKING_ENABLED: ${status.WORLDVIEW_TRACKING_ENABLED}
IDENTITY_DRIFT_DETECTION_ENABLED: ${status.IDENTITY_DRIFT_DETECTION_ENABLED}
GENERIC_AI_DIVERGENCE_REDUCED: ${status.GENERIC_AI_DIVERGENCE_REDUCED}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Identity Metrics

- Identity confidence: ${status.secondSummary.identity_confidence}
- Author similarity: ${status.secondSummary.author_similarity}
- Generic AI divergence: ${status.secondSummary.generic_ai_divergence}
- Persona drift level: ${status.secondSummary.persona_drift_level}
- Persona drift score: ${status.secondSummary.persona_drift_score}

## Identity Persistence Metrics

- Persona memory persisted: ${status.secondSummary.memory_persisted}
- Persona memory loaded from disk: ${status.secondSummary.memory_loaded_from_disk}
- Persona memory path: ${status.secondSummary.memory_path}
- Persona memory run count: ${status.secondSummary.memory_run_count}

## Worldview Consistency Metrics

- Worldview stability: ${status.secondSummary.worldview_stability}
- Worldview similarity: ${status.secondSummary.worldview_similarity}
- Detected anchors: ${status.secondSummary.detected_worldview_anchors.join(", ") || "none"}

## Rhetorical Continuity Metrics

- Rhetorical continuity: ${status.secondSummary.rhetorical_continuity}
- Rhetorical similarity: ${status.secondSummary.rhetorical_similarity}
- Detected patterns: ${status.secondSummary.detected_rhetorical_patterns.join(", ") || "none"}

## Deltas

\`\`\`json
${JSON.stringify(deltas, null, 2)}
\`\`\`

## Syntax Checks

${syntaxChecks.map((item) => `- node --check ${item.file}: ${item.ok ? "PASS" : "FAIL"}${item.stderr ? ` - ${item.stderr}` : ""}`).join("\n")}

## Required Files

${fileChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}

## Required Reports

${reportChecks.map((item) => `- ${item.path}: ${item.exists ? "PASS" : "FAIL"}`).join("\n")}
`;
}

async function writeReports({ firstSummary, secondSummary, deltas, status, syntaxChecks, fileChecks, reportChecks }) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(CHECK_REPORT_PATH), { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "identity_runtime_report.md"), renderIdentityRuntimeReport({ firstSummary, secondSummary, deltas, status }), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "persona_continuity_report.md"), renderPersonaContinuityReport({ secondSummary, deltas }), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "identity_drift_report.md"), renderIdentityDriftReport({ secondSummary }), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "worldview_consistency_report.md"), renderWorldviewReport({ secondSummary, deltas }), "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "rhetorical_pattern_report.md"), renderRhetoricalReport({ secondSummary, deltas }), "utf8");
  await fs.writeFile(CHECK_REPORT_PATH, renderCheckReport({ status, syntaxChecks, fileChecks, reportChecks, deltas }), "utf8");
}

async function verifyRuntimeIdentity() {
  const syntaxChecks = REQUIRED_FILES.map(runCheck);
  const fileChecks = [];
  for (const file of REQUIRED_FILES) fileChecks.push({ path: file, exists: await exists(file) });

  const firstRun = await runIdentitySample({
    topic: "стыд и близость",
    persistIdentity: true,
  });
  const secondRun = await runIdentitySample({
    topic: "стыд и близость без давления",
    persistIdentity: true,
  });
  const firstSummary = summarizeIdentity(firstRun);
  const secondSummary = summarizeIdentity(secondRun);
  const deltas = compareMetrics(firstSummary, secondSummary);

  let reportChecks = REQUIRED_REPORTS.map((report) => ({ path: report, exists: false }));
  const preStatus = computeStatus({
    syntaxChecks,
    fileChecks,
    reportChecks: reportChecks.map((item) => ({ ...item, exists: true })),
    firstSummary,
    secondSummary,
    deltas,
  });
  await writeReports({
    firstSummary,
    secondSummary,
    deltas,
    status: preStatus,
    syntaxChecks,
    fileChecks,
    reportChecks: reportChecks.map((item) => ({ ...item, exists: true })),
  });

  reportChecks = [];
  for (const report of REQUIRED_REPORTS) reportChecks.push({ path: report, exists: await exists(report) });
  const status = computeStatus({ syntaxChecks, fileChecks, reportChecks, firstSummary, secondSummary, deltas });
  await writeReports({ firstSummary, secondSummary, deltas, status, syntaxChecks, fileChecks, reportChecks });

  return {
    STATUS: status.STATUS,
    SAFE_TO_COMMIT: status.SAFE_TO_COMMIT,
    SAFE_TO_DEPLOY: status.SAFE_TO_DEPLOY,
    IDENTITY_ENGINE_ENABLED: status.IDENTITY_ENGINE_ENABLED,
    PERSONA_MEMORY_ENABLED: status.PERSONA_MEMORY_ENABLED,
    WORLDVIEW_TRACKING_ENABLED: status.WORLDVIEW_TRACKING_ENABLED,
    IDENTITY_DRIFT_DETECTION_ENABLED: status.IDENTITY_DRIFT_DETECTION_ENABLED,
    GENERIC_AI_DIVERGENCE_REDUCED: status.GENERIC_AI_DIVERGENCE_REDUCED,
    IDENTITY_CONTINUITY_IMPROVED: status.IDENTITY_CONTINUITY_IMPROVED,
    PRODUCTION_MUTATION: status.PRODUCTION_MUTATION,
    RISKS: status.RISKS.length ? status.RISKS : "none",
    NEXT_STEP: status.NEXT_STEP,
    reportPath: rel(CHECK_REPORT_PATH),
    identityReportsDir: rel(REPORT_DIR),
    identityMetrics: secondSummary,
    deltas,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRuntimeIdentity()
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
  verifyRuntimeIdentity,
};
