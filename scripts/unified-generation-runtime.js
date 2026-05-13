import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createInitialCognitiveState, observeContentEvent } from "./expert-cognitive-graph.js";
import { rerankRetrievalItems } from "./expert-retrieval-intelligence.js";
import { createGenerationPlan } from "./expert-generation-orchestration.js";
import { createCampaignPlan } from "./content-strategy-engine.js";
import { createProductionPack, suppressGenericAI } from "./content-production-pipeline.js";
import { analyzeContentPerformance } from "./content-analytics-engine.js";
import { scoreAuthorVoiceMatch } from "./expert-author-voice.js";

const ROOT = process.cwd();
const DEFAULT_EXPERT_ID = "dinara";
const COGNITION_SCHEMA_VERSION = "2026-05-13.persistent_cognition.v1";
const RUNTIME_SCHEMA_VERSION = "2026-05-13.unified_generation_runtime.v1";
const STORAGE_DIR = path.join(ROOT, "storage", "cognition");
const METADATA_DIR = path.join(ROOT, "expert_profiles", DEFAULT_EXPERT_ID, "knowledge_sources", "cleaned", "_metadata");
const VOICE_DIR = path.join(ROOT, "expert_profiles", DEFAULT_EXPERT_ID, "voice");

const RUNTIME_CONSTRAINTS = {
  local_only: true,
  no_deploy: true,
  no_telegram_runtime_mutation: true,
  no_auto_posting: true,
  no_railway_deploy: true,
  no_external_apis: true,
  no_faiss_or_index_mutation: true,
  no_ingest_or_promote: true,
  no_production_database_migration: true,
  no_production_publishing: true,
};

const COGNITION_FILES = {
  topicGraphState: "topic-graph-state.json",
  trustMemory: "trust-memory.json",
  ctaHistory: "cta-history.json",
  audienceMemory: "audience-memory.json",
  narrativeMemory: "narrative-memory.json",
  emotionalCycles: "emotional-cycles.json",
  optimizationHistory: "optimization-history.json",
};

const PIPELINE_STEPS = [
  "load_expert",
  "load_cognition_state",
  "load_campaign_state",
  "retrieve_context",
  "evaluate_repetition",
  "evaluate_trust_pacing",
  "evaluate_audience_memory",
  "generate_strategic_plan",
  "build_production_pack",
  "validate_author_voice",
  "run_ai_suppression",
  "calculate_quality_score",
  "produce_final_runtime_output",
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function round(value, digits = 3) {
  return Number(clamp(value, -999, 999).toFixed(digits));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target, fallback = null) {
  if (!await exists(target)) return fallback;
  return JSON.parse(await fs.readFile(target, "utf8"));
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

function expertStorageDir(expertId, root = ROOT) {
  return path.join(root, "storage", "cognition", expertId);
}

function cognitionFilePaths(expertId = DEFAULT_EXPERT_ID, root = ROOT) {
  const dir = expertStorageDir(expertId, root);
  return Object.fromEntries(Object.entries(COGNITION_FILES).map(([key, file]) => [key, path.join(dir, file)]));
}

function splitCognitiveState(state) {
  return {
    topicGraphState: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      topic_graph: state.topicGraph,
      repetition_intelligence: state.repetitionIntelligence,
      recommendations: state.recommendations || [],
      updated_at: new Date().toISOString(),
    },
    trustMemory: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      trust_state: state.trustState,
      updated_at: new Date().toISOString(),
    },
    ctaHistory: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      cta_memory: state.ctaMemory,
      updated_at: new Date().toISOString(),
    },
    audienceMemory: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      audience_state: state.audienceState || {},
      identity_evolution: state.identityEvolution,
      updated_at: new Date().toISOString(),
    },
    narrativeMemory: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      narrative_memory: state.narrativeMemory,
      concept_reinforcement: state.conceptReinforcement,
      updated_at: new Date().toISOString(),
    },
    emotionalCycles: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      emotional_progression: state.emotionalProgression,
      updated_at: new Date().toISOString(),
    },
    optimizationHistory: {
      schema_version: COGNITION_SCHEMA_VERSION,
      expert_id: state.expertId,
      day: state.day,
      optimization_history: state.optimizationHistory || [],
      updated_at: new Date().toISOString(),
    },
  };
}

