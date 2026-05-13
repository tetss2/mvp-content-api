import { clamp, countMatches, round } from "../stabilization/utils.js";

const IDENTITY_DRIFT_SCHEMA_VERSION = "2026-05-13.identity_drift_detector.v1";

const ROBOTIC_PATTERNS = [
  /следует отметить/gi,
  /таким образом/gi,
  /в заключение/gi,
  /данная тема/gi,
  /рассмотрим подробнее/gi,
  /существует множество факторов/gi,
  /важным аспектом является/gi,
  /необходимо подчеркнуть/gi,
];

const OPTIMIZATION_ARTIFACTS = [
  /ключевые тезисы/gi,
  /структура поста/gi,
  /целевая аудитория/gi,
  /повысить вовлеченность/gi,
  /конверсия/gi,
  /алгоритм/gi,
];

function detectIdentityDrift({ text = "", worldview = {}, emotional = {}, rhetorical = {}, continuity = {}, stabilization = {} } = {}) {
  const roboticHits = countMatches(text, ROBOTIC_PATTERNS);
  const optimizationHits = countMatches(text, OPTIMIZATION_ARTIFACTS);
  const genericRisk = Number(stabilization.generic_ai_risk_score ?? 0.22);
  const overSanitization = String(text).length > 0 && rhetorical.detected_patterns?.length < 2 && emotional.detected_emotions?.length < 2;
  const worldviewLow = Number(worldview.worldview_similarity || 0) < 0.64;
  const emotionalLow = Number(emotional.emotional_similarity || 0) < 0.64;
  const rhetoricalLow = Number(rhetorical.rhetorical_similarity || 0) < 0.64;
  const continuityLow = Number(continuity.continuity_similarity || 0) < 0.64;

  const riskScore = clamp(
    genericRisk * 0.28
    + Math.min(0.22, roboticHits * 0.055)
    + Math.min(0.16, optimizationHits * 0.045)
    + (worldviewLow ? 0.1 : 0)
    + (emotionalLow ? 0.09 : 0)
    + (rhetoricalLow ? 0.09 : 0)
    + (continuityLow ? 0.08 : 0)
    + (overSanitization ? 0.08 : 0),
  );

  const warnings = [
    roboticHits > 1 ? "robotic_behavior_spike" : null,
    genericRisk > 0.26 ? "generic_ai_tone" : null,
    worldviewLow ? "worldview_inconsistency" : null,
    emotionalLow ? "emotional_inconsistency" : null,
    rhetoricalLow ? "rhetorical_instability" : null,
    continuityLow ? "continuity_instability" : null,
    overSanitization ? "over_sanitization" : null,
    optimizationHits > 0 ? "optimization_artifacts" : null,
  ].filter(Boolean);

  return {
    schema_version: IDENTITY_DRIFT_SCHEMA_VERSION,
    persona_drift_score: round(riskScore),
    persona_drift_level: riskScore >= 0.52 ? "high" : riskScore >= 0.3 ? "medium" : "low",
    robotic_behavior_spikes: roboticHits,
    generic_ai_tone_risk: round(genericRisk),
    worldview_inconsistency: worldviewLow,
    emotional_inconsistency: emotionalLow,
    rhetorical_instability: rhetoricalLow,
    over_sanitization: overSanitization,
    excessive_optimization_artifacts: optimizationHits,
    warnings,
    status: warnings.length ? "watch" : "pass",
  };
}

export {
  IDENTITY_DRIFT_SCHEMA_VERSION,
  detectIdentityDrift,
};
