import { clamp, round } from "../stabilization/utils.js";

const TRUST_ENGINE_SCHEMA_VERSION = "2026-05-13.trust_building_engine.v1";

function analyzeTrustBuilding({ state = {}, runtimeState = {}, campaignMemory = {}, identityRuntime = {} } = {}) {
  const previous = state.current_state || {};
  const campaignSignals = campaignMemory.adapter_signals || {};
  const identity = identityRuntime.preview_metrics || {};
  const ctaFatigue = campaignSignals.cta_fatigue_level === "high" ? 0.04 : campaignSignals.cta_fatigue_level === "medium" ? 0.02 : 0;
  const audienceFatigue = campaignSignals.audience_fatigue_risk === "high" ? 0.055 : campaignSignals.audience_fatigue_risk === "medium" ? 0.025 : 0;
  const continuityBoost = Number(identity.narrative_persistence || 0.7) * 0.035;
  const softCtaBoost = runtimeState.decision_engine?.cta_strength === "low" || runtimeState.decision_engine?.cta_strength === "soft" ? 0.025 : 0;
  const nextTrust = clamp(Number(previous.trust_level ?? 0.36) + 0.035 + continuityBoost + softCtaBoost - ctaFatigue - audienceFatigue, 0.18, 0.92);
  const retention = clamp(0.56 + nextTrust * 0.34 - ctaFatigue - audienceFatigue + continuityBoost);

  return {
    schema_version: TRUST_ENGINE_SCHEMA_VERSION,
    trust_level: round(nextTrust),
    trust_pacing_score: round(clamp(0.62 + nextTrust * 0.24 - ctaFatigue - audienceFatigue)),
    trust_retention_probability: round(retention),
    audience_warming_quality: round(clamp(0.58 + nextTrust * 0.24 + softCtaBoost - audienceFatigue)),
    trust_delta: round(nextTrust - Number(previous.trust_level ?? 0.36)),
    recommendation: nextTrust < 0.45
      ? "Build recognition and safety before direct expertise or conversion."
      : nextTrust < 0.68
        ? "Continue trust-building with useful expert framing and soft CTA."
        : "Trust supports a careful authority or soft-conversion move.",
    warnings: [
      audienceFatigue >= 0.1 ? "trust_fatigue_high" : null,
      ctaFatigue >= 0.08 ? "cta_pressure_affecting_trust" : null,
    ].filter(Boolean),
  };
}

function trustEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    trust_level: analysis.trust_level,
    trust_delta: analysis.trust_delta,
    retention: analysis.trust_retention_probability,
  };
}

export {
  TRUST_ENGINE_SCHEMA_VERSION,
  analyzeTrustBuilding,
  trustEvent,
};
