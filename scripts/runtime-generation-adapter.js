import path from "path";
import { fileURLToPath } from "url";
import {
  RUNTIME_CONSTRAINTS,
  loadPersistentCognition,
  runUnifiedGenerationRuntime,
} from "./unified-generation-runtime.js";
import { runGenerationSandbox } from "./expert-generation-sandbox.js";

const ROOT = process.cwd();
const DEFAULT_EXPERT_ID = "dinara";

const ADAPTER_SCHEMA_VERSION = "2026-05-13.runtime_generation_adapter.v1";
const ADAPTER_CONSTRAINTS = {
  ...RUNTIME_CONSTRAINTS,
  adapter_mode: "local_mock_only",
  production_generation_replaced: false,
  telegram_handlers_modified: false,
  railway_or_env_modified: false,
};

function normalizeGenerationIntent(intent = "educational_post") {
  const map = {
    educational: "educational_post",
    audience_warming: "educational_post",
    authority: "educational_post",
    therapeutic: "therapeutic_case",
    faq: "faq_answer",
    FAQ: "faq_answer",
    sales: "sales_post",
    soft_sales: "sales_post",
    reels_hook: "short_hook",
    hook: "short_hook",
    longform_article: "educational_post",
  };
  return map[intent] || intent || "educational_post";
}

function normalizePlatform(platform = "generic") {
  if (String(platform).includes("telegram")) return "telegram";
  if (String(platform).includes("instagram") || String(platform).includes("reels") || String(platform).includes("carousel") || String(platform).includes("story")) {
    return "instagram";
  }
  return "generic";
}

function normalizeFormat({ format, platform, length, intent }) {
  if (format === "article" || intent === "longform_article" || length === "long") return "post";
  if (String(platform).includes("carousel")) return "carousel_script";
  if (String(platform).includes("reels")) return "reel_script";
  if (intent === "short_hook") return "hook_list";
  if (intent === "faq_answer") return "answer";
  return "post";
}

function normalizeCtaStyle(runtimeDecision = {}, requested = {}) {
  if (requested.ctaStyle || requested.cta_style) return requested.ctaStyle || requested.cta_style;
  const strength = runtimeDecision.cta_strength;
  if (strength === "strong") return "direct";
  if (strength === "low") return "soft";
  if (strength === "none") return "none";
  return "soft";
}

function normalizeTone(runtimeDecision = {}, requested = {}) {
  if (requested.tone) return requested.tone;
  if (runtimeDecision.emotional_depth === "stabilizing") return "calm";
  if (runtimeDecision.authority_framing === "explicit_expert_frame") return "expert_warm";
  if (runtimeDecision.emotional_depth === "deep") return "empathetic";
  return "expert_warm";
}

function buildSandboxRequest({ request, runtimeResult }) {
  const runtimeState = runtimeResult.runtime_state;
  const runtimeDecision = runtimeState.decision_engine;
  const generationIntent = normalizeGenerationIntent(runtimeState.generation_intent.intent);
  const platform = normalizePlatform(runtimeState.platform_target);
  const length = request.length || runtimeState.generation_intent.requested_length || "medium";
  const format = normalizeFormat({
    format: request.format || runtimeState.production_format,
    platform: runtimeState.platform_target,
    length,
    intent: generationIntent,
  });

  return {
    expert_id: runtimeState.expert_identity.expert_id,
    generation_intent: generationIntent,
    user_request: request.userRequest || request.user_request || runtimeState.generation_intent.topic,
    output_constraints: {
      platform,
      length,
      format,
      tone: normalizeTone(runtimeDecision, request),
      cta_style: normalizeCtaStyle(runtimeDecision, request),
      language: request.language || "ru",
      runtime_decision_context: {
        hook_type: runtimeDecision.hook_type,
        emotional_depth: runtimeDecision.emotional_depth,
        cta_strength: runtimeDecision.cta_strength,
        authority_framing: runtimeDecision.authority_framing,
        narrative_continuation: runtimeDecision.narrative_continuation,
        content_pacing: runtimeDecision.content_pacing,
      },
    },
    adapter: "mock",
    run_name: request.runName || `runtime-${generationIntent}-${length}`,
    max_context_items: request.maxContextItems || 6,
    max_total_chars: request.maxTotalChars || 12000,
  };
}

function summarizeContext(contextPack = {}) {
  return {
    selected_count: contextPack.context_summary?.selected_count || contextPack.selected_items?.length || 0,
    suppressed_count: contextPack.context_summary?.suppressed_count || contextPack.suppressed_items?.length || 0,
    candidate_count: contextPack.context_summary?.candidate_count || 0,
    warnings: contextPack.context_summary?.warnings || [],
    content_kind_counts: contextPack.context_summary?.content_kind_counts || {},
    source_type_counts: contextPack.context_summary?.source_type_counts || {},
    selected_items: (contextPack.selected_items || []).map((item) => ({
      id: item.id,
      title: item.title,
      content_kind: item.content_kind,
      source_type: item.source_type,
      confidence_level: item.confidence_level,
      selected_because: item.selected_because,
    })),
  };
}

