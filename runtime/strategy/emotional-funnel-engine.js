import { clamp, round } from "../stabilization/utils.js";

const EMOTIONAL_FUNNEL_SCHEMA_VERSION = "2026-05-13.emotional_funnel.v1";

function warmthDelta(depth = "moderate", audienceFatigue = "low") {
  const base = {
    stabilizing: 0.025,
    moderate: 0.035,
    deep: 0.045,
  }[depth] || 0.03;
  const fatiguePenalty = audienceFatigue === "high" ? 0.055 : audienceFatigue === "medium" ? 0.025 : 0;
  return base - fatiguePenalty;
}

function analyzeEmotionalFunnel({ state = {}, runtimeState = {}, campaignMemory = {} } = {}) {
  const previous = state.current_state || {};
  const signals = campaignMemory.adapter_signals || {};
  const depth = runtimeState.decision_engine?.emotional_depth || "moderate";
  const nextWarmth = clamp(Number(previous.emotional_warmth ?? 0.58) + warmthDelta(depth, signals.audience_fatigue_risk));
  const intimacyStep = depth === "deep" ? 0.06 : depth === "stabilizing" ? 0.02 : 0.035;
  const nextIntimacy = clamp(Number(previous.intimacy_pacing ?? 0.36) + intimacyStep - (signals.audience_fatigue_risk === "high" ? 0.07 : signals.audience_fatigue_risk === "medium" ? 0.025 : 0), 0.12, 0.86);
  const overload = clamp(Math.max(0, nextIntimacy - 0.72) + (signals.audience_fatigue_risk === "high" ? 0.16 : signals.audience_fatigue_risk === "medium" ? 0.08 : 0));
  const emotionalPacing = clamp(0.82 - overload * 0.6 + Math.min(0.08, nextWarmth * 0.08));

  return {
    schema_version: EMOTIONAL_FUNNEL_SCHEMA_VERSION,
    emotional_warmth: round(nextWarmth),
    intimacy_pacing: round(nextIntimacy),
    intimacy_overload: round(overload),
    emotional_pacing_score: round(emotionalPacing),
    funnel_stage: nextWarmth < 0.5 ? "recognition" : nextWarmth < 0.7 ? "safety_to_insight" : "trust_to_action",
    recommendation: overload > 0.22
      ? "Soften intimacy depth and use stabilizing psychoeducation."
      : "Emotional pacing can continue with recognition and one grounded insight.",
    warnings: [
      overload > 0.22 ? "intimacy_overload" : null,
      signals.audience_fatigue_risk === "high" ? "audience_emotional_fatigue" : null,
    ].filter(Boolean),
  };
}

function emotionalEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    emotional_warmth: analysis.emotional_warmth,
    intimacy_pacing: analysis.intimacy_pacing,
    funnel_stage: analysis.funnel_stage,
  };
}

export {
  EMOTIONAL_FUNNEL_SCHEMA_VERSION,
  analyzeEmotionalFunnel,
  emotionalEvent,
};