function mergeCognitionFiles(expertId, files) {
  const initial = createInitialCognitiveState(expertId);
  initial.day = Math.max(
    files.topicGraphState?.day || 0,
    files.trustMemory?.day || 0,
    files.ctaHistory?.day || 0,
    files.narrativeMemory?.day || 0,
    files.emotionalCycles?.day || 0,
    files.optimizationHistory?.day || 0,
  );
  if (files.topicGraphState?.topic_graph) initial.topicGraph = files.topicGraphState.topic_graph;
  if (files.topicGraphState?.repetition_intelligence) initial.repetitionIntelligence = files.topicGraphState.repetition_intelligence;
  if (files.trustMemory?.trust_state) initial.trustState = files.trustMemory.trust_state;
  if (files.ctaHistory?.cta_memory) initial.ctaMemory = files.ctaHistory.cta_memory;
  if (files.audienceMemory?.audience_state) initial.audienceState = files.audienceMemory.audience_state;
  if (files.audienceMemory?.identity_evolution) initial.identityEvolution = files.audienceMemory.identity_evolution;
  if (files.narrativeMemory?.narrative_memory) initial.narrativeMemory = files.narrativeMemory.narrative_memory;
  if (files.narrativeMemory?.concept_reinforcement) initial.conceptReinforcement = files.narrativeMemory.concept_reinforcement;
  if (files.emotionalCycles?.emotional_progression) initial.emotionalProgression = files.emotionalCycles.emotional_progression;
  if (files.optimizationHistory?.optimization_history) initial.optimizationHistory = files.optimizationHistory.optimization_history;
  initial.recommendations = files.topicGraphState?.recommendations || initial.recommendations || [];
  return initial;
}

async function loadPersistentCognition(expertId = DEFAULT_EXPERT_ID, { root = ROOT, initialize = true } = {}) {
  const paths = cognitionFilePaths(expertId, root);
  const loaded = {};
  for (const [key, target] of Object.entries(paths)) {
    loaded[key] = await readJson(target, null);
  }

  const hasStoredState = Object.values(loaded).some(Boolean);
  const state = hasStoredState ? mergeCognitionFiles(expertId, loaded) : createInitialCognitiveState(expertId);
  const split = splitCognitiveState(state);

  if (!hasStoredState && initialize) {
    for (const [key, target] of Object.entries(paths)) {
      await writeJson(target, split[key]);
    }
  }

  return {
    state,
    files: split,
    paths,
    loaded_from_disk: hasStoredState,
  };
}

async function savePersistentCognition(expertId, state, { root = ROOT } = {}) {
  const paths = cognitionFilePaths(expertId, root);
  const split = splitCognitiveState(state);
  for (const [key, target] of Object.entries(paths)) {
    await writeJson(target, split[key]);
  }
  return { files: split, paths };
}

async function loadExpert(expertId = DEFAULT_EXPERT_ID, { root = ROOT } = {}) {
  const profilePath = path.join(root, "expert_profiles", expertId, "profile.json");
  const fallback = {
    expert_id: expertId,
    display_name: expertId,
    scenario: expertId === "dinara" ? "psychologist/sexologist content expert" : "multi-expert runtime expert",
  };
  return {
    ...(await readJson(profilePath, fallback)),
    expert_id: expertId,
    profile_path: await exists(profilePath) ? path.relative(root, profilePath).replace(/\\/g, "/") : null,
  };
}

