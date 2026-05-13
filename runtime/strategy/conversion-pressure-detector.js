import { clamp, round } from "../stabilization/utils.js";

const CONVERSION_PRESSURE_SCHEMA_VERSION = "2026-05-13.conversion_pressure.v1";

const CTA_PRESSURE = {
  none: 0,
  low: 0.08,
  soft: 0.1,
  low_pressure_cta: 0.1,
  save_share_cta: 0.08,
  educational_cta: 0.14,
  emotional_cta: 0.16,
  trust_cta: 0.22,
  dm_cta: 0.36,
  consultation_cta: 0.46,
  strong: 0.5,
  direct: 0.42,
};

function ctaPressure(type = "low_pressure_cta", strength = "low") {
  return Math.max(CTA_PRESSURE[type] ?? 0.1, CTA_PRESSURE[strength] ?? 0.08);
}

function analyzeConversionPressure({ state = {}, runtimeState = {}, campaignMemory = {}, trust = {} } = {}) {
  const previous = state.current_state || {};
  const signals = campaignMemory.adapter_signals || {};
  const ctaType = runtimeState.cta_pacing?.selected_cta_type || "low_pressure_cta";
  const ctaStrength = runtimeState.decision_engine?.cta_strength || "low";
  const basePressure = ctaPressure(ctaType, ctaStrength);
  const fatiguePenalty = signals.cta_fatigue_level === "high" ? 0.08 : signals.cta_fatigue_level === "medium" ? 0.04 : 0;
  const relief = ctaType === "low_pressure_cta" || ctaType === "save_share_cta" ? 0.04 : 0;
  const nextPressure = clamp(Number(previous.conversion_pressure ?? 0.1) * 0.52 + basePressure + fatiguePenalty - relief);
  const oversellingRisk = clamp(nextPressure * 0.58 + Math.max(0, nextPressure - Number(trust.trust_level || 0.4)) * 0.45);
  const nextOpportunity = Number(trust.trust_level || 0.4) > 0.62 && oversellingRisk < 0.34
    ? "soft_consultation_bridge"
    : Number(trust.trust_level || 0.4) > 0.5
      ? "value_based_reflection_cta"
      : "no_conversion_trust_only";

  return {
    schema_version: CONVERSION_PRESSURE_SCHEMA_VERSION,
    conversion_pressure: round(nextPressure),
    overselling_risk: round(oversellingRisk),
    next_soft_conversion_opportunity: nextOpportunity,
    warning_level: oversellingRisk >= 0.52 ? "high" : oversellingRisk >= 0.3 ? "medium" : "low",
    recommendation: oversellingRisk >= 0.52
      ? "Remove direct conversion and rebuild trust with useful non-sales content."
      : oversellingRisk >= 0.3
        ? "Keep CTA reflective; do not add urgency or strong offer framing."
        : "Soft conversion is safe only if it stays low pressure.",
    warnings: [
      oversellingRisk >= 0.52 ? "overselling_risk_high" : null,
      nextPressure >= 0.45 ? "conversion_pressure_watch" : null,
    ].filter(Boolean),
  };
}

function conversionEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    conversion_pressure: analysis.conversion_pressure,
    overselling_risk: analysis.overselling_risk,
    next_opportunity: analysis.next_soft_conversion_opportunity,
  };
}

export {
  CONVERSION_PRESSURE_SCHEMA_VERSION,
  analyzeConversionPressure,
  conversionEvent,
};
