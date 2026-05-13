import path from "path";
import { fileURLToPath } from "url";
import {
  RUNTIME_CONSTRAINTS,
  loadPersistentCognition,
  runUnifiedGenerationRuntime,
} from "./unified-generation-runtime.js";
import { assembleContextPack } from "./expert-context-assembly.js";
import { createGenerationPlan } from "./expert-generation-orchestration.js";
import { rerankRetrievalItems } from "./expert-retrieval-intelligence.js";
import { assembleFinalPrompt, createLocalRetrievalCandidates } from "./expert-generation-sandbox.js";

const ROOT = process.cwd();
const DEFAULT_EXPERT_ID = "dinara";

const ADAPTER_SCHEMA_VERSION = "2026-05-13.runtime_generation_adapter.v1";
const ADAPTER_CONSTRAINTS = {
  ...RUNTIME_CONSTRAINTS,
  adapter_mode: "local_prompt_assembly_dry_run",
  production_generation_replaced: false,
  telegram_handlers_modified: false,
  railway_or_env_modified: false,
  llm_execution_disabled: true,
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

function buildGenerationPackageRequest({ request, runtimeResult }) {
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
    adapter: "dry_run_prompt_only",
    run_name: request.runName || `runtime-${generationIntent}-${length}`,
    max_context_items: request.maxContextItems || 6,
    max_total_chars: request.maxTotalChars || 12000,
  };
}

function contentLengthPolicy(length = "medium") {
  const policies = {
    short: {
      label: "short_post",
      target_chars: "500-800",
      target_paragraphs: "2-3",
      max_tokens: 700,
      instruction: "Keep one clear idea, compact paragraphs, and one soft next step.",
    },
    medium: {
      label: "normal_post",
      target_chars: "1000-1500",
      target_paragraphs: "3-5",
      max_tokens: 1100,
      instruction: "Use a clear hook, one expert explanation, one example, and a proportional CTA.",
    },
    long: {
      label: "article_mode",
      target_chars: "2200-3500",
      target_paragraphs: "6-10",
      max_tokens: 1800,
      instruction: "Build a deeper article-like structure with continuity, nuance, and sectioned reasoning.",
    },
  };
  return policies[length] || policies.medium;
}

function buildMessagePayload(promptAssembly) {
  return [
    {
      role: "system",
      content: promptAssembly.system_prompt,
    },
    {
      role: "user",
      content: promptAssembly.final_prompt,
    },
  ];
}

function buildConfigPayload({ generationPackageRequest, runtimeResult }) {
  const lengthPolicy = contentLengthPolicy(generationPackageRequest.output_constraints.length);
  return {
    llmExecutionMode: "dry_run_prompt_only",
    intended_provider: "openai-compatible-chat",
    intended_model: "gpt-4o-mini",
    temperature: runtimeResult.runtime_state.decision_engine.cta_strength === "strong" ? 0.55 : 0.65,
    max_tokens: lengthPolicy.max_tokens,
    language: generationPackageRequest.output_constraints.language,
    platform: generationPackageRequest.output_constraints.platform,
    format: generationPackageRequest.output_constraints.format,
    length_mode: generationPackageRequest.output_constraints.length,
    tone_mode: generationPackageRequest.output_constraints.tone,
    cta_style: generationPackageRequest.output_constraints.cta_style,
    production_execution_allowed: false,
    external_api_calls_allowed: false,
    telegram_delivery_allowed: false,
    safety_boundaries: {
      no_diagnosis: true,
      no_guaranteed_outcomes: true,
      no_private_case_details: true,
      no_suppressed_context: true,
      no_internal_trace_leakage: true,
    },
  };
}

function summarizeExpertProfile(runtimeResult = {}) {
  const expert = runtimeResult.expert || {};
  return {
    expert_id: expert.expert_id,
    display_name: expert.display_name || expert.name || expert.expert_id,
    scenario: expert.scenario || runtimeResult.runtime_state?.expert_identity?.scenario,
    profile_path: expert.profile_path,
    author_voice_score: runtimeResult.author_voice_validation?.overall_voice_match_score,
    generic_ai_risk: runtimeResult.author_voice_validation?.generic_ai_risk,
  };
}

function buildAuthorVoiceConstraints(runtimeResult = {}) {
  const validation = runtimeResult.author_voice_validation || {};
  return {
    voice_match_score: Number((validation.overall_voice_match_score || 0).toFixed(3)),
    generic_ai_risk: validation.generic_ai_risk || "unknown",
    required_adjustments: validation.recommendations || [],
    enforce: [
      "Use warm expert Russian prose.",
      "Avoid formulaic AI transitions and motivational slogans.",
      "Prefer specific therapeutic framing over generic advice.",
      "Keep CTA soft unless trust pacing explicitly allows escalation.",
    ],
  };
}

