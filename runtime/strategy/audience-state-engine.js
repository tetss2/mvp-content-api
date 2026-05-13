import { clamp, round } from "../stabilization/utils.js";

const AUDIENCE_STATE_SCHEMA_VERSION = "2026-05-13.audience_state_engine.v1";

function analyzeAudienceState({ state = {}, runtimeState = {}, trust = {}, emotional = {}, conversion = {}, campaignMemory = {} } = {}) {
  const previous = state.current_state || {};
  const fatigueRisk = campaignMemory.adapter_signals?.audience_fatigue_risk || "low";
  const resistance = clamp(
    Number(previous.audience_resistance ?? 0.34) * 0.75
    + (conversion.overselling_risk || 0) * 0.18
    + (fatigueRisk === "high" ? 0.12 : fatigueRisk === "medium" ? 0.06 : 0)
    - (trust.trust_level || 0.4) * 0.08,
  );
  const trustFatigue = clamp(
    Number(previous.audience_trust_fatigue ?? 0.12) * 0.68
    + (fatigueRisk === "high" ? 0.16 : fatigueRisk === "medium" ? 0.08 : 0)
    + (conversion.conversion_pressure || 0) * 0.08,
  );
  const stage = trust.trust_level < 0.42
    ? "cold_to_warming"
    : trust.trust_level < 0.62
      ? "warming_to_trusting"
      : "trusting_soft_conversion_ready";

  return {
    schema_version: AUDIENCE_STATE_SCHEMA_VERSION,
    audience_stage: runtimeState.audience_state?.stage || stage,
    strategic_audience_stage: stage,
    audience_resistance: round(resistance),
    audience_trust_fatigue: round(trustFatigue),
    audience_emotional_state: emotional.funnel_stage,
    audience_warming_quality: trust.audience_warming_quality,
    recommendation: resistance > 0.48
      ? "Reduce persuasion and mirror reader state before teaching."
      : "Audience state supports steady warming.",
    warnings: [
      resistance > 0.5 ? "audience_resistance_high" : null,
      trustFatigue > 0.42 ? "audience_trust_fatigue_high" : null,
    ].filter(Boolean),
  };
}

export {
  AUDIENCE_STATE_SCHEMA_VERSION,
  analyzeAudienceState,
};
