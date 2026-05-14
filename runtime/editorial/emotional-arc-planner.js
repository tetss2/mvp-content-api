import { clamp, round } from "../stabilization/utils.js";

const EMOTIONAL_ARC_SCHEMA_VERSION = "2026-05-13.emotional_arc_planner.v1";

function analyzeEmotionalArc({ state = {}, audienceTemperature = {}, storytelling = {}, strategicBrain = {} } = {}) {
  const warmth = strategicBrain.adapter_signals?.emotional_warmth_level ?? state.current_state?.emotional_carryover ?? 0.34;
  const saturation = audienceTemperature.audience_saturation || 0.18;
  const stage = storytelling.narrative_progression_stage || "opening";
  const desiredIntensity = stage === "deepening" ? 0.62 : stage === "reframe" ? 0.54 : stage === "renewal" ? 0.36 : 0.46;
  const quality = clamp(0.86 - Math.abs(Number(warmth) - desiredIntensity) * 0.48 - Math.max(0, saturation - 0.52) * 0.5);
  return {
    schema_version: EMOTIONAL_ARC_SCHEMA_VERSION,
    current_emotional_intensity: round(warmth),
    target_emotional_intensity: round(desiredIntensity),
    emotional_pacing_quality: round(quality),
    next_emotional_direction: audienceTemperature.next_emotional_direction,
    emotional_saturation: round(saturation),
    recommendation: quality < 0.64
      ? "Reduce emotional intensity and return to grounded explanation."
      : "Emotional arc is proportionate for the next post.",
    warnings: [
      quality < 0.64 ? "emotional_pacing_quality_low" : null,
      saturation > 0.62 ? "emotional_saturation_high" : null,
    ].filter(Boolean),
  };
}

export {
  EMOTIONAL_ARC_SCHEMA_VERSION,
  analyzeEmotionalArc,
};