async function loadAuthorVoiceProfile(expertId = DEFAULT_EXPERT_ID, { root = ROOT } = {}) {
  const dir = path.join(root, "expert_profiles", expertId, "voice");
  const files = {
    tone_profile: "tone_profile.json",
    sentence_rhythm: "sentence_rhythm.json",
    vocabulary_profile: "vocabulary_profile.json",
    cta_style_profile: "cta_style_profile.json",
    storytelling_profile: "storytelling_profile.json",
    emotional_profile: "emotional_profile.json",
    conversational_patterns: "conversational_patterns.json",
    expert_phrases: "expert_phrases.json",
    forbidden_generic_ai_phrases: "forbidden_generic_ai_phrases.json",
  };
  const profile = {};
  for (const [key, file] of Object.entries(files)) {
    profile[key] = await readJson(path.join(dir, file), {});
  }
  return {
    profile,
    loaded_files: Object.values(files).map((file) => path.relative(root, path.join(dir, file)).replace(/\\/g, "/")),
    voice_dir: path.relative(root, dir).replace(/\\/g, "/"),
  };
}

function metadataTitle(metadata, filename) {
  return metadata.title
    || filename.replace(/^current_kb_(approved|high|medium)__/, "").replace(/\.metadata\.json$/, "")
    || "untitled source";
}

async function loadRetrievalCandidates({
  root = ROOT,
  expertId = DEFAULT_EXPERT_ID,
  generationIntent = "educational_post",
  topic = "",
  limit = 8,
} = {}) {
  const dir = expertId === DEFAULT_EXPERT_ID
    ? METADATA_DIR
    : path.join(root, "expert_profiles", expertId, "knowledge_sources", "cleaned", "_metadata");
  if (!await exists(dir)) return { selected: [], candidates: [], warnings: [`metadata_dir_missing:${path.relative(root, dir)}`] };

  const files = (await fs.readdir(dir))
    .filter((file) => file.endsWith(".metadata.json"))
    .sort((a, b) => a.localeCompare(b));
  const topicTokens = String(topic).toLowerCase().split(/\s+/).filter((token) => token.length > 3);
  const candidates = [];

  for (const [index, file] of files.entries()) {
    const metadata = await readJson(path.join(dir, file), {});
    const title = metadataTitle(metadata, file);
    const titleTokens = title.toLowerCase();
    const topicBoost = topicTokens.some((token) => titleTokens.includes(token)) ? 0.09 : 0;
    candidates.push({
      id: metadata.content_sha256 || file,
      title,
      content: `Local metadata candidate for ${title}. Content body is not read by runtime to keep retrieval simulation lightweight.`,
      base_score: round(0.78 - index * 0.012 + topicBoost, 4),
      metadata,
    });
  }

  const reranked = rerankRetrievalItems(candidates, { generation_intent: generationIntent });
  return {
    selected: reranked.slice(0, limit),
    candidates: reranked,
    warnings: [],
  };
}

function buildContextPack(retrieval) {
  const selectedItems = asArray(retrieval.selected).map((item) => ({
    id: item.id,
    title: item.title,
    score: item.retrieval_trace?.final_score,
    role: "runtime_grounding",
    content_kind: item.retrieval_trace?.content_kind,
    source_type: item.retrieval_trace?.source_type,
    generation_safe: item.retrieval_trace?.generation_safe,
    retrieval_trace: item.retrieval_trace,
  }));
  return {
    selected_items: selectedItems,
    suppressed_items: asArray(retrieval.candidates).filter((item) => !selectedItems.some((selected) => selected.id === item.id)).slice(0, 5),
    context_summary: {
      selected_count: selectedItems.length,
      warnings: retrieval.warnings,
      local_only: true,
      retrieval_index_mutation: false,
    },
  };
}

function countRecent(items, predicate, window = 5) {
  return asArray(items).slice(-window).filter(predicate).length;
}

