import { clamp, round } from "../stabilization/utils.js";

const CTA_HISTORY_SCHEMA_VERSION = "2026-05-13.cta_history.v1";

const CTA_INTENSITY = {
  none: 0,
  low: 1,
  soft: 1,
  low_pressure_cta: 1,
  save_share_cta: 1,
  educational_cta: 2,
  emotional_cta: 2,
  trust_cta: 3,
  soft_cta: 3,
  dm_cta: 4,
  direct: 4,
  consultation_cta: 5,
  strong: 5,
};

function ctaIntensity(value = "low_pressure_cta") {
  return CTA_INTENSITY[value] ?? 1;
}

function analyzeCtaHistory({ ctaType = "low_pressure_cta", ctaStrength = "low", state = {} } = {}) {
  const history = state.cta_history || [];
  const recent = history.slice(-8);
  const selectedIntensity = Math.max(ctaIntensity(ctaType), ctaIntensity(ctaStrength));
  const averageRecentIntensity = recent.length
    ? recent.reduce((sum, item) => sum + Number(item.intensity || 0), 0) / recent.length
    : 1;
  const repeatedCtaCount = recent.filter((item) => item.cta_type === ctaType || item.cta_strength === ctaStrength).length;
  const highIntensityCount = recent.filter((item) => Number(item.intensity || 0) >= 4).length;
  const fatigueScore = clamp(
    (averageRecentIntensity / 5) * 0.32
    + repeatedCtaCount * 0.055
    + highIntensityCount * 0.08
    + (selectedIntensity >= 4 ? 0.08 : 0),
  );

  return {
    schema_version: CTA_HISTORY_SCHEMA_VERSION,
    selected_cta_type: ctaType,
    selected_cta_strength: ctaStrength,
    selected_intensity: selectedIntensity,
    recent_ctas: recent.map((item) => item.cta_type),
    repeated_cta_count: repeatedCtaCount,
    average_recent_intensity: round(averageRecentIntensity),
    cta_fatigue_score: round(fatigueScore),
    cta_fatigue_level: fatigueScore >= 0.52 ? "high" : fatigueScore >= 0.28 ? "medium" : "low",
    recommendation: fatigueScore >= 0.52
      ? "Lower CTA intensity and use a reflective or save-for-later close."
      : fatigueScore >= 0.28
        ? "Avoid repeating the same CTA wording; keep the ask soft."
        : "CTA pacing is safe for the current campaign sequence.",
    warnings: [
      repeatedCtaCount >= 4 ? "cta_repetition_risk" : null,
      highIntensityCount >= 2 ? "high_intensity_cta_cluster" : null,
    ].filter(Boolean),
  };
}

function ctaEntry({ ctaType, ctaStrength, runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    cta_type: ctaType,
    cta_strength: ctaStrength,
    intensity: analysis.selected_intensity,
    fatigue_score: analysis.cta_fatigue_score,
  };
}

export {
  CTA_HISTORY_SCHEMA_VERSION,
  analyzeCtaHistory,
  ctaEntry,
  ctaIntensity,
};
