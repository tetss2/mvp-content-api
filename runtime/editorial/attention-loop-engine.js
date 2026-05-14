import { clamp, round } from "../stabilization/utils.js";

const ATTENTION_LOOP_SCHEMA_VERSION = "2026-05-13.attention_loop.v1";

function analyzeAttentionLoop({ state = {}, storytelling = {}, format = {}, audienceTemperature = {}, balance = {} } = {}) {
  const previous = state.current_state || {};
  const halfLife = format.current_format === "reel_script" ? 0.34 : format.current_format === "story" ? 0.28 : 0.46;
  const attentionDecay = clamp(
    Number(previous.attention_decay ?? 0.22) * 0.66
    + halfLife * 0.2
    + (audienceTemperature.audience_saturation || 0) * 0.12
    + Math.max(0, (balance.soft_selling_ratio || 0) - 0.2) * 0.18
    - (format.inject_novelty ? 0.06 : 0),
  );
  const stability = clamp(
    0.88
    - attentionDecay * 0.45
    + (storytelling.storytelling_continuity || 0.7) * 0.18
    + (format.format_distribution_quality || 0.72) * 0.12
    - (audienceTemperature.audience_saturation || 0) * 0.1,
  );
  const retention = clamp(
    0.42
    + stability * 0.34
    + (audienceTemperature.audience_temperature || 0.42) * 0.16
    + (format.inject_novelty ? 0.04 : 0)
    - (audienceTemperature.audience_saturation || 0.18) * 0.18,
  );

  return {
    schema_version: ATTENTION_LOOP_SCHEMA_VERSION,
    attention_half_life: round(halfLife),
    attention_decay: round(attentionDecay),
    attention_loop_stability: round(stability),
    audience_retention_probability: round(retention),
    attention_loop_status: stability > 0.74 ? "stable" : stability > 0.58 ? "watch" : "needs_reset",
    novelty_needed: attentionDecay > 0.46 || format.inject_novelty === true,
    recommendation: attentionDecay > 0.5
      ? "Use novelty, a shorter format, or a story reset."
      : "Attention loop can carry the current arc.",
    warnings: [
      attentionDecay > 0.52 ? "attention_decay_high" : null,
      stability < 0.58 ? "attention_loop_unstable" : null,
    ].filter(Boolean),
  };
}

export {
  ATTENTION_LOOP_SCHEMA_VERSION,
  analyzeAttentionLoop,
};