function evaluateRepetition(runtimeState, cognitionState) {
  const recentTopics = asArray(cognitionState.repetitionIntelligence?.recentTopics);
  const sameTopicCount = countRecent(recentTopics, (topic) => topic === runtimeState.generation_intent.topic, 8);
  const recentHooks = asArray(cognitionState.repetitionIntelligence?.recentHookFrames);
  const hookRisk = countRecent(recentHooks, (hook) => hook === runtimeState.decision_engine.hook_type, 6);
  const riskScore = clamp((sameTopicCount * 0.22) + (hookRisk * 0.16) + (runtimeState.repetition_risk?.semantic_similarity || 0));
  return {
    status: riskScore >= 0.68 ? "block_or_reframe" : riskScore >= 0.38 ? "watch" : "pass",
    risk_score: round(riskScore),
    same_topic_recent_count: sameTopicCount,
    repeated_hook_recent_count: hookRisk,
    recommendation: riskScore >= 0.68 ? "Choose adjacent topic or change narrative frame." : "Proceed with variation controls.",
  };
}

function ctaEscalation(ctaType) {
  return {
    low_pressure_cta: 1,
    save_share_cta: 1,
    educational_cta: 2,
    emotional_cta: 2,
    trust_cta: 3,
    soft_cta: 3,
    dm_cta: 4,
    consultation_cta: 5,
  }[ctaType] || 1;
}

function evaluateTrustPacing(runtimeState, cognitionState) {
  const trustScore = clamp(cognitionState.trustState?.overallTrustScore ?? cognitionState.trustState?.trustScore ?? 0.35);
  const ctaLevel = ctaEscalation(runtimeState.cta_pacing.selected_cta_type);
  const allowedLevel = trustScore < 0.35 ? 2 : trustScore < 0.55 ? 3 : trustScore < 0.75 ? 4 : 5;
  const overloadRisk = ctaLevel > allowedLevel ? "high" : ctaLevel === allowedLevel ? "medium" : "low";
  return {
    status: overloadRisk === "high" ? "reduce_cta_strength" : "pass",
    trust_score: round(trustScore),
    selected_cta_level: ctaLevel,
    allowed_cta_level: allowedLevel,
    overload_risk: overloadRisk,
    recommendation: overloadRisk === "high" ? "Use educational or low-pressure CTA until trust memory catches up." : "CTA pacing fits current trust memory.",
  };
}

function evaluateAudienceMemory(runtimeState, cognitionState) {
  const transitions = asArray(cognitionState.identityEvolution?.audienceTransitions);
  const recentState = transitions.at(-1)?.to || runtimeState.audience_state.stage;
  const fatigueEvents = countRecent(asArray(cognitionState.emotionalProgression?.cycles), (item) => item?.intensity >= 0.7, 5);
  return {
    status: fatigueEvents >= 3 ? "soften_emotional_depth" : "pass",
    current_audience_state: recentState,
    requested_audience_state: runtimeState.audience_state.stage,
    fatigue_risk: fatigueEvents >= 3 ? "high" : fatigueEvents === 2 ? "medium" : "low",
    recent_high_intensity_count: fatigueEvents,
    recommendation: fatigueEvents >= 3 ? "Switch to stabilizing clarity and reduce emotional intensity." : "Audience memory supports the selected depth.",
  };
}

function decideGeneration(runtimeState, cognitionState) {
  const audience = runtimeState.audience_state.stage;
  const trustScore = clamp(cognitionState.trustState?.overallTrustScore ?? 0.35);
  const recentCycles = asArray(cognitionState.emotionalProgression?.cycles);
  const lastIntensity = recentCycles.at(-1)?.intensity || 0.35;
  const topicCount = asArray(cognitionState.repetitionIntelligence?.recentTopics)
    .filter((topic) => topic === runtimeState.generation_intent.topic)
    .length;

  const hookType = topicCount > 1
    ? "contrast_hook"
    : audience === "cold" || audience === "warming"
      ? "recognition_hook"
      : trustScore > 0.62
        ? "authority_hook"
        : "therapeutic_hook";

  const ctaStrength = trustScore < 0.35
    ? "low"
    : trustScore < 0.6
      ? "medium"
      : runtimeState.generation_intent.intent.includes("sales")
        ? "strong"
        : "soft";

  return {
    hook_type: hookType,
    emotional_depth: lastIntensity > 0.68 ? "stabilizing" : audience === "trusting" ? "deep" : "moderate",
    cta_strength: ctaStrength,
    authority_framing: trustScore > 0.5 ? "explicit_expert_frame" : "low_pressure_expertise",
    narrative_continuation: topicCount > 0 ? "continue_with_reframe" : "open_new_thread",
    platform_adaptation: runtimeState.platform_target,
    content_pacing: lastIntensity > 0.68 ? "slow_and_grounded" : "insight_forward",
  };
}

