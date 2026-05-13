import { clamp, countMatches, round } from "../stabilization/utils.js";

const EMOTIONAL_SIGNATURE_SCHEMA_VERSION = "2026-05-13.emotional_signature.v1";

const EMOTIONAL_MARKERS = {
  recognition: [/узна/gi, /отклика/gi, /понят/gi, /замет/gi, /иногда/gi],
  softness: [/мягк/gi, /береж/gi, /спокойн/gi, /аккурат/gi, /можно/gi],
  safety: [/безопас/gi, /опор/gi, /границ/gi, /довер/gi],
  shame_work: [/стыд/gi, /вина/gi, /неловк/gi, /закрыва/gi],
  agency: [/выбор/gi, /шаг/gi, /вернуть/gi, /разобрать/gi],
  intimacy: [/близост/gi, /желани/gi, /контакт/gi, /отношен/gi],
};

function scoreEmotionalSignature({ text = "", runtimeState = {}, memory = {} } = {}) {
  const detected = [];
  const hits = {};
  for (const [marker, patterns] of Object.entries(EMOTIONAL_MARKERS)) {
    const count = countMatches(text, patterns);
    hits[marker] = count;
    if (count > 0) detected.push(marker);
  }

  const requestedDepth = runtimeState.emotional_pacing?.requested_depth || runtimeState.decision_engine?.emotional_depth || "auto";
  const recentArcs = memory.continuity_memory?.recent_emotional_arcs || [];
  const persistedOverlap = detected.filter((item) => recentArcs.includes(item)).length;
  const coverage = detected.length / Object.keys(EMOTIONAL_MARKERS).length;
  const depthFit = requestedDepth === "stabilizing" && detected.includes("softness")
    ? 0.08
    : requestedDepth === "deep" && (detected.includes("shame_work") || detected.includes("intimacy"))
      ? 0.08
      : 0.04;
  const score = clamp(0.55 + coverage * 0.3 + depthFit + Math.min(0.08, persistedOverlap * 0.025));

  return {
    schema_version: EMOTIONAL_SIGNATURE_SCHEMA_VERSION,
    emotional_similarity: round(score),
    emotional_continuity: round(score),
    status: score >= 0.78 ? "continuous" : score >= 0.64 ? "watch" : "flat",
    detected_emotions: detected,
    marker_hits: hits,
    requested_depth: requestedDepth,
    persisted_arc_overlap: persistedOverlap,
    warnings: [
      detected.length < 2 ? "emotional_signature_thin" : null,
      hits.softness === 0 ? "softness_missing" : null,
    ].filter(Boolean),
  };
}

export {
  EMOTIONAL_MARKERS,
  EMOTIONAL_SIGNATURE_SCHEMA_VERSION,
  scoreEmotionalSignature,
};
