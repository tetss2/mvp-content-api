import { fileURLToPath } from "url";
import path from "path";
import { clamp, round, unique } from "../stabilization/utils.js";
import { analyzeTopicHistory, topicEntry } from "./topic-history.js";
import { analyzeCtaHistory, ctaEntry } from "./cta-history.js";
import { analyzeNarrativeArcs, narrativeEntry } from "./narrative-arcs.js";
import { analyzeAudienceFatigue, fatigueEntry } from "./audience-fatigue-detector.js";
import { analyzeContentSequence, positioningEntry, sequenceEntry } from "./content-sequence-planner.js";
import { loadCampaignState, saveCampaignState, updateCampaignState } from "./campaign-state-store.js";

const CAMPAIGN_MEMORY_ENGINE_SCHEMA_VERSION = "2026-05-13.campaign_memory_engine.v1";

function campaignMemoryScore({ topic, cta, narrative, fatigue, sequence }) {
  return round(
    topic.topic_freshness * 0.18
    + narrative.narrative_continuity_score * 0.18
    + (1 - cta.cta_fatigue_score) * 0.16
    + (1 - fatigue.audience_fatigue_score) * 0.14
    + sequence.sequence_coherence * 0.16
    + sequence.expert_positioning_consistency * 0.1
    + sequence.format_variety_score * 0.08,
  );
}

function aggregateScores({ topic, cta, narrative, fatigue, sequence }) {
  return {
    topic_freshness: topic.topic_freshness,
    narrative_continuity: narrative.narrative_continuity_score,
    cta_fatigue: cta.cta_fatigue_score,
    audience_fatigue: fatigue.audience_fatigue_score,
    sequence_coherence: sequence.sequence_coherence,
    expert_positioning_consistency: sequence.expert_positioning_consistency,
    format_variety: sequence.format_variety_score,
    campaign_memory_score: campaignMemoryScore({ topic, cta, narrative, fatigue, sequence }),
  };
}