function createRuntimeState(input, cognitionState) {
  const intent = input.intent || input.generation_intent || "educational_post";
  const topic = input.topic || "relationship anxiety";
  const platform = input.platform || "instagram_post";
  const format = input.format || platform;
  const audienceStage = input.audienceState || input.audience_state || "warming";
  const selectedCta = input.ctaType || input.cta_type || "low_pressure_cta";
  const state = {
    schema_version: RUNTIME_SCHEMA_VERSION,
    run_id: `runtime_${new Date().toISOString().replace(/[:.]/g, "-")}`,
    created_at: new Date().toISOString(),
    constraints: RUNTIME_CONSTRAINTS,
    expert_identity: {
      expert_id: input.expertId || input.expert_id || DEFAULT_EXPERT_ID,
      scenario: input.scenario || "multi_expert_content_generation",
    },
    generation_intent: {
      intent,
      topic,
      requested_length: input.length || "medium",
    },
    audience_state: {
      stage: audienceStage,
      memory_depth: asArray(cognitionState.identityEvolution?.audienceTransitions).length,
    },
    campaign_context: {
      campaign_type: input.campaignType || "trust_building_flow",
      campaign_day: input.day || Math.max(1, (cognitionState.day || 0) + 1),
      campaign_id: input.campaignId || null,
    },
    narrative_continuity: {
      recent_topics: asArray(cognitionState.repetitionIntelligence?.recentTopics).slice(-5),
      active_threads: asArray(cognitionState.narrativeMemory?.activeThreads).slice(-5),
    },
    emotional_pacing: {
      recent_cycles: asArray(cognitionState.emotionalProgression?.cycles).slice(-5),
      requested_depth: input.emotionalDepth || "auto",
    },
    cta_pacing: {
      selected_cta_type: selectedCta,
      recent_ctas: asArray(cognitionState.ctaMemory?.recentCtas).slice(-5),
    },
    trust_progression: {
      trust_state: cognitionState.trustState || {},
      trust_score: clamp(cognitionState.trustState?.overallTrustScore ?? 0.35),
    },
    repetition_risk: {
      semantic_similarity: 0,
      repeated_topic_count: 0,
    },
    platform_target: platform,
    production_format: format,
  };
  state.decision_engine = decideGeneration(state, cognitionState);
  return state;
}

function campaignNodeFromRuntime(runtimeState) {
  return {
    node_id: `${runtimeState.expert_identity.expert_id}_runtime_day_${String(runtimeState.campaign_context.campaign_day).padStart(2, "0")}`,
    expert_id: runtimeState.expert_identity.expert_id,
    day: runtimeState.campaign_context.campaign_day,
    week: Math.ceil(runtimeState.campaign_context.campaign_day / 7),
    campaign_id: runtimeState.campaign_context.campaign_id || `${runtimeState.expert_identity.expert_id}_${runtimeState.campaign_context.campaign_type}_runtime`,
    campaign_stage: runtimeState.audience_state.stage,
    topic: runtimeState.generation_intent.topic,
    theme: runtimeState.generation_intent.topic.split(" ").slice(0, 2).join(" "),
    intent: runtimeState.generation_intent.intent.replace(/_post$/, ""),
    platform: runtimeState.platform_target,
    audience_state: runtimeState.audience_state.stage,
    cta_type: runtimeState.cta_pacing.selected_cta_type,
    hook_pattern: runtimeState.decision_engine.hook_type,
    emotional_frame: runtimeState.decision_engine.emotional_depth,
    storytelling_structure: runtimeState.decision_engine.narrative_continuation,
    sophistication_level: Math.min(5, Math.ceil(runtimeState.campaign_context.campaign_day / 7)),
    expert_positioning: runtimeState.decision_engine.authority_framing,
    depends_on: [],
    planning_notes: [
      `Runtime decision: ${runtimeState.decision_engine.content_pacing}.`,
      `Platform adaptation: ${runtimeState.decision_engine.platform_adaptation}.`,
    ],
  };
}

