import { clamp, round } from "../stabilization/utils.js";

const POSITIONING_MANAGER_SCHEMA_VERSION = "2026-05-13.positioning_manager.v1";

function analyzePositioning({ state = {}, runtimeState = {}, authority = {}, identityRuntime = {} } = {}) {
  const history = state.positioning_history || [];
  const recent = history.slice(-10);
  const positioning = runtimeState.decision_engine?.authority_framing || "low_pressure_expertise";
  const repeated = recent.filter((item) => item.positioning === positioning).length;
  const identityConfidence = identityRuntime.preview_metrics?.identity_confidence ?? 0.72;
  const consistency = clamp(0.72 + Number(identityConfidence) * 0.12 - Math.max(0, repeated - 7) * 0.035);
  const reinforcement = authority.authority_balance < 0.64
    ? "soften_expertise_with_reader_context"
    : authority.authority_level < 0.55
      ? "add_grounded_expert_interpretation"
      : "maintain_warm_expert_positioning";

  return {
    schema_version: POSITIONING_MANAGER_SCHEMA_VERSION,
    current_positioning: positioning,
    positioning_consistency: round(consistency),
    positioning_repetition_count: repeated,
    reinforcement_suggestion: reinforcement,
    recommendation: reinforcement,
    warnings: [
      consistency < 0.62 ? "positioning_consistency_low" : null,
      repeated >= 9 ? "positioning_repetition" : null,
    ].filter(Boolean),
  };
}

function positioningEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    positioning: analysis.current_positioning,
    consistency: analysis.positioning_consistency,
    reinforcement: analysis.reinforcement_suggestion,
  };
}

export {
  POSITIONING_MANAGER_SCHEMA_VERSION,
  analyzePositioning,
  positioningEvent,
};
