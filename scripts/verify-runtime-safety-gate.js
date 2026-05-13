import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports", "checks", "step_verification_report.md");

const REQUIRED_RUNTIME_FILES = [
  "scripts/unified-generation-runtime.js",
  "scripts/simulate-unified-runtime.js",
  "scripts/runtime-generation-adapter.js",
  "scripts/simulate-runtime-generation-flow.js",
];

const REQUIRED_REPORT_DIRS = [
  "reports/runtime",
  "reports/runtime-generation",
];

const REQUIRED_COGNITION_DIRS = [
  "storage/cognition/dinara",
];

const REQUIRED_RUNTIME_REPORTS = [
  "reports/runtime-generation/runtime_generation_flow_report.md",
  "reports/runtime-generation/runtime_adapter_report.md",
  "reports/runtime-generation/runtime_generation_validation_report.md",
  "reports/runtime-generation/runtime_integration_risks_report.md",
  "reports/runtime-generation/runtime_prompt_assembly_report.md",
];

const SCAN_FILES = [
  ...REQUIRED_RUNTIME_FILES,
  "scripts/verify-runtime-safety-gate.js",
];

const ALLOWED_WARNINGS = [
  "author_voice_drift",
  "reduce_cta_strength",
];

const COMMANDS = [
  ["node", ["--check", "scripts/unified-generation-runtime.js"]],
  ["node", ["--check", "scripts/simulate-unified-runtime.js"]],
  ["node", ["--check", "scripts/runtime-generation-adapter.js"]],
  ["node", ["--check", "scripts/simulate-runtime-generation-flow.js"]],
  ["node", ["scripts/simulate-runtime-generation-flow.js"]],
];