function flattenOutputText(output) {
  return asArray(output?.content_blocks).map((block) => block.text).join("\n\n");
}

function validateRuntime({ runtimeState, cognitionState, productionPack, voiceScore }) {
  const repetition = evaluateRepetition(runtimeState, cognitionState);
  const trust = evaluateTrustPacing(runtimeState, cognitionState);
  const audience = evaluateAudienceMemory(runtimeState, cognitionState);
  const ctaOverload = trust.overload_risk;
  const emotionalOverload = audience.fatigue_risk;
  const aiGenericPatterns = asArray(productionPack.ai_suppression?.warnings);
  const toneConsistency = voiceScore?.overall_voice_match_score ?? productionPack.quality_score?.style_similarity ?? 0.7;
  const narrativeContinuityRisk = runtimeState.decision_engine.narrative_continuation === "continue_with_reframe"
    && repetition.status === "block_or_reframe"
    ? "high"
    : "low";
  const warnings = [
    repetition.status !== "pass" ? `repetition_${repetition.status}` : null,
    trust.status !== "pass" ? trust.status : null,
    audience.status !== "pass" ? audience.status : null,
    aiGenericPatterns.length ? "ai_generic_patterns_detected" : null,
    toneConsistency < 0.62 ? "author_voice_drift" : null,
  ].filter(Boolean);

  return {
    status: warnings.length ? "pass_with_warnings" : "pass",
    tone_consistency: {
      score: round(toneConsistency),
      status: toneConsistency >= 0.72 ? "strong" : toneConsistency >= 0.62 ? "watch" : "revise",
    },
    narrative_continuity: {
      risk: narrativeContinuityRisk,
      active_threads: runtimeState.narrative_continuity.active_threads.length,
    },
    repetition_risk: repetition,
    cta_overload_risk: ctaOverload,
    audience_fatigue: audience,
    emotional_overload_risk: emotionalOverload,
    ai_generic_patterns: {
      risk: aiGenericPatterns.length ? "medium" : "low",
      warnings: aiGenericPatterns,
    },
    warnings,
  };
}

function calculateRuntimeQuality({ productionPack, validation, voiceScore, analytics }) {
  const base = productionPack.quality_score?.overall_score || 0.72;
  const voice = voiceScore?.overall_voice_match_score || productionPack.quality_score?.style_similarity || 0.72;
  const validationPenalty = validation.warnings.length * 0.035;
  const analyticsBoost = analytics?.aggregate_quality?.average_overall_score ? 0.02 : 0;
  return {
    base_production_score: round(base),
    author_voice_score: round(voice),
    validation_penalty: round(validationPenalty),
    analytics_signal_boost: round(analyticsBoost),
    final_quality_score: round(base * 0.5 + voice * 0.35 + 0.15 - validationPenalty + analyticsBoost),
  };
}