function buildAntiRepetitionConstraints(runtimeResult = {}) {
  const repetition = runtimeResult.validation?.repetition_risk || runtimeResult.runtime_state?.repetition_risk || {};
  const recentTopics = runtimeResult.runtime_state?.narrative_continuity?.recent_topics || [];
  return {
    repetition_status: repetition.status,
    repetition_risk_score: repetition.risk_score,
    same_topic_recent_count: repetition.same_topic_recent_count,
    repeated_hook_recent_count: repetition.repeated_hook_recent_count,
    recent_topics: recentTopics,
    enforce: [
      "Do not reuse the same hook frame if repetition risk is watch or higher.",
      "Use a different narrative angle when the topic appeared recently.",
      "Avoid repeating CTA wording from recent CTA memory.",
    ],
  };
}

function buildPromptQuality({ promptAssembly, contextPack, runtimeResult }) {
  const systemLength = promptAssembly.system_prompt.length;
  const userLength = promptAssembly.final_prompt.length;
  const selectedCount = contextPack.selected_items?.length || 0;
  const contextWarnings = contextPack.context_summary?.warnings || [];
  const runtimeWarnings = runtimeResult.validation?.warnings || [];
  const totalLength = systemLength + userLength;
  const lengthScore = totalLength > 18000 ? 0.62 : totalLength > 12000 ? 0.78 : 0.9;
  const contextScore = selectedCount >= 4 ? 0.9 : selectedCount >= 2 ? 0.76 : 0.5;
  const warningPenalty = Math.min(0.2, (contextWarnings.length + runtimeWarnings.length) * 0.025);
  const promptScore = Number(((lengthScore * 0.35) + (contextScore * 0.35) + 0.25 - warningPenalty).toFixed(3));
  const warnings = [
    ...contextWarnings,
    ...runtimeWarnings,
    totalLength > 18000 ? "prompt_length_high" : null,
    selectedCount < 2 ? "low_context_count" : null,
  ].filter(Boolean);
  return {
    status: warnings.length ? "pass_with_warnings" : "pass",
    prompt_score: promptScore,
    system_prompt_chars: systemLength,
    user_prompt_chars: userLength,
    total_prompt_chars: totalLength,
    selected_context_count: selectedCount,
    warnings: [...new Set(warnings)],
  };
}

