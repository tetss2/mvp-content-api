import { clamp, round } from "../stabilization/utils.js";

const AUTHORITY_PACING_SCHEMA_VERSION = "2026-05-13.authority_pacing.v1";

function authorityTargetForIntent(intent = "educational_post") {
  if (String(intent).includes("sales")) return 0.68;
  if (String(intent).includes("faq")) return 0.58;
  if (String(intent).includes("therapeutic")) return 0.52;
  return 0.5;
}

function analyzeAuthorityPacing({ state = {}, runtimeState = {}, trust = {}, identityRuntime = {} } = {}) {
  const previous = state.current_state || {};
  const intent = runtimeState.generation_intent?.intent || "educational_post";
  const framing = runtimeState.decision_engine?.authority_framing || "low_pressure_expertise";
  const target = authorityTargetForIntent(intent);
  const identityConfidence = identityRuntime.preview_metrics?.identity_confidence ?? 0.72;
  const authorityStep = framing === "explicit_expert_frame" ? 0.055 : 0.025;
  const nextAuthority = clamp(Number(previous.authority_level ?? 0.42) + authorityStep + Number(identityConfidence) * 0.018, 0.24, 0.88);
  const authorityGap = Math.abs(target - nextAuthority);
  const balance = clamp(0.88 - authorityGap * 0.55 - Math.max(0, nextAuthority - Number(trust.trust_level || 0.4) - 0.22) * 0.42);

  return {
    schema_version: AUTHORITY_PACING_SCHEMA_VERSION,
    authority_level: round(nextAuthority),
    authority_target: round(target),
    authority_balance: round(balance),
    perceived_expertise_level: round(clamp(nextAuthority * 0.72 + Number(identityConfidence) * 0.18)),
    recommendation: balance < 0.62
      ? "Reduce authority claims and return to practical reader recognition."
      : nextAuthority < target
        ? "Add one grounded expert interpretation."
        : "Authority level is sufficient; avoid stacking credentials.",
    warnings: [
      balance < 0.62 ? "authority_pacing_imbalance" : null,
      nextAuthority - Number(trust.trust_level || 0.4) > 0.3 ? "authority_ahead_of_trust" : null,
    ].filter(Boolean),
  };
}

function authorityEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    authority_level: analysis.authority_level,
    authority_balance: analysis.authority_balance,
    perceived_expertise_level: analysis.perceived_expertise_level,
  };
}

export {
  AUTHORITY_PACING_SCHEMA_VERSION,
  analyzeAuthorityPacing,
  authorityEvent,
};
