import { clamp, round } from "../stabilization/utils.js";

const EDITORIAL_PACING_SCHEMA_VERSION = "2026-05-13.editorial_pacing.v1";

function analyzeEditorialPacing({ balance = {}, audienceTemperature = {}, attention = {}, emotionalArc = {}, storytelling = {} } = {}) {
  const saturationRisk = audienceTemperature.audience_saturation || 0;
  const fatigueRisk = clamp(
    saturationRisk * 0.42
    + (attention.attention_decay || 0) * 0.28
    + Math.max(0, (balance.soft_selling_ratio || 0) - 0.2) * 0.75
    + (emotionalArc.emotional_saturation || 0) * 0.12,
  );
  const freshness = clamp(
    0.88
    - fatigueRisk * 0.32
    - Math.max(0, (storytelling.episodic_storyline_continuity?.cluster_repeats || 0) - 1) * 0.08
    + (attention.novelty_needed ? 0.02 : 0),
  );

  return {
    schema_version: EDITORIAL_PACING_SCHEMA_VERSION,
    content_fatigue_risk: round(fatigueRisk),
    editorial_freshness: round(freshness),
    content_freshness: round(freshness),
    saturation_risk: round(saturationRisk),
    freshness_recommendation: freshness < 0.68
      ? "Inject a new angle, change format, and avoid repeating the current topic cluster."
      : "Freshness is healthy; continue the current arc.",
    recommended_next_narrative_move: fatigueRisk > 0.54
      ? "fatigue_reset"
      : storytelling.recommended_next_narrative_move,
    status: fatigueRisk > 0.58 ? "needs_reset" : fatigueRisk > 0.4 ? "watch" : "stable",
    warnings: [
      fatigueRisk > 0.58 ? "content_fatigue_risk_high" : null,
      freshness < 0.62 ? "editorial_freshness_low" : null,
    ].filter(Boolean),
  };
}

export {
  EDITORIAL_PACING_SCHEMA_VERSION,
  analyzeEditorialPacing,
};
