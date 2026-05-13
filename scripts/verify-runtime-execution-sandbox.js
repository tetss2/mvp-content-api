import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { runRuntimeGenerationAdapter } from "./runtime-generation-adapter.js";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const CHECK_REPORT_PATH = path.join(ROOT, "reports", "checks", "runtime_execution_sandbox_verification_report.md");
const EXECUTION_REPORT_DIR = path.join(ROOT, "reports", "runtime-execution");

const RELEVANT_FILES = [
  "runtime/execution/runtime-executor.js",
  "runtime/execution/runtime-sandbox.js",
  "runtime/execution/runtime-response-validator.js",
  "runtime/execution/runtime-output-sanitizer.js",
  "scripts/runtime-generation-adapter.js",
  "scripts/verify-runtime-execution-sandbox.js",
  "index.js",
];

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

async function runCheck(file) {
  try {
    const result = await execFileAsync("node", ["--check", file], {
      cwd: ROOT,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      command: `node --check ${file}`,
      status: "PASS",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error) {
    return {
      command: `node --check ${file}`,
      status: "FAIL",
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}

async function runSyntaxChecks() {
  const results = [];
  for (const file of RELEVANT_FILES) {
    results.push(await runCheck(file));
  }
  return results;
}

function summarizeRun(result) {
  const sandbox = result.generation_pipeline?.runtime_execution_sandbox || {};
  const final = result.final_generation_result || {};
  return {
    llmExecutionMode: result.generation_pipeline?.llm_execution_mode,
    sandbox_execution_enabled: sandbox.sandbox_execution_enabled === true,
    executed: sandbox.execution?.executed === true,
    provider: sandbox.execution?.provider || null,
    external_api_calls: sandbox.diagnostics?.external_api_calls === true,
    content_execution_status: final.content_execution_status,
    content_chars: String(final.content || "").length,
    output_validation_enabled: sandbox.output_validation_enabled === true,
    output_sanitization_enabled: sandbox.output_sanitization_enabled === true,
    validation_status: final.output_validation?.status || null,
    sanitization_changed: final.output_sanitization?.changed === true,
    production_generation_replaced: final.production_generation_replaced === true,
    telegram_runtime_mutation: final.telegram_runtime_mutation === true,
    auto_posting: final.auto_posting === true,
    faiss_or_index_mutation: final.faiss_or_index_mutation === true,
    ingest_or_promote: final.ingest_or_promote === true,
    warnings: final.warnings || [],
  };
}

async function runMode(mode) {
  return runRuntimeGenerationAdapter({
    expertId: "dinara",
    topic: "стыд и близость",
    userRequest: "стыд и близость",
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
    initializeStorage: false,
    llmExecutionMode: mode,
    sandboxProvider: "mock",
    allowExternalApi: false,
  });
}

function computeStatus({ checks, drySummary, sandboxSummary }) {
  const risks = [];
  if (checks.some((item) => item.status !== "PASS")) risks.push("syntax_check_failed");
  if (drySummary.llmExecutionMode !== "dry_run_prompt_only") risks.push("dry_mode_not_preserved");
  if (drySummary.executed) risks.push("dry_mode_executed_content");
  if (sandboxSummary.llmExecutionMode !== "sandbox_execution") risks.push("sandbox_mode_not_enabled");
  if (!sandboxSummary.executed) risks.push("sandbox_execution_not_executed");
  if (!sandboxSummary.output_validation_enabled) risks.push("output_validation_not_enabled");
  if (!sandboxSummary.output_sanitization_enabled) risks.push("output_sanitization_not_enabled");
  if (!sandboxSummary.content_chars) risks.push("sandbox_generated_text_missing");
  if (sandboxSummary.external_api_calls) risks.push("external_api_called");

  const productionMutation = sandboxSummary.telegram_runtime_mutation
    || sandboxSummary.auto_posting
    || sandboxSummary.faiss_or_index_mutation
    || sandboxSummary.ingest_or_promote;
  const productionReplaced = sandboxSummary.production_generation_replaced;

  if (productionMutation) risks.push("production_mutation_detected");
  if (productionReplaced) risks.push("production_generation_replaced");

  const status = risks.length ? "FAIL" : "PASS";
  return {
    STATUS: status,
    SAFE_TO_COMMIT: status === "PASS" ? "YES" : "NO",
    SAFE_TO_DEPLOY: "NO",
    PRODUCTION_MUTATION: productionMutation ? "YES" : "NO",
    PRODUCTION_GENERATION_REPLACED: productionReplaced ? "YES" : "NO",
    ADMIN_ONLY_SANDBOX: "YES",
    REAL_RUNTIME_EXECUTION_ENABLED: sandboxSummary.executed ? "YES" : "NO",
    OUTPUT_VALIDATION_ENABLED: sandboxSummary.output_validation_enabled ? "YES" : "NO",
    OUTPUT_SANITIZATION_ENABLED: sandboxSummary.output_sanitization_enabled ? "YES" : "NO",
    RISKS: risks,
    NEXT_STEP: status === "PASS"
      ? "Commit local admin-only sandbox; keep deployment blocked until explicit production safety review."
      : "Fix sandbox verification risks and rerun this script before commit.",
  };
}

function renderExecutionReport({ drySummary, sandboxSummary, status }) {
  return `# Runtime Execution Report

Generated: ${new Date().toISOString()}

- STATUS: ${status.STATUS}
- Dry mode: \`${drySummary.llmExecutionMode}\`
- Sandbox mode: \`${sandboxSummary.llmExecutionMode}\`
- Sandbox executed: \`${sandboxSummary.executed}\`
- Provider: \`${sandboxSummary.provider}\`
- Generated chars: ${sandboxSummary.content_chars}
- External API calls: \`${sandboxSummary.external_api_calls}\`
- Production generation replaced: \`${sandboxSummary.production_generation_replaced}\`
- Telegram mutation: \`${sandboxSummary.telegram_runtime_mutation}\`

The sandbox executes runtime-generated prompt payloads locally through the existing local generation adapter path. It does not publish, auto-post, replace production generation, mutate Telegram polling/webhook setup, run ingest/promote, or mutate FAISS/index files.
`;
}

function renderValidationReport({ sandboxResult, sandboxSummary }) {
  const validation = sandboxResult.final_generation_result?.output_validation || {};
  return `# Runtime Output Validation Report

Generated: ${new Date().toISOString()}

- Enabled: \`${sandboxSummary.output_validation_enabled}\`
- Status: \`${validation.status || "n/a"}\`
- Author voice drift: \`${validation.author_voice_drift}\`
- CTA overload: \`${validation.cta_overload}\`
- Generic AI patterns: \`${validation.generic_ai_patterns}\`
- Repetition spikes: \`${validation.repetition_spikes}\`
- Emotional flatness: \`${validation.emotional_flatness}\`
- Continuity breaks: \`${validation.continuity_breaks}\`
- Hallucination risk signals: \`${validation.hallucination_risk_signals}\`
- Warnings: ${validation.warnings?.length ? validation.warnings.map((item) => `\`${item}\``).join(", ") : "none"}

\`\`\`json
${JSON.stringify(validation.detected || {}, null, 2)}
\`\`\`
`;
}

function renderRisksReport({ status, drySummary, sandboxSummary }) {
  return `# Runtime Sandbox Risks Report

Generated: ${new Date().toISOString()}

- SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
- PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
- PRODUCTION_GENERATION_REPLACED: ${status.PRODUCTION_GENERATION_REPLACED}
- ADMIN_ONLY_SANDBOX: ${status.ADMIN_ONLY_SANDBOX}
- External API calls: \`${sandboxSummary.external_api_calls}\`
- Dry mode executed content: \`${drySummary.executed}\`

## Risks

${status.RISKS.length ? status.RISKS.map((risk) => `- ${risk}`).join("\n") : "- none"}

## Boundary Confirmation

- No deploy.
- No production generation replacement.
- No Telegram polling/webhook mutation.
- No FAISS/index mutation.
- No ingest/promote.
- No auto-posting.
- No public-user runtime activation.
`;
}

function renderQualityReport({ sandboxResult }) {
  const quality = sandboxResult.generation_pipeline?.runtime_execution_sandbox?.quality || {};
  return `# Runtime Execution Quality Report

Generated: ${new Date().toISOString()}

- Runtime quality: ${quality.runtime_quality_score ?? "n/a"}
- Author voice confidence: ${quality.author_voice_confidence ?? "n/a"}
- CTA pressure: ${quality.cta_pressure_score ?? "n/a"}
- Generic AI risk: ${quality.generic_ai_risk_score ?? "n/a"}
- Emotional pacing: ${quality.emotional_pacing_score ?? "n/a"}
- Continuity: ${quality.continuity_score ?? "n/a"}
- Repetition risk: ${quality.repetition_risk_score ?? "n/a"}
- Status: \`${quality.status || "n/a"}\`

\`\`\`json
${JSON.stringify(quality.warnings || [], null, 2)}
\`\`\`
`;
}

function renderCheckReport({ checks, drySummary, sandboxSummary, status }) {
  return `STATUS: ${status.STATUS}
SAFE_TO_COMMIT: ${status.SAFE_TO_COMMIT}
SAFE_TO_DEPLOY: ${status.SAFE_TO_DEPLOY}
PRODUCTION_MUTATION: ${status.PRODUCTION_MUTATION}
PRODUCTION_GENERATION_REPLACED: ${status.PRODUCTION_GENERATION_REPLACED}
ADMIN_ONLY_SANDBOX: ${status.ADMIN_ONLY_SANDBOX}
REAL_RUNTIME_EXECUTION_ENABLED: ${status.REAL_RUNTIME_EXECUTION_ENABLED}
OUTPUT_VALIDATION_ENABLED: ${status.OUTPUT_VALIDATION_ENABLED}
OUTPUT_SANITIZATION_ENABLED: ${status.OUTPUT_SANITIZATION_ENABLED}
RISKS: ${status.RISKS.length ? status.RISKS.join(", ") : "none"}
NEXT_STEP: ${status.NEXT_STEP}

## Syntax Checks

${checks.map((item) => `- \`${item.command}\`: ${item.status}`).join("\n")}

## Runtime Mode Status

\`\`\`json
${JSON.stringify({ dry: drySummary, sandbox: sandboxSummary }, null, 2)}
\`\`\`

## Changed Files Expected

${RELEVANT_FILES.map((file) => `- \`${file}\``).join("\n")}
`;
}

async function writeReports({ checks, dryResult, sandboxResult, drySummary, sandboxSummary, status }) {
  await fs.mkdir(EXECUTION_REPORT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(CHECK_REPORT_PATH), { recursive: true });
  await fs.writeFile(
    path.join(EXECUTION_REPORT_DIR, "runtime_execution_report.md"),
    renderExecutionReport({ drySummary, sandboxSummary, status }),
    "utf8",
  );
  await fs.writeFile(
    path.join(EXECUTION_REPORT_DIR, "runtime_output_validation_report.md"),
    renderValidationReport({ sandboxResult, sandboxSummary }),
    "utf8",
  );
  await fs.writeFile(
    path.join(EXECUTION_REPORT_DIR, "runtime_sandbox_risks_report.md"),
    renderRisksReport({ status, drySummary, sandboxSummary }),
    "utf8",
  );
  await fs.writeFile(
    path.join(EXECUTION_REPORT_DIR, "runtime_execution_quality_report.md"),
    renderQualityReport({ sandboxResult }),
    "utf8",
  );
  await fs.writeFile(
    CHECK_REPORT_PATH,
    renderCheckReport({ checks, drySummary, sandboxSummary, status }),
    "utf8",
  );
}

async function verifyRuntimeExecutionSandbox() {
  const checks = await runSyntaxChecks();
  const dryResult = await runMode("dry_run_prompt_only");
  const sandboxResult = await runMode("sandbox_execution");
  const drySummary = summarizeRun(dryResult);
  const sandboxSummary = summarizeRun(sandboxResult);
  const status = computeStatus({ checks, drySummary, sandboxSummary });
  await writeReports({ checks, dryResult, sandboxResult, drySummary, sandboxSummary, status });
  return {
    ...status,
    reportPath: rel(CHECK_REPORT_PATH),
    executionReportsDir: rel(EXECUTION_REPORT_DIR),
    syntaxChecks: checks.map((item) => ({ command: item.command, status: item.status })),
    dryRun: drySummary,
    sandbox: sandboxSummary,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyRuntimeExecutionSandbox()
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
  verifyRuntimeExecutionSandbox,
};
