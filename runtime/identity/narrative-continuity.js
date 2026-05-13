import { clamp, round } from "../stabilization/utils.js";

const NARRATIVE_CONTINUITY_SCHEMA_VERSION = "2026-05-13.narrative_continuity_identity.v1";

function words(text = "") {
  return String(text).toLowerCase().match(/[a-zа-яё]{4,}/gi) || [];
}

function topTerms(text = "", limit = 6) {
  const stop = new Set(["когда", "если", "можно", "потому", "очень", "важно", "внутри", "через"]);
  const counts = {};
  for (const word of words(text)) {
    if (stop.has(word)) continue;
    counts[word] = (counts[word] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function semanticStructures(runtimeState = {}, rhetorical = {}) {
  return [
    runtimeState.decision_engine?.hook_type ? `hook:${runtimeState.decision_engine.hook_type}` : null,
    runtimeState.decision_engine?.narrative_continuation ? `narrative:${runtimeState.decision_engine.narrative_continuation}` : null,
    runtimeState.decision_engine?.authority_framing ? `authority:${runtimeState.decision_engine.authority_framing}` : null,
    ...(rhetorical.detected_patterns || []).map((item) => `rhetoric:${item}`),
  ].filter(Boolean);
}

function scoreNarrativeContinuity({ text = "", runtimeState = {}, memory = {}, rhetorical = {}, emotional = {} } = {}) {
  const recentThemes = [
    runtimeState.generation_intent?.topic,
    ...topTerms(text, 5),
  ].filter(Boolean);
  const structures = semanticStructures(runtimeState, rhetorical);
  const anchors = [
    runtimeState.decision_engine?.narrative_continuation,
    runtimeState.decision_engine?.content_pacing,
    ...(rhetorical.rhythm_labels || []),
  ].filter(Boolean);
  const emotionalArcs = emotional.detected_emotions || [];
  const memoryThemes = memory.continuity_memory?.recent_themes || [];
  const memoryStructures = memory.continuity_memory?.repeated_semantic_structures || [];
  const themeOverlap = recentThemes.filter((item) => memoryThemes.includes(item)).length;
  const structureOverlap = structures.filter((item) => memoryStructures.includes(item)).length;
  const persistence = clamp(0.55 + Math.min(0.14, anchors.length * 0.035) + Math.min(0.12, structureOverlap * 0.025) + Math.min(0.08, themeOverlap * 0.02));

  return {
    schema_version: NARRATIVE_CONTINUITY_SCHEMA_VERSION,
    continuity_similarity: round(persistence),
    narrative_persistence: round(persistence),
    status: persistence >= 0.78 ? "persistent" : persistence >= 0.64 ? "watch" : "thin",
    recent_themes: recentThemes.slice(0, 8),
    recent_emotional_arcs: emotionalArcs,
    semantic_structures: structures,
    narrative_habits: rhetorical.detected_patterns || [],
    continuity_anchors: anchors,
    memory_overlap: {
      themes: themeOverlap,
      semantic_structures: structureOverlap,
    },
    warnings: [
      anchors.length < 2 ? "continuity_anchor_thin" : null,
      structures.length < 3 ? "semantic_structure_thin" : null,
    ].filter(Boolean),
  };
}

export {
  NARRATIVE_CONTINUITY_SCHEMA_VERSION,
  scoreNarrativeContinuity,
};