async function runCampaignMemoryEngine({
  expertId = "dinara",
  root = process.cwd(),
  runtimeResult = {},
  request = {},
  persist = true,
  initializeStorage = true,
} = {}) {
  const runtimeState = runtimeResult.runtime_state || runtimeResult.runtime?.runtime_state || {};
  const loaded = await loadCampaignState(expertId, { root, initialize: initializeStorage });
  const state = loaded.state;
  const topic = request.topic || request.userRequest || request.user_request || runtimeState.generation_intent?.topic || "untitled topic";
  const ctaType = request.ctaType || request.cta_type || runtimeState.cta_pacing?.selected_cta_type || "low_pressure_cta";
  const ctaStrength = runtimeState.decision_engine?.cta_strength || "low";

  const topicAnalysis = analyzeTopicHistory({ topic, state });
  const ctaAnalysis = analyzeCtaHistory({ ctaType, ctaStrength, state });
  const narrativeAnalysis = analyzeNarrativeArcs({ runtimeState, state });
  const fatigueAnalysis = analyzeAudienceFatigue({ runtimeState, ctaAnalysis, topicAnalysis, state });
  const sequenceAnalysis = analyzeContentSequence({
    runtimeState,
    request,
    state,
    topicAnalysis,
    ctaAnalysis,
    narrativeAnalysis,
    fatigueAnalysis,
  });
  const scores = aggregateScores({
    topic: topicAnalysis,
    cta: ctaAnalysis,
    narrative: narrativeAnalysis,
    fatigue: fatigueAnalysis,
    sequence: sequenceAnalysis,
  });

  const event = {
    topic_entry: topicEntry({ topic, runtimeState, analysis: topicAnalysis }),
    cta_entry: ctaEntry({ ctaType, ctaStrength, runtimeState, analysis: ctaAnalysis }),
    narrative_entry: narrativeEntry({ runtimeState, analysis: narrativeAnalysis }),
    fatigue_entry: fatigueEntry({ runtimeState, analysis: fatigueAnalysis }),
    sequence_entry: sequenceEntry({ runtimeState, request, analysis: sequenceAnalysis }),
    positioning_entry: positioningEntry({ runtimeState, analysis: sequenceAnalysis }),
  };

  let updatedState = state;
  if (persist) {
    updatedState = updateCampaignState(state, event, scores);
    await saveCampaignState(expertId, updatedState, { root });
  }

  const warnings = unique([
    ...topicAnalysis.warnings,
    ...ctaAnalysis.warnings,
    ...narrativeAnalysis.warnings,
    ...fatigueAnalysis.warnings,
    ...sequenceAnalysis.warnings,
  ]);
  const topicOverlap = topicAnalysis.recent_topic_overlap;
  const ctaFatigue = ctaAnalysis.cta_fatigue_level;
  const fatigueRisk = fatigueAnalysis.audience_fatigue_risk;
  const score = scores.campaign_memory_score;

  return {
    schema_version: CAMPAIGN_MEMORY_ENGINE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    run_id: runtimeState.run_id || null,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    activation_scope: "admin_runtime_preview_only",
    production_activation_allowed: false,
    production_generation_replaced: false,
    telegram_runtime_mutation: false,
    external_api_calls: false,
    faiss_or_index_mutation: false,
    ingest_or_promote: false,
    campaign_memory_enabled: true,
    topic_history_enabled: true,
    cta_history_enabled: true,
    narrative_arcs_enabled: true,
    audience_fatigue_detection_enabled: true,
    campaign_state_loaded_from_disk: loaded.loaded_from_disk,
    campaign_state_persisted_after_run: persist,
    campaign_state_path: path.relative(root, loaded.path).replace(/\\/g, "/"),
    campaign_state_run_count: updatedState.run_count || state.run_count || 0,
    campaign_state_summary: {
      recent_topics: (updatedState.topic_history || []).slice(-8).map((item) => item.topic),
      recent_ctas: (updatedState.cta_history || []).slice(-8).map((item) => item.cta_type),
      narrative_arcs: (updatedState.narrative_arcs || []).slice(-8).map((item) => item.arc),
      format_distribution: updatedState.format_distribution || {},
      expert_positioning_history: (updatedState.expert_positioning_history || []).slice(-8).map((item) => item.positioning),
    },
    topic_history: topicAnalysis,
    cta_history: ctaAnalysis,
    narrative_arcs: narrativeAnalysis,
    audience_fatigue: fatigueAnalysis,
    content_sequence: sequenceAnalysis,
    campaign_scores: scores,
    adapter_signals: {
      recent_topic_overlap: topicOverlap,
      cta_fatigue_level: ctaFatigue,
      narrative_arc_status: narrativeAnalysis.narrative_arc_status,
      suggested_next_move: sequenceAnalysis.suggested_next_move,
      format_variety: sequenceAnalysis.format_variety_score,
      audience_fatigue_risk: fatigueRisk,
      topic_repetition_risk: topicAnalysis.topic_repetition_risk,
      cta_pacing_recommendation: ctaAnalysis.recommendation,
      campaign_memory_score: score,
    },
    warnings,
    status: warnings.length ? "pass_with_warnings" : "pass",
  };
}

async function runCli() {
  const result = await runCampaignMemoryEngine({
    persist: false,
    runtimeResult: {
      runtime_state: {
        run_id: "campaign_memory_smoke_test",
        generation_intent: { topic: "relationship anxiety", intent: "educational_post" },
        production_format: "post",
        platform_target: "telegram",
        cta_pacing: { selected_cta_type: "low_pressure_cta" },
        decision_engine: {
          hook_type: "recognition_hook",
          narrative_continuation: "open_new_thread",
          content_pacing: "insight_forward",
          authority_framing: "low_pressure_expertise",
          emotional_depth: "moderate",
          cta_strength: "low",
        },
      },
    },
  });
  console.log(JSON.stringify(result.adapter_signals, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  CAMPAIGN_MEMORY_ENGINE_SCHEMA_VERSION,
  aggregateScores,
  campaignMemoryScore,
  runCampaignMemoryEngine,
};
