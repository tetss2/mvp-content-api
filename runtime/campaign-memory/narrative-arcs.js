import { clamp, round } from "../stabilization/utils.js";

const NARRATIVE_ARCS_SCHEMA_VERSION = "2026-05-13.narrative_arcs.v1";

function analyzeNarrativeArcs({ runtimeState = {}, state = {} } = {}) {
  const history = state.narrative_arcs || [];
  const recent = history.slice(-8);
  const selectedArc = runtimeState.decision_engine?.narrative_continuation || "open_new_thread";
  const hook = runtimeState.decision_engine?.hook_type || "recognition_hook";
  const pacing = runtimeState.decision_engine?.content_pacing || "insight_forward";
  const continuedCount = recent.filter((item) => item.arc === selectedArc).length;
  const hookRepeats = recent.filter((item) => item.hook_type === hook).length;
  const hasOpenThread = recent.some((item) => item.arc === "open_new_thread");
  const coherence = clamp(0.7 + (selectedArc === "continue_with_reframe" && hasOpenThread ? 0.1 : 0) - Math.min(0.18, hookRepeats * 0.025));

  return {
    schema_version: NARRATIVE_ARCS_SCHEMA_VERSION,
    selected_arc: selectedArc,
    selected_hook_type: hook,
    selected_pacing: pacing,
    recent_arcs: recent.map((item) => item.arc),
    repeated_arc_count: continuedCount,
    hook_repetition_count: hookRepeats,
    narrative_continuity_score: round(coherence),
    narrative_arc_status: coherence >= 0.78 ? "coherent" : coherence >= 0.62 ? "watch" : "fragmented",
    suggested_next_narrative_move: hookRepeats >= 4
      ? "change_hook_frame"
      : selectedArc === "open_new_thread"
        ? "develop_thread_with_reframe"
        : "resolve_or_expand_thread",
    warnings: [
      hookRepeats >= 5 ? "hook_frame_repetition" : null,
      continuedCount >= 5 ? "arc_pattern_repetition" : null,
    ].filter(Boolean),
  };
}

function narrativeEntry({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    arc: analysis.selected_arc,
    hook_type: analysis.selected_hook_type,
    pacing: analysis.selected_pacing,
    suggested_next_move: analysis.suggested_next_narrative_move,
  };
}

export {
  NARRATIVE_ARCS_SCHEMA_VERSION,
  analyzeNarrativeArcs,
  narrativeEntry,
};
