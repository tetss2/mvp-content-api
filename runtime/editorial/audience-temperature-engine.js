import { clamp, round } from "../stabilization/utils.js";

const AUDIENCE_TEMPERATURE_SCHEMA_VERSION = "2026-05-13.audience_temperature.v1";

function labelTemperature(value) {
  if (value < 0.34) return "cold";
  if (value < 0.56) return "warming";
  if (value < 0.74) return "warm";
  return "hot_watch_saturation";
}

function analyzeAudienceTemperature({ state = {}, strategicBrain = {}, campaignMemory = {}, balance = {} } = {}) {
  const previous = state.current_state || {};
  const trust = strategicBrain.adapter_signals?.trust_level ?? previous.trust_carryover ?? 0.42;
  const warmth = strategicBrain.adapter_signals?.emotional_warmth_level ?? previous.emotional_carryover ?? 0.34;
  const authority = strategicBrain.adapter_signals?.authority_level ?? previous.authority_carryover ?? 0.36;
  const ctaFatigue = campaignMemory.adapter_signals?.cta_fatigue_level || "low";
  const fatigueRisk = campaignMemory.adapter_signals?.audience_fatigue_risk || "low";
  const softSellingPressure = balance.soft_selling_ratio || 0;
  const audienceTemperature = clamp(
    Number(previous.audience_temperature ?? 0.42) * 0.56
    + Number(trust) * 0.2
    + Number(warmth) * 0.14
    + Number(authority) * 0.1
    - (fatigueRisk === "high" ? 0.08 : fatigueRisk === "medium" ? 0.04 : 0),
  );
  const saturation = clamp(
    Number(previous.audience_saturation ?? 0.18) * 0.72
    + softSellingPressure * 0.18
    + (ctaFatigue === "high" ? 0.12 : ctaFatigue === "medium" ? 0.06 : 0)
    + (fatigueRisk === "high" ? 0.1 : fatigueRisk === "medium" ? 0.04 : 0),
  );
  const trustCarryover = clamp(Number(previous.trust_carryover ?? 0.4) * 0.7 + Number(trust) * 0.3);
  const authorityCarryover = clamp(Number(previous.authority_carryover ?? 0.36) * 0.72 + Number(authority) * 0.28);
  const emotionalCarryover = clamp(Number(previous.emotional_carryover ?? 0.34) * 0.68 + Number(warmth) * 0.32);

  return {
    schema_version: AUDIENCE_TEMPERATURE_SCHEMA_VERSION,
    audience_temperature: round(audienceTemperature),
    audience_temperature_label: labelTemperature(audienceTemperature),
    audience_saturation: round(saturation),
    emotional_carryover: round(emotionalCarryover),
    trust_carryover: round(trustCarryover),
    authority_carryover: round(authorityCarryover),
    saturation_warning: saturation > 0.62 ? "high" : saturation > 0.44 ? "medium" : "low",
    should_reset_audience_fatigue: saturation > 0.58 || fatigueRisk === "high",
    next_emotional_direction: saturation > 0.52
      ? "lower_intensity_and_restore_safety"
      : audienceTemperature < 0.45
        ? "increase_warmth"
        : "maintain_warm_expert_presence",
    warnings: [
      saturation > 0.62 ? "audience_saturation_high" : null,
      audienceTemperature > 0.74 && saturation > 0.48 ? "warm_audience_saturation_watch" : null,
    ].filter(Boolean),
  };
}

export {
  AUDIENCE_TEMPERATURE_SCHEMA_VERSION,
  analyzeAudienceTemperature,
  labelTemperature,
};
