import { clamp, round } from "../stabilization/utils.js";

const CONTENT_SEQUENCE_SCHEMA_VERSION = "2026-05-13.content_sequence_planner.v1";

function formatVarietyScore(distribution = {}) {
  const counts = Object.values(distribution).map(Number).filter((item) => item > 0);
  const total = counts.reduce((sum, item) => sum + item, 0);
  if (!total) return 0.7;
  const maxShare = Math.max(...counts) / total;
  return clamp(1 - Math.max(0, maxShare - 0.45));
}

function analyzeContentSequence({ runtimeState = {}, request = {}, state = {}, topicAnalysis = {}, ctaAnalysis = {}, narrativeAnalysis = {}, fatigueAnalysis = {} } = {}) {
  const sequence = state.content_sequence || [];
  const format = request.format || runtimeState.production_format || "post";
  const platform = request.platform || runtimeState.platform_target || "telegram";
  const intent = request.intent || runtimeState.generation_intent?.intent || "educational_post";
  const positioning = runtimeState.decision_engine?.authority_framing || "low_pressure_expertise";
  const distribution = {
    ...(state.format_distribution || {}),
    [format]: Number(state.format_distribution?.[format] || 0) + 1,
  };
  const variety = formatVarietyScore(distribution);
  const recentPositioning = (state.expert_positioning_history || []).slice(-8);
  const positioningRepeats = recentPositioning.filter((item) => item.positioning === positioning).length;
  const positioningConsistency = clamp(0.78 - Math.max(0, positioningRepeats - 5) * 0.035);
  const coherence = clamp(
    topicAnalysis.topic_freshness * 0.22
    + narrativeAnalysis.narrative_continuity_score * 0.25
    + (1 - ctaAnalysis.cta_fatigue_score) * 0.18
    + (1 - fatigueAnalysis.audience_fatigue_score) * 0.14
    + variety * 0.11
    + positioningConsistency * 0.1,
  );
  const suggestedNextMove = fatigueAnalysis.audience_fatigue_risk === "high"
    ? "light_educational_reset"
    : ctaAnalysis.cta_fatigue_level === "high"
      ? "soft_reflection_without_direct_cta"
      : topicAnalysis.status === "reframe"
        ? "adjacent_topic_reframe"
        : narrativeAnalysis.suggested_next_narrative_move;

  return {
    schema_version: CONTENT_SEQUENCE_SCHEMA_VERSION,
    sequence_index: sequence.length + 1,
    platform,
    format,
    intent,
    format_distribution: distribution,
    format_variety_score: round(variety),
    expert_positioning: positioning,
    expert_positioning_consistency: round(positioningConsistency),
    sequence_coherence: round(coherence),
    suggested_next_move: suggestedNextMove,
    status: coherence >= 0.78 ? "coherent" : coherence >= 0.62 ? "watch" : "needs_rebalance",
    warnings: [
      variety < 0.58 ? "format_variety_low" : null,
      positioningConsistency < 0.64 ? "positioning_repetition" : null,
      coherence < 0.62 ? "sequence_coherence_low" : null,
    ].filter(Boolean),
  };
}

function sequenceEntry({ runtimeState = {}, request = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    sequence_index: analysis.sequence_index,
    topic: runtimeState.generation_intent?.topic,
    intent: analysis.intent,
    platform: analysis.platform,
    format: analysis.format,
    suggested_next_move: analysis.suggested_next_move,
  };
}

function positioningEntry({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    positioning: analysis.expert_positioning,
    consistency: analysis.expert_positioning_consistency,
  };
}

export {
  CONTENT_SEQUENCE_SCHEMA_VERSION,
  analyzeContentSequence,
  sequenceEntry,
  positioningEntry,
};