const DANGEROUS_PATTERNS = [
  {
    category: "deploy",
    label: "Railway deploy command",
    pattern: /\brailway\s+(up|deploy|link|env|run)\b/i,
  },
  {
    category: "deploy",
    label: "Production deploy command",
    pattern: /\b(vercel|netlify|flyctl|docker)\s+(deploy|push|release|build\s+--push)\b/i,
  },
  {
    category: "telegram",
    label: "Telegram polling or webhook mutation",
    pattern: /(new\s+TelegramBot|setWebHook|deleteWebHook|startPolling|stopPolling|bot\.on\(|bot\.onText\()/i,
  },
  {
    category: "faiss",
    label: "FAISS/index write or mutation",
    pattern: /(faiss\.index|vector_index|knowledge_indexes).*(writeFile|appendFile|rename|copyFile|unlink|rm|mkdir|promote|mutation)/i,
  },
  {
    category: "ingest",
    label: "Ingest or promote command",
    pattern: /\b(knowledge_ingest|knowledge_promote|--promote|--apply|ingest|promote)\b/i,
  },
  {
    category: "external_api",
    label: "External API call primitive",
    pattern: /\b(fetch|axios|OpenAI|createClient|fal\.|cloudinary|Fish|node-fetch)\b/i,
  },
  {
    category: "auto_posting",
    label: "Auto-posting or publishing command",
    pattern: /(sendMessage|sendPhoto|sendVideo|publish|auto[-_]?post|postToTelegram|broadcast)/i,
  },
  {
    category: "database",
    label: "Database migration command",
    pattern: /\b(migrate|migration|prisma\s+migrate|supabase\s+db|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE)\b/i,
  },
  {
    category: "production_env",
    label: "Production process.env mutation",
    pattern: /process\.env\.(NODE_ENV|RAILWAY_ENVIRONMENT|TELEGRAM_TOKEN|SUPABASE_SERVICE_KEY|OPENAI_API_KEY)\s*=/i,
  },
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

async function statKind(relativePath) {
  try {
    const stat = await fs.stat(path.join(ROOT, relativePath));
    return stat.isDirectory() ? "directory" : "file";
  } catch {
    return null;
  }
}

async function checkRequiredPaths() {
  const fileChecks = [];
  for (const file of REQUIRED_RUNTIME_FILES) {
    fileChecks.push({ path: file, required: "file", exists: await exists(file), kind: await statKind(file) });
  }

  const directoryChecks = [];
  for (const dir of [...REQUIRED_REPORT_DIRS, ...REQUIRED_COGNITION_DIRS]) {
    directoryChecks.push({ path: dir, required: "directory", exists: await exists(dir), kind: await statKind(dir) });
  }

  const reportChecks = [];
  for (const report of REQUIRED_RUNTIME_REPORTS) {
    reportChecks.push({ path: report, required: "file", exists: await exists(report), kind: await statKind(report) });
  }

  return { fileChecks, directoryChecks, reportChecks };
}

function isDocumentationLine(line) {
  return /^\s*(\/\/|#|\*|-|\*)/.test(line)
    || line.includes("no_")
    || line.includes("false")
    || line.includes("allowed")
    || line.includes("disabled")
    || line.includes("not_")
    || line.includes("blocked")
    || line.includes("dry_run")
    || line.includes("intended_provider")
    || line.includes("confirmation");
}

function isSelfPatternDefinition(file, line) {
  return file.endsWith("verify-runtime-safety-gate.js")
    && (line.includes("pattern:") || line.includes("label:") || line.includes("category:"));
}

async function scanSafetyPatterns() {
  const findings = [];
  for (const file of SCAN_FILES) {
    const absolute = path.join(ROOT, file);
    if (!await exists(file)) continue;
    const content = await fs.readFile(absolute, "utf8");
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const rule of DANGEROUS_PATTERNS) {
        if (!rule.pattern.test(line)) continue;
        const documentationOnly = isDocumentationLine(line) || isSelfPatternDefinition(file, line);
        findings.push({
          file,
          line: index + 1,
          category: rule.category,
          label: rule.label,
          severity: documentationOnly ? "info" : "risk",
          text: line.trim().slice(0, 220),
        });
      }
    }
  }
  return findings;
}

async function runCommand(command, args) {
  const startedAt = new Date().toISOString();
  try {
    const result = await execFileAsync(command, args, {
      cwd: ROOT,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20,
    });
    return {
      command: [command, ...args].join(" "),
      status: "PASS",
      exitCode: 0,
      startedAt,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error) {
    return {
      command: [command, ...args].join(" "),
      status: "FAIL",
      exitCode: error.code ?? 1,
      startedAt,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}

async function runVerificationCommands() {
  const results = [];
  for (const [command, args] of COMMANDS) {
    results.push(await runCommand(command, args));
  }
  return results;
}

function parseSimulationOutput(commandResults) {
  const simulation = commandResults.find((result) => result.command === "node scripts/simulate-runtime-generation-flow.js");
  if (!simulation || simulation.status !== "PASS") {
    return {
      parsed: false,
      reason: "simulation_command_failed_or_missing",
      raw: simulation?.stdout || simulation?.stderr || "",
      signals: {},
      warnings: [],
      unexpectedWarnings: [],
    };
  }

  try {
    const parsed = JSON.parse(simulation.stdout);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    const contextCounts = (parsed.simulation_output_summary || [])
      .map((item) => item.context_summary?.selected_count)
      .filter((value) => Number.isFinite(Number(value)));
    const unexpectedWarnings = warnings.filter((warning) => !ALLOWED_WARNINGS.includes(warning));
    return {
      parsed: true,
      raw: simulation.stdout,
      signals: {
        real_local_prompt_assembly_used: parsed.real_local_prompt_assembly_used,
        real_local_prompt_assembly_used_ok: parsed.real_local_prompt_assembly_used === true,
        mock_content_generation_used: parsed.mock_content_generation_used,
        mock_content_generation_used_ok: parsed.mock_content_generation_used === false,
        llmExecutionMode: parsed.llmExecutionMode,
        llmExecutionMode_ok: parsed.llmExecutionMode === "dry_run_prompt_only",
        selected_context_counts: contextCounts,
        selected_context_count_exists: contextCounts.length > 0,
        average_combined_quality: parsed.average_combined_quality,
        average_combined_quality_exists: Number.isFinite(Number(parsed.average_combined_quality)),
        warnings_listed: Array.isArray(parsed.warnings),
      },
      warnings,
      unexpectedWarnings,
    };
  } catch (error) {
    return {
      parsed: false,
      reason: `json_parse_failed:${error.message}`,
      raw: simulation.stdout,
      signals: {},
      warnings: [],
      unexpectedWarnings: [],
    };
  }
}

function commandSummary(result) {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  return {
    command: result.command,
    status: result.status,
    exitCode: result.exitCode,
    stdoutSummary: stdout ? stdout.slice(0, 600) : "",
    stderrSummary: stderr ? stderr.slice(0, 600) : "",
  };
}

function topFlagFromFindings(findings, category) {
  return findings.some((finding) => finding.category === category && finding.severity === "risk") ? "YES" : "NO";
}

function computeStatus({ paths, commands, simulation, findings }) {
  const missingRequired = [
    ...paths.fileChecks,
    ...paths.directoryChecks,
    ...paths.reportChecks,
  ].filter((item) => !item.exists || item.kind !== item.required);
  const commandFailures = commands.filter((item) => item.status !== "PASS");
  const riskFindings = findings.filter((finding) => finding.severity === "risk");
  const signalFailures = [];

  if (!simulation.parsed) signalFailures.push(simulation.reason || "simulation_not_parsed");
  if (simulation.parsed) {
    if (simulation.signals.real_local_prompt_assembly_used_ok !== true) signalFailures.push("real_local_prompt_assembly_used_not_true");
    if (simulation.signals.mock_content_generation_used_ok !== true) signalFailures.push("mock_content_generation_used_not_false");
    if (simulation.signals.llmExecutionMode_ok !== true) signalFailures.push("llmExecutionMode_not_dry_run_prompt_only");
    if (!simulation.signals.selected_context_count_exists) signalFailures.push("selected_context_count_missing");
    if (!simulation.signals.average_combined_quality_exists) signalFailures.push("average_combined_quality_missing");
    if (!simulation.signals.warnings_listed) signalFailures.push("warnings_missing");
  }

  const status = missingRequired.length || commandFailures.length || riskFindings.length || signalFailures.length || simulation.unexpectedWarnings.length
    ? "FAIL"
    : "PASS";

  return {
    status,
    safeToCommit: status === "PASS" ? "YES" : "NO",
    missingRequired,
    commandFailures,
    riskFindings,
    signalFailures,
    productionTouched: [
      "deploy",
      "database",
      "production_env",
    ].some((category) => topFlagFromFindings(findings, category) === "YES") ? "YES" : "NO",
    telegramTouched: topFlagFromFindings(findings, "telegram"),
    faissTouched: topFlagFromFindings(findings, "faiss"),
    externalApiUsed: topFlagFromFindings(findings, "external_api"),
  };
}

function renderCheckList(items) {
  if (!items.length) return "- none";
  return items.map((item) => {
    if (typeof item === "string") return `- ${item}`;
    return `- \`${item.path}\`: expected ${item.required}, actual ${item.kind || "missing"}`;
  }).join("\n");
}

function renderCommands(commands) {
  return commands.map((result) => [
    `- \`${result.command}\`: ${result.status}`,
    result.stdout.trim() ? `  - stdout: \`${result.stdout.trim().slice(0, 220).replace(/\s+/g, " ")}\`` : null,
    result.stderr.trim() ? `  - stderr: \`${result.stderr.trim().slice(0, 220).replace(/\s+/g, " ")}\`` : null,
  ].filter(Boolean).join("\n")).join("\n");
}

function renderFindings(findings) {
  if (!findings.length) return "- none";
  return findings.map((finding) => (
    `- ${finding.severity.toUpperCase()} ${finding.category}: ${finding.label} at \`${finding.file}:${finding.line}\` -> \`${finding.text}\``
  )).join("\n");
}

function renderReport({ paths, commands, simulation, findings, status }) {
  const commandSummaries = commands.map(commandSummary);
  const changedRuntimeFiles = [
    ...REQUIRED_RUNTIME_FILES,
    "scripts/verify-runtime-safety-gate.js",
    "reports/checks/step_verification_report.md",
  ];

  const risks = [
    ...status.missingRequired.map((item) => `Missing required ${item.required}: ${item.path}`),
    ...status.commandFailures.map((item) => `Command failed: ${item.command}`),
    ...status.signalFailures.map((item) => `Simulation signal failed: ${item}`),
    ...simulation.unexpectedWarnings.map((item) => `Unexpected warning: ${item}`),
    ...status.riskFindings.map((item) => `Safety risk: ${item.category} in ${item.file}:${item.line}`),
  ];

  return `STATUS: ${status.status}
SAFE_TO_COMMIT: ${status.safeToCommit}
SAFE_TO_DEPLOY: NO
PRODUCTION_TOUCHED: ${status.productionTouched}
TELEGRAM_TOUCHED: ${status.telegramTouched}
FAISS_TOUCHED: ${status.faissTouched}
EXTERNAL_API_USED: ${status.externalApiUsed}

## Summary

Runtime safety gate completed at ${new Date().toISOString()}.

- Required runtime files: ${paths.fileChecks.every((item) => item.exists && item.kind === item.required) ? "PASS" : "FAIL"}
- Required report directories: ${paths.directoryChecks.every((item) => item.exists && item.kind === item.required) ? "PASS" : "FAIL"}
- Required runtime-generation reports: ${paths.reportChecks.every((item) => item.exists && item.kind === item.required) ? "PASS" : "FAIL"}
- Verification commands: ${commands.every((item) => item.status === "PASS") ? "PASS" : "FAIL"}
- Simulation parsing: ${simulation.parsed ? "PASS" : "FAIL"}
- Safety scan risk findings: ${status.riskFindings.length}

## Changed Runtime Files

${changedRuntimeFiles.map((file) => `- \`${file}\``).join("\n")}

## Verification Commands

${renderCommands(commands)}

## Simulation Signals

\`\`\`json
${JSON.stringify(simulation.signals, null, 2)}
\`\`\`

## Allowed Warnings

${ALLOWED_WARNINGS.map((warning) => `- \`${warning}\`${simulation.warnings.includes(warning) ? " (observed)" : ""}`).join("\n")}

## Unexpected Warnings

${simulation.unexpectedWarnings.length ? simulation.unexpectedWarnings.map((warning) => `- \`${warning}\``).join("\n") : "- none"}

## Safety Findings

${renderFindings(findings)}

## Risks

${risks.length ? risks.map((risk) => `- ${risk}`).join("\n") : "- No blocking runtime safety risks detected."}

## Next Step

${status.status === "PASS"
    ? "Safe to commit the local runtime safety gate and continue toward an admin-only dry-run preview design. Deployment remains explicitly blocked."
    : "Resolve the failed checks above, rerun `node scripts/verify-runtime-safety-gate.js`, and keep deployment blocked."}

<!-- command_summaries
${JSON.stringify(commandSummaries, null, 2)}
-->
`;
}

async function writeReport(content) {
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, content, "utf8");
}

async function runSafetyGate() {
  const paths = await checkRequiredPaths();
  const findings = await scanSafetyPatterns();
  const commands = await runVerificationCommands();
  const simulation = parseSimulationOutput(commands);
  const status = computeStatus({ paths, commands, simulation, findings });
  const report = renderReport({ paths, commands, simulation, findings, status });
  await writeReport(report);

  return {
    status: status.status,
    safeToCommit: status.safeToCommit,
    safeToDeploy: "NO",
    productionTouched: status.productionTouched,
    telegramTouched: status.telegramTouched,
    faissTouched: status.faissTouched,
    externalApiUsed: status.externalApiUsed,
    reportPath: rel(REPORT_PATH),
    commandResults: commands.map(commandSummary),
    simulationSignals: simulation.signals,
    allowedWarnings: ALLOWED_WARNINGS,
    observedWarnings: simulation.warnings,
    unexpectedWarnings: simulation.unexpectedWarnings,
    safetyFindings: findings,
    risks: {
      missingRequired: status.missingRequired,
      commandFailures: status.commandFailures.map((item) => item.command),
      signalFailures: status.signalFailures,
      riskFindings: status.riskFindings,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSafetyGate()
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
  ALLOWED_WARNINGS,
  REQUIRED_RUNTIME_FILES,
  REQUIRED_RUNTIME_REPORTS,
  runSafetyGate,
};
