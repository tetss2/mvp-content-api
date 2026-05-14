const EDITORIAL_CALENDAR_SCHEMA_VERSION = "2026-05-13.editorial_calendar.v1";

function createEditorialCalendarSlot({ state = {}, format = {}, balance = {}, storytelling = {}, pacing = {} } = {}) {
  const sequenceIndex = Number(state.run_count || 0) + 1;
  const sequenceType = pacing.status === "needs_reset"
    ? "fatigue_reset"
    : balance.soft_selling_ratio > 0.22
      ? "warmup_sequence"
      : storytelling.narrative_progression_stage === "deepening"
        ? "emotional_sequence"
        : balance.educational_ratio < 0.38
          ? "educational_chain"
          : "soft_cta_sequence";

  return {
    schema_version: EDITORIAL_CALENDAR_SCHEMA_VERSION,
    sequence_index: sequenceIndex,
    simulated_day: sequenceIndex,
    sequence_type: sequenceType,
    planned_format: format.recommended_next_format,
    planned_category: sequenceType === "educational_chain" ? "educational" : balance.selected_category,
    planned_narrative_stage: storytelling.narrative_progression_stage,
    planning_note: `Day ${sequenceIndex}: ${sequenceType} via ${format.recommended_next_format}`,
  };
}

export {
  EDITORIAL_CALENDAR_SCHEMA_VERSION,
  createEditorialCalendarSlot,
};
