import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "index.js");
const REPORT_PATH = path.join(ROOT, "reports", "checks", "runtime_preview_verification_report.md");
const PREVIEW_DIR = path.join(ROOT, "reports", "runtime-preview");

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function includesAll(content, values) {
  return values.every((value) => content.includes(value));
}

function extractPreviewBlock(content) {
  const start = content.indexOf("bot.onText(/\\/runtime_preview");
  if (start < 0) return "";
  const next = content.indexOf("bot.onText(/\\/(?:knowledge|kb_intake)", start);
  return content.slice(start, next > start ? next : start + 5000);
}

async function checkPreviewLogWritable() {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const probe = path.join(PREVIEW_DIR, ".verification-write-test.json");
  await fs.writeFile(probe, JSON.stringify({ ok: true, at: new Date().toISOString() }), "utf-8");
  await fs.unlink(probe);
  return true;
}

function scanDeployLogic(content) {
  const previewBlock = extractPreviewBlock(content);
  const deployPatterns = [
    /railway\s+(up|deploy|link|env|run)/i,
    /\b(vercel|netlify|flyctl)\s+(deploy|push|release)\b/i,
    /knowledge_promote|knowledge_ingest|--promote|--apply/i,
    /faiss\.index.*(writeFile|appendFile|rename|copyFile|unlink|rm)/i,
    /supabase\s+db|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE/i,
    /sendPhoto\(TG_CHANNEL|sendVideo\(TG_CHANNEL|sendMessage\(TG_CHANNEL/i,
  ];
  return deployPatterns
    .filter((pattern) => pattern.test(previewBlock))
    .map((pattern) => pattern.toString());
}

function buildChecks(content, logWritable) {
  const previewBlock = extractPreviewBlock(content);
  const adminOnly = includesAll(content, [
    "async function canUseRuntimePreview",
    "ADMIN_TG_ID",
    "canUseKnowledgeIntake(userId)",
    "Runtime preview доступен только admin/full_access",
  ]);
  const commandExists = previewBlock.includes("/runtime_preview");
  const adapterCalled = previewBlock.includes("runRuntimeGenerationAdapter");
  const dryRunCopy = previewBlock.includes("dry run") || previewBlock.includes("без LLM");
  const noCognitionMutation = includesAll(previewBlock, [
    "persistRuntime: false",
    "initializeStorage: false",
  ]);
  const oldGenerationHandlersStillExist = includesAll(content, [
    "async function generatePostTextResult",
    "openai.chat.completions.create",
    "bot.on(\"message\"",
    "async function runGeneration",
    "await generatePostTextResult(topic, scenario, lengthMode, styleKey)",
  ]);
  const productionReplacement = !oldGenerationHandlersStillExist
    || previewBlock.includes("generatePostTextResult =")
    || previewBlock.includes("processTextRequest =");
  const previewLogging = includesAll(content, [
    "reports\", \"runtime-preview",
    "storeRuntimePreviewRun",
    "runtime_preview",
  ]) && logWritable;
  const deployFindings = scanDeployLogic(content);

  return {
    commandExists,
    adminOnly,
    adapterCalled,
    dryRunCopy,
    noCognitionMutation,
    oldGenerationHandlersStillExist,
    productionReplacement,
    previewLogging,
    deployFindings,
    previewBlockFound: Boolean(previewBlock),
  };
}

function computeStatus(checks) {
  const risks = [];
  if (!checks.commandExists) risks.push("runtime_preview_command_missing");
  if (!checks.adminOnly) risks.push("admin_only_gate_missing_or_incomplete");
  if (!checks.adapterCalled) risks.push("runtime_generation_adapter_not_called");
  if (!checks.dryRunCopy) risks.push("dry_run_boundary_not_visible");
  if (!checks.noCognitionMutation) risks.push("preview_may_mutate_cognition");
  if (!checks.oldGenerationHandlersStillExist) risks.push("old_generation_handlers_not_detected");
  if (checks.productionReplacement) risks.push("production_generation_replacement_risk");
  if (!checks.previewLogging) risks.push("runtime_preview_logging_not_writable_or_missing");
  if (checks.deployFindings.length) risks.push("deploy_or_mutation_logic_detected_in_preview_block");

  return {
    status: risks.length ? "FAIL" : "PASS",
    safeToCommit: risks.length ? "NO" : "YES",
    safeToDeploy: "NO",
    productionGenerationReplaced: checks.productionReplacement ? "YES" : "NO",
    adminOnlyModeEnabled: checks.adminOnly && checks.commandExists ? "YES" : "NO",
    risks,
  };
}

function renderReport({ checks, status }) {
  return `STATUS: ${status.status}
SAFE_TO_COMMIT: ${status.safeToCommit}
SAFE_TO_DEPLOY: ${status.safeToDeploy}
PRODUCTION_GENERATION_REPLACED: ${status.productionGenerationReplaced}
ADMIN_ONLY_MODE_ENABLED: ${status.adminOnlyModeEnabled}
RISKS: ${status.risks.length ? status.risks.join(", ") : "none"}
NEXT_STEP: ${status.status === "PASS" ? "Use /runtime_preview only for admin/full_access dry-run previews; keep deployment blocked." : "Fix listed risks and rerun node scripts/verify-runtime-preview-mode.js before commit."}

## Verification Checks

- Runtime preview command exists: ${checks.commandExists ? "YES" : "NO"}
- Admin/full_access gate exists: ${checks.adminOnly ? "YES" : "NO"}
- Runtime adapter is called: ${checks.adapterCalled ? "YES" : "NO"}
- Dry-run boundary is visible: ${checks.dryRunCopy ? "YES" : "NO"}
- Cognition persistence disabled for preview: ${checks.noCognitionMutation ? "YES" : "NO"}
- Old generation handlers still detected: ${checks.oldGenerationHandlersStillExist ? "YES" : "NO"}
- Runtime preview logs writable: ${checks.previewLogging ? "YES" : "NO"}
- Deploy/mutation logic in preview block: ${checks.deployFindings.length ? checks.deployFindings.join(", ") : "none"}

## Runtime Preview Command Path

\`index.js -> bot.onText(/\\/runtime_preview/) -> canUseRuntimePreview() -> runRuntimeGenerationAdapter(..., { persistRuntime: false, initializeStorage: false }) -> storeRuntimePreviewRun()\`

## Example Preview Response Structure

- Expert id
- Topic
- LLM execution mode
- Selected context count
- Runtime quality score
- Runtime decisions
- Cognition summary
- CTA pacing
- Repetition risk
- Author voice status
- Warnings
- Config summary
- Truncated assembled prompt preview
`;
}

async function writeReport(content) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, content, "utf-8");
}

async function verifyRuntimePreviewMode() {
  if (!await exists(INDEX_PATH)) {
    throw new Error("index.js not found");
  }
  const content = await fs.readFile(INDEX_PATH, "utf-8");
  const logWritable = await checkPreviewLogWritable();
  const checks = buildChecks(content, logWritable);
  const status = computeStatus(checks);
  await writeReport(renderReport({ checks, status }));
  return {
    ...status,
    reportPath: path.relative(ROOT, REPORT_PATH).replace(/\\/g, "/"),
    runtimePreviewCommandPath: "index.js -> /runtime_preview -> runRuntimeGenerationAdapter dry_run_prompt_only",
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRuntimePreviewMode()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "PASS") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  verifyRuntimePreviewMode,
};