async function assembleRuntimePromptPackage({ root, expertId, generationPackageRequest, runtimeResult }) {
  const retrieval = await createLocalRetrievalCandidates({
    root,
    expertId,
  });
  const reranked = rerankRetrievalItems(retrieval.candidates, {
    generation_intent: generationPackageRequest.generation_intent,
  });
  const contextPack = assembleContextPack({
    expert_id: expertId,
    generation_intent: generationPackageRequest.generation_intent,
    max_context_items: generationPackageRequest.max_context_items,
    max_total_chars: generationPackageRequest.max_total_chars,
    candidates: reranked,
  });
  const orchestrationPlan = createGenerationPlan({
    expert_id: expertId,
    generation_intent: generationPackageRequest.generation_intent,
    user_request: generationPackageRequest.user_request,
    context_pack: contextPack,
    output_constraints: generationPackageRequest.output_constraints,
  });
  const promptAssembly = assembleFinalPrompt({ plan: orchestrationPlan, contextPack });
  const messagePayload = buildMessagePayload(promptAssembly);
  const configPayload = buildConfigPayload({ generationPackageRequest, runtimeResult });
  const lengthPolicy = contentLengthPolicy(generationPackageRequest.output_constraints.length);
  const quality = buildPromptQuality({ promptAssembly, contextPack, runtimeResult });

  return {
    llmExecutionMode: "dry_run_prompt_only",
    realLocalPromptAssemblyUsed: true,
    mockContentGenerationUsed: false,
    generationExecutionSkipped: true,
    skip_reason: "External LLM execution is disabled for local-only runtime integration.",
    expertId,
    generationRequest: generationPackageRequest,
    expertProfileSummary: summarizeExpertProfile(runtimeResult),
    selectedLocalContextItems: contextPack.selected_items || [],
    assembledContextSummary: summarizeContext(contextPack),
    runtimeCognitionState: {
      cognition_loading: runtimeResult.cognition_loading,
      trust_progression: runtimeResult.runtime_state.trust_progression,
      narrative_continuity: runtimeResult.runtime_state.narrative_continuity,
      emotional_pacing: runtimeResult.runtime_state.emotional_pacing,
      cta_pacing: runtimeResult.runtime_state.cta_pacing,
    },
    runtimeDecisions: runtimeResult.runtime_state.decision_engine,
    contentLengthMode: {
      selected: generationPackageRequest.output_constraints.length,
      ...lengthPolicy,
    },
    styleToneMode: {
      tone: generationPackageRequest.output_constraints.tone,
      platform: generationPackageRequest.output_constraints.platform,
      format: generationPackageRequest.output_constraints.format,
    },
    audienceAssumptions: runtimeResult.runtime_state.audience_state,
    ctaPolicy: {
      cta_style: generationPackageRequest.output_constraints.cta_style,
      trust_pacing: runtimeResult.trust_pacing,
      runtime_cta_strength: runtimeResult.runtime_state.decision_engine.cta_strength,
    },
    antiRepetitionConstraints: buildAntiRepetitionConstraints(runtimeResult),
    authorVoiceConstraints: buildAuthorVoiceConstraints(runtimeResult),
    orchestrationPlan,
    assembledPrompt: promptAssembly,
    messagePayload,
    configPayload,
    validationResult: quality,
    qualityScore: quality.prompt_score,
    warnings: quality.warnings,
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

function buildIntegratedValidation({ runtimeResult, promptPackage }) {
  const runtimeWarnings = runtimeResult.validation?.warnings || [];
  const promptWarnings = promptPackage.validationResult?.warnings || [];
  const warnings = [...new Set([...runtimeWarnings, ...promptWarnings])];
  const runtimeQuality = runtimeResult.quality_score?.final_quality_score || 0;
  const promptQuality = promptPackage.qualityScore || 0;
  return {
    status: warnings.length ? "pass_with_warnings" : "pass",
    runtime_validation_status: runtimeResult.validation?.status || "unknown",
    prompt_assembly_validation_status: promptPackage.validationResult?.status || "unknown",
    prompt_assembly_score: promptQuality,
    runtime_quality_score: runtimeQuality,
    combined_quality_score: Number(((runtimeQuality * 0.55) + (promptQuality * 0.45)).toFixed(3)),
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

  const generationPackageRequest = buildGenerationPackageRequest({ request, runtimeResult });
  const promptPackage = await assembleRuntimePromptPackage({
    root,
    expertId,
    generationPackageRequest,
    runtimeResult,
  });

  const integratedValidation = buildIntegratedValidation({ runtimeResult, promptPackage });
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    constraints: ADAPTER_CONSTRAINTS,
    expert_id: expertId,
    adapter_mode: "local_runtime_to_prompt_assembly",
    connected_files: [
      "scripts/unified-generation-runtime.js",
      "scripts/expert-generation-sandbox.js",
      "scripts/expert-context-assembly.js",
      "scripts/expert-generation-orchestration.js",
      "scripts/expert-retrieval-intelligence.js",
      "scripts/expert-generation-sandbox.js",
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
      generation_package_request: generationPackageRequest,
      real_local_prompt_assembly_used: promptPackage.realLocalPromptAssemblyUsed,
      mock_content_generation_used: promptPackage.mockContentGenerationUsed,
      llm_execution_mode: promptPackage.llmExecutionMode,
      assembled_context_summary: promptPackage.assembledContextSummary,
      orchestration_plan: promptPackage.orchestrationPlan,
      prompt_package: promptPackage,
      prompt_structure: {
        system_prompt_chars: promptPackage.validationResult.system_prompt_chars,
        user_prompt_chars: promptPackage.validationResult.user_prompt_chars,
        total_prompt_chars: promptPackage.validationResult.total_prompt_chars,
        message_count: promptPackage.messagePayload.length,
        config_payload: promptPackage.configPayload,
      },
      validation: promptPackage.validationResult,
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
      llmExecutionMode: promptPackage.llmExecutionMode,
      assembledPrompt: promptPackage.assembledPrompt,
      messagePayload: promptPackage.messagePayload,
      configPayload: promptPackage.configPayload,
      content: null,
      content_execution_status: "not_executed_prompt_only",
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
    llmExecutionMode: result.generation_pipeline.llm_execution_mode,
    prompt_score: result.generation_pipeline.validation.prompt_score,
    combined_quality_score: result.integrated_validation.combined_quality_score,
    warnings: result.integrated_validation.warnings,
    prompt_chars: result.generation_pipeline.prompt_structure.total_prompt_chars,
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
  assembleRuntimePromptPackage,
  buildGenerationPackageRequest,
  runRuntimeGenerationAdapter,
  summarizeContext,
};
