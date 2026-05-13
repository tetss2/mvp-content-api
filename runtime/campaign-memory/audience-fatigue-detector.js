import { clamp, round } from "../stabilization/utils.js";
import { ctaIntensity } from "./cta-history.js";

const AUDIENCE_FATIGUE_SCHEMA_VERSION = "2026-05-13.audience_fatigue.v1";

function emotionalIntensity(depth = "moderate") {
  return {
    shallow: 1,
    low: 1,
    moderate: 2,
    deep: 4,
    stabilizing: 2,
  }[depth] || 2;
}

function analyzeAudienceFatigue({ runtimeState = {}, ctaAnalysis = {}, topicAnalysis = {}, state = {} } = {}) {
  const recent = state.audience_fatigue_signals || [];
  const window = recent.slice(-8);
  const depth = runtimeState.decision_engine?.emotional_depth || "moderate";
  const emotional = emotionalIntensity(depth);
  const cta = ctaAnalysis.selected_intensity ?? ctaIntensity(runtimeState.cta_pacing?.selected_cta_type);
  const recentHighSignals = window.filter((item) => Number(item.fatigue_score || 0) >= 0.45).length;
  const score = clamp(
    emotional * 0.07
    + cta * 0.045
    + Number(topicAnalysis.topic_repetition_risk || 0) * 0.18
    + recentHighSignals * 0.045,
  );

  return {
    schema_version: AUDIENCE_FATIGUE_SCHEMA_VERSION,
    emotional_depth: depth,
    emotional_intensity: emotional,
    cta_intensity: cta,
    recent_high_fatigue_count: recentHighSignals,
    audience_fatigue_score: round(score),
    audience_fatigue_risk: score >= 0.52 ? "high" : score >= 0.3 ? "medium" : "low",
    recommendation: score >= 0.52
      ? "Use a lighter educational post, reduce emotional load, and avoid direct CTA."
      : score >= 0.3
        ? "Keep the post grounded and avoid stacking heavy themes."
        : "Audience load is acceptable.",
    warnings: [
      score >= 0.52 ? "audience_fatigue_high" : null,
      recentHighSignals >= 3 ? "fatigue_cluster" : null,
    ].filter(Boolean),
  };
}

function fatigueEntry({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    emotional_depth: analysis.emotional_depth,
    fatigue_score: analysis.audience_fatigue_score,
    fatigue_risk: analysis.audience_fatigue_risk,
  };
}

export {
  AUDIENCE_FATIGUE_SCHEMA_VERSION,
  analyzeAudienceFatigue,
  fatigueEntry,
};