async function runUnifiedGenerationRuntime(input = {}, options = {}) {
  const root = options.root || ROOT;
  const expertId = input.expertId || input.expert_id || DEFAULT_EXPERT_ID;
  const trace = [];
  const traceStep = (step, details = {}) => trace.push({ step, status: "completed", at: new Date().toISOString(), ...details });

  const expert = await loadExpert(expertId, { root });
  traceStep("load_expert", { expert_id: expertId, profile_path: expert.profile_path });

  const cognition = input.cognitionState
    ? { state: input.cognitionState, paths: cognitionFilePaths(expertId, root), loaded_from_disk: false }
    : await loadPersistentCognition(expertId, { root, initialize: options.initializeStorage !== false });
  traceStep("load_cognition_state", {
    loaded_from_disk: cognition.loaded_from_disk,
    storage_paths: Object.values(cognition.paths).map((target) => path.relative(root, target).replace(/\\/g, "/")),
  });

  const runtimeState = createRuntimeState({ ...input, expertId }, cognition.state);
  const campaignPlan = createCampaignPlan({
    expertId,
    campaignType: runtimeState.campaign_context.campaign_type,
    durationDays: Math.max(30, runtimeState.campaign_context.campaign_day),
    initialAudienceState: runtimeState.audience_state.stage,
  });
  runtimeState.campaign_context.campaign_id = campaignPlan.campaign_id;
  traceStep("load_campaign_state", { campaign_id: campaignPlan.campaign_id, day: runtimeState.campaign_context.campaign_day });

  const retrieval = await loadRetrievalCandidates({
    root,
    expertId,
    generationIntent: runtimeState.generation_intent.intent,
    topic: runtimeState.generation_intent.topic,
    limit: options.contextLimit || 6,
  });
  const contextPack = buildContextPack(retrieval);
  traceStep("retrieve_context", { selected_count: contextPack.selected_items.length, warnings: retrieval.warnings });

  runtimeState.repetition_risk = evaluateRepetition(runtimeState, cognition.state);
  traceStep("evaluate_repetition", runtimeState.repetition_risk);

  const trustPacing = evaluateTrustPacing(runtimeState, cognition.state);
  traceStep("evaluate_trust_pacing", trustPacing);

  const audienceMemory = evaluateAudienceMemory(runtimeState, cognition.state);
  traceStep("evaluate_audience_memory", audienceMemory);

  const strategicPlan = createGenerationPlan({
    expert_id: expertId,
    generation_intent: runtimeState.generation_intent.intent,
    user_request: input.userRequest || input.user_request || runtimeState.generation_intent.topic,
    context_pack: contextPack,
    output_constraints: {
      platform: runtimeState.platform_target,
      length: runtimeState.generation_intent.requested_length,
      format: runtimeState.production_format,
      tone: input.tone || "expert_warm",
      cta_style: runtimeState.decision_engine.cta_strength === "strong" ? "direct" : "soft",
    },
  });
  traceStep("generate_strategic_plan", {
    generation_intent: strategicPlan.generation_intent,
    strategy_goal: strategicPlan.generation_strategy.goal,
  });

  const node = campaignNodeFromRuntime(runtimeState);
  const previousPacks = asArray(input.previousPacks);
  const productionPack = createProductionPack(node, previousPacks);
  traceStep("build_production_pack", { pack_id: productionPack.pack_id, output_format: productionPack.primary_output.output_format });

  const authorVoice = await loadAuthorVoiceProfile(expertId, { root });
  const outputText = flattenOutputText(productionPack.primary_output);
  const voiceScore = scoreAuthorVoiceMatch(outputText, authorVoice.profile);
  traceStep("validate_author_voice", {
    overall_voice_match_score: round(voiceScore.overall_voice_match_score),
    generic_ai_risk: voiceScore.generic_ai_risk,
  });

  const aiSuppression = suppressGenericAI(productionPack.primary_output);
  productionPack.primary_output = aiSuppression.sanitized_output;
  productionPack.ai_suppression = {
    checked_patterns: productionPack.ai_suppression.checked_patterns,
    warnings: [...asArray(productionPack.ai_suppression.warnings), ...aiSuppression.warnings],
  };
  traceStep("run_ai_suppression", { warning_count: productionPack.ai_suppression.warnings.length });

  const analytics = analyzeContentPerformance({
    packs: [...previousPacks, productionPack],
  });
  const validation = validateRuntime({ runtimeState, cognitionState: cognition.state, productionPack, voiceScore });
  const runtimeQuality = calculateRuntimeQuality({ productionPack, validation, voiceScore, analytics });
  traceStep("calculate_quality_score", runtimeQuality);

  const updatedCognition = observeContentEvent(cognition.state, {
    day: runtimeState.campaign_context.campaign_day,
    topic: runtimeState.generation_intent.topic,
    intent: runtimeState.generation_intent.intent,
    ctaType: runtimeState.cta_pacing.selected_cta_type,
    hookFrame: runtimeState.decision_engine.hook_type,
    framing: runtimeState.decision_engine.authority_framing,
    storyTemplate: runtimeState.decision_engine.narrative_continuation,
    emotionalTone: runtimeState.decision_engine.emotional_depth === "deep" ? "recognition" : "calm",
    audienceState: runtimeState.audience_state.stage,
  });
  updatedCognition.optimizationHistory = asArray(updatedCognition.optimizationHistory);
  updatedCognition.optimizationHistory.push({
    day: runtimeState.campaign_context.campaign_day,
    run_id: runtimeState.run_id,
    quality_score: runtimeQuality.final_quality_score,
    validation_status: validation.status,
    selected_hook_type: runtimeState.decision_engine.hook_type,
    selected_cta_type: runtimeState.cta_pacing.selected_cta_type,
    platform: runtimeState.platform_target,
  });

  let persistence = null;
  if (options.persist !== false) {
    persistence = await savePersistentCognition(expertId, updatedCognition, { root });
  }

  const output = {
    schema_version: RUNTIME_SCHEMA_VERSION,
    run_id: runtimeState.run_id,
    generated_at: new Date().toISOString(),
    constraints: RUNTIME_CONSTRAINTS,
    runtime_state: runtimeState,
    cognition_loading: {
      loaded_from_disk: cognition.loaded_from_disk,
      storage_paths: Object.fromEntries(Object.entries(cognition.paths).map(([key, target]) => [key, path.relative(root, target).replace(/\\/g, "/")])),
      persisted_after_run: Boolean(persistence),
    },
    orchestration_flow: trace,
    expert,
    context_pack: contextPack,
    strategic_plan: strategicPlan,
    production_pack: productionPack,
    validation,
    trust_pacing: trustPacing,
    audience_memory: audienceMemory,
    author_voice_validation: voiceScore,
    analytics_snapshot: {
      aggregate_quality: analytics.aggregate_quality,
      aggregate_warnings: analytics.aggregate_warnings,
      optimization_recommendations: analytics.optimization_recommendations,
    },
    quality_score: runtimeQuality,
    final_runtime_output: {
      output_type: "runtime_generation_pack",
      publication_status: "not_published_local_simulation",
      telegram_runtime_mutation: false,
      external_api_calls: false,
      faiss_or_index_mutation: false,
      production_database_migration: false,
      primary_output: productionPack.primary_output,
      decision_summary: runtimeState.decision_engine,
      validation_status: validation.status,
      warnings: validation.warnings,
    },
  };
  traceStep("produce_final_runtime_output", {
    validation_status: validation.status,
    final_quality_score: runtimeQuality.final_quality_score,
  });
  return output;
}

async function runCli() {
  const result = await runUnifiedGenerationRuntime({
    expertId: DEFAULT_EXPERT_ID,
    topic: "relationship anxiety",
    intent: "educational_post",
    platform: "instagram_post",
    audienceState: "warming",
    ctaType: "low_pressure_cta",
  });
  console.log(JSON.stringify({
    run_id: result.run_id,
    validation_status: result.validation.status,
    quality_score: result.quality_score.final_quality_score,
    constraints: result.constraints,
    storage_paths: result.cognition_loading.storage_paths,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  COGNITION_FILES,
  PIPELINE_STEPS,
  RUNTIME_CONSTRAINTS,
  RUNTIME_SCHEMA_VERSION,
  STORAGE_DIR,
  buildContextPack,
  calculateRuntimeQuality,
  cognitionFilePaths,
  createRuntimeState,
  evaluateAudienceMemory,
  evaluateRepetition,
  evaluateTrustPacing,
  loadExpert,
  loadPersistentCognition,
  loadRetrievalCandidates,
  runUnifiedGenerationRuntime,
  savePersistentCognition,
  validateRuntime,
};
