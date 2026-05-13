import { generateWithMockAdapter } from "../../scripts/adapters/mock-generation-adapter.js";
import { generateWithOpenAIAdapter } from "../../scripts/adapters/openai-generation-adapter.js";

const EXECUTION_SCHEMA_VERSION = "2026-05-13.runtime_execution_sandbox.v1";
const ALLOWED_EXECUTION_MODES = new Set(["dry_run_prompt_only", "sandbox_execution"]);

function normalizeExecutionMode(mode = "dry_run_prompt_only") {
  return ALLOWED_EXECUTION_MODES.has(mode) ? mode : "dry_run_prompt_only";
}

function getPromptPayload(promptPackage = {}) {
  const assembledPrompt = promptPackage.assembledPrompt || {};
  return {
    systemPrompt: assembledPrompt.system_prompt || promptPackage.messagePayload?.[0]?.content || "",
    finalPrompt: assembledPrompt.final_prompt || promptPackage.messagePayload?.[1]?.content || "",
  };
}

async function executeRuntimePromptPayload({
  promptPackage = {},
  runtimeResult = {},
  mode = "dry_run_prompt_only",
  provider = process.env.RUNTIME_SANDBOX_PROVIDER || "mock",
  allowExternalApi = false,
} = {}) {
  const llmExecutionMode = normalizeExecutionMode(mode);
  if (llmExecutionMode !== "sandbox_execution") {
    return {
      schema_version: EXECUTION_SCHEMA_VERSION,
      llmExecutionMode,
      executed: false,
      provider: null,
      model: null,
      output: null,
      usage: null,
      warnings: ["dry_run_prompt_only"],
      diagnostics: {
        production_execution_allowed: false,
        telegram_delivery_allowed: false,
        auto_posting: false,
        external_api_calls: false,
      },
    };
  }

  const { systemPrompt, finalPrompt } = getPromptPayload(promptPackage);
  const plan = promptPackage.orchestrationPlan || runtimeResult.generation_pipeline?.orchestration_plan || {};
  const requestedProvider = provider === "openai" ? "openai" : "mock";
  let adapterResult;

  if (requestedProvider === "openai" && allowExternalApi) {
    adapterResult = await generateWithOpenAIAdapter({
      systemPrompt,
      finalPrompt,
      plan,
      model: promptPackage.configPayload?.intended_model,
    });
  } else {
    adapterResult = await generateWithMockAdapter({
      systemPrompt,
      finalPrompt,
      plan,
    });
    if (requestedProvider === "openai") {
      adapterResult = {
        ...adapterResult,
        adapter_requested: "openai",
        adapter_fallback: "mock",
        warnings: [
          ...(adapterResult.warnings || []),
          "openai_provider_blocked_for_local_sandbox_without_explicit_allowExternalApi",
        ],
      };
    }
  }

  return {
    schema_version: EXECUTION_SCHEMA_VERSION,
    llmExecutionMode,
    executed: true,
    provider: adapterResult.provider,
    requested_provider: requestedProvider,
    model: adapterResult.model,
    output: adapterResult.output || "",
    usage: adapterResult.usage || null,
    warnings: adapterResult.warnings || [],
    diagnostics: {
      production_execution_allowed: false,
      telegram_delivery_allowed: false,
      auto_posting: false,
      external_api_calls: requestedProvider === "openai" && allowExternalApi,
      prompt_chars: systemPrompt.length + finalPrompt.length,
      output_chars: String(adapterResult.output || "").length,
    },
  };
}

export {
  ALLOWED_EXECUTION_MODES,
  EXECUTION_SCHEMA_VERSION,
  executeRuntimePromptPayload,
  normalizeExecutionMode,
};
