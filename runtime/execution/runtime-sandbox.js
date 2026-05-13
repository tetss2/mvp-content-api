import { analyzeRuntimeQuality } from "../../scripts/runtime-quality-analyzer.js";
import { executeRuntimePromptPayload } from "./runtime-executor.js";
import { sanitizeRuntimeOutput } from "./runtime-output-sanitizer.js";
import { validateRuntimeOutput } from "./runtime-response-validator.js";

const SANDBOX_SCHEMA_VERSION = "2026-05-13.runtime_execution_sandbox_orchestrator.v1";

async function runRuntimeExecutionSandbox({
  runtimeResult = {},
  promptPackage = {},
  mode = "dry_run_prompt_only",
  provider,
  allowExternalApi = false,
} = {}) {
  const execution = await executeRuntimePromptPayload({
    promptPackage,
    runtimeResult,
    mode,
    provider,
    allowExternalApi,
  });

  if (!execution.executed) {
    return {
      schema_version: SANDBOX_SCHEMA_VERSION,
      llmExecutionMode: execution.llmExecutionMode,
      sandbox_execution_enabled: false,
      output_validation_enabled: false,
      output_sanitization_enabled: false,
      execution,
      sanitized_output: null,
      validation: null,
      quality: null,
      diagnostics: {
        admin_only: true,
        local_only: true,
        production_generation_replaced: false,
        production_mutation: false,
      },
    };
  }

  const sanitization = sanitizeRuntimeOutput(execution.output, { maxCtas: 1 });
  const validation = validateRuntimeOutput({
    text: sanitization.sanitizedText,
    runtimeResult,
    promptPackage,
  });
  const quality = analyzeRuntimeQuality({
    promptText: sanitization.sanitizedText,
    runtime: runtimeResult.runtime,
    promptPackage,
    generation_pipeline: runtimeResult.generation_pipeline,
    integrated_validation: runtimeResult.integrated_validation,
  });

  return {
    schema_version: SANDBOX_SCHEMA_VERSION,
    llmExecutionMode: execution.llmExecutionMode,
    sandbox_execution_enabled: true,
    output_validation_enabled: true,
    output_sanitization_enabled: true,
    execution,
    raw_output: execution.output,
    sanitized_output: sanitization.sanitizedText,
    sanitization,
    validation,
    quality,
    diagnostics: {
      admin_only: true,
      local_only: true,
      production_generation_replaced: false,
      production_mutation: false,
      telegram_delivery_allowed: false,
      auto_posting: false,
      external_api_calls: execution.diagnostics.external_api_calls,
      warnings: [...new Set([...(execution.warnings || []), ...(validation.warnings || [])])],
    },
  };
}

export {
  SANDBOX_SCHEMA_VERSION,
  runRuntimeExecutionSandbox,
};