function buildIntegratedValidation({ runtimeResult, generationResult }) {
  const runtimeWarnings = runtimeResult.validation?.warnings || [];
  const generationWarnings = generationResult.evaluation?.warnings || [];
  const adapterWarnings = generationResult.adapter_result?.warnings || [];
  const warnings = [...new Set([...runtimeWarnings, ...generationWarnings, ...adapterWarnings])];
  const runtimeQuality = runtimeResult.quality_score?.final_quality_score || 0;
  const generationQuality = generationResult.evaluation?.overall_score || 0;
  return {
    status: warnings.length ? "pass_with_warnings" : "pass",
    runtime_validation_status: runtimeResult.validation?.status || "unknown",
    generation_evaluation_score: generationQuality,
    runtime_quality_score: runtimeQuality,
    combined_quality_score: Number(((runtimeQuality * 0.55) + (generationQuality * 0.45)).toFixed(3)),
    repetition_risk: runtimeResult.validation?.repetition_risk || runtimeResult.runtime_state?.repetition_risk,
    trust_cta_pacing: runtimeResult.trust_pacing,
    author_voice_status: {
      score: Number((runtimeResult.author_voice_validation?.overall_voice_match_score || 0).toFixed(3)),
      generic_ai_risk: runtimeResult.author_voice_validation?.generic_ai_risk,
      recommendations: runtimeResult.author_voice_validation?.recommendations || [],
    },
    warnings,
  };
}

async function runRuntimeGenerationAdapter(request = {}, options = {}) {
  const root = options.root || ROOT;
  const expertId = request.expertId || request.expert_id || DEFAULT_EXPERT_ID;
  const cognition = await loadPersistentCognition(expertId, {
    root,
    initialize: options.initializeStorage !== false,
  });

  const runtimeResult = await runUnifiedGenerationRuntime({
    expertId,
    topic: request.topic || request.userRequest || request.user_request || "relationship anxiety",
    intent: request.intent || request.generation_intent || "educational_post",
    platform: request.platform || "instagram_post",
    format: request.format || "post",
    length: request.length || "medium",
    tone: request.tone,
    ctaType: request.ctaType || request.cta_type || "low_pressure_cta",
    audienceState: request.audienceState || request.audience_state || "warming",
    campaignType: request.campaignType || "trust_building_flow",
    day: request.day,
    previousPacks: request.previousPacks || [],
  }, {
    root,
    persist: options.persistRuntime !== false,
    initializeStorage: options.initializeStorage !== false,
    contextLimit: request.contextLimit || 6,
  });

  const sandboxRequest = buildSandboxRequest({ request, runtimeResult });
  const generationResult = await runGenerationSandbox({
    root,
    ...sandboxRequest,
  });

  const integratedValidation = buildIntegratedValidation({ runtimeResult, generationResult });
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    constraints: ADAPTER_CONSTRAINTS,
    expert_id: expertId,
    adapter_mode: "local_runtime_to_generation_sandbox",
    connected_files: [
      "scripts/unified-generation-runtime.js",
      "scripts/expert-generation-sandbox.js",
      "scripts/expert-context-assembly.js",
      "scripts/expert-generation-orchestration.js",
      "scripts/expert-retrieval-intelligence.js",
      "scripts/expert-output-evaluation.js",
      "scripts/adapters/mock-generation-adapter.js",
    ],
    cognition_loading: {
      loaded_from_disk: cognition.loaded_from_disk,
      storage_paths: Object.fromEntries(
        Object.entries(cognition.paths).map(([key, target]) => [key, path.relative(root, target).replace(/\\/g, "/")]),
      ),
    },
    request,
    runtime: {
      run_id: runtimeResult.run_id,
      runtime_state: runtimeResult.runtime_state,
      selected_generation_decisions: runtimeResult.runtime_state.decision_engine,
      orchestration_flow: runtimeResult.orchestration_flow,
      context_summary: runtimeResult.context_pack?.context_summary,
      production_pack: runtimeResult.production_pack,
      validation: runtimeResult.validation,
      quality_score: runtimeResult.quality_score,
      trust_pacing: runtimeResult.trust_pacing,
      author_voice_validation: runtimeResult.author_voice_validation,
    },
    generation_pipeline: {
      sandbox_request: sandboxRequest,
      retrieval_summary: generationResult.retrieval_summary,
      assembled_context_summary: summarizeContext(generationResult.context_pack),
      orchestration_plan: generationResult.orchestration_plan,
      generated_content_structure: {
        provider: generationResult.adapter_result?.provider,
        model: generationResult.adapter_result?.model,
        output_chars: String(generationResult.generated_output || "").length,
        paragraph_count: String(generationResult.generated_output || "").split(/\n\s*\n/).filter(Boolean).length,
        artifact_paths: generationResult.storage?.relative_artifact_paths,
      },
      evaluation: generationResult.evaluation,
      adapter_warnings: generationResult.adapter_result?.warnings || [],
    },
    integrated_validation: integratedValidation,
    final_generation_result: {
      publication_status: "not_published_local_simulation",
      telegram_runtime_mutation: false,
      production_generation_replaced: false,
      external_api_calls: false,
      faiss_or_index_mutation: false,
      ingest_or_promote: false,
      production_database_migration: false,
      auto_posting: false,
      content: generationResult.generated_output,
      quality_score: integratedValidation.combined_quality_score,
      warnings: integratedValidation.warnings,
    },
  };
}

async function runCli() {
  const result = await runRuntimeGenerationAdapter({
    expertId: DEFAULT_EXPERT_ID,
    topic: "relationship anxiety",
    intent: "educational_post",
    platform: "instagram_post",
    length: "medium",
    audienceState: "warming",
  });
  console.log(JSON.stringify({
    adapter_mode: result.adapter_mode,
    expert_id: result.expert_id,
    runtime_run_id: result.runtime.run_id,
    generation_score: result.generation_pipeline.evaluation.overall_score,
    combined_quality_score: result.integrated_validation.combined_quality_score,
    warnings: result.integrated_validation.warnings,
    artifact_paths: result.generation_pipeline.generated_content_structure.artifact_paths,
    safety: result.final_generation_result,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  ADAPTER_CONSTRAINTS,
  ADAPTER_SCHEMA_VERSION,
  buildSandboxRequest,
  runRuntimeGenerationAdapter,
  summarizeContext,
};
