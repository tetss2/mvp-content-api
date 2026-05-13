import { clamp, countMatches, round } from "../stabilization/utils.js";

const WORLDVIEW_PROFILE_SCHEMA_VERSION = "2026-05-13.worldview_profile.v1";

const WORLDVIEW_ANCHORS = {
  psyche_context_first: [/психик/gi, /внутр/gi, /контекст/gi, /переживан/gi, /опыт/gi],
  body_as_signal: [/тел/gi, /напряж/gi, /желани/gi, /стыд/gi, /близост/gi],
  non_pathologizing: [/не патолог/gi, /не проблема/gi, /нормальн/gi, /может быть/gi, /иногда/gi],
  soft_agency: [/береж/gi, /можно/gi, /шаг/gi, /заметить/gi, /спокойн/gi],
  relational_depth: [/отношен/gi, /партнер/gi, /контакт/gi, /довер/gi, /границ/gi],
  professional_boundary: [/специалист/gi, /консультац/gi, /терапи/gi, /психолог/gi, /сексолог/gi],
};

function scoreWorldviewProfile({ text = "", runtimeState = {}, memory = {} } = {}) {
  const detectedAnchors = [];
  const anchorHits = {};
  for (const [anchor, patterns] of Object.entries(WORLDVIEW_ANCHORS)) {
    const hits = countMatches(text, patterns);
    anchorHits[anchor] = hits;
    if (hits > 0) detectedAnchors.push(anchor);
  }

  const memoryAnchors = Object.keys(memory.tendencies?.worldview_anchors || {});
  const persistedOverlap = detectedAnchors.filter((anchor) => memoryAnchors.includes(anchor)).length;
  const anchorCoverage = Object.keys(WORLDVIEW_ANCHORS).length
    ? detectedAnchors.length / Object.keys(WORLDVIEW_ANCHORS).length
    : 0;
  const runtimeBoost = runtimeState.decision_engine?.authority_framing ? 0.04 : 0;
  const memoryBoost = memory.run_count ? Math.min(0.08, persistedOverlap * 0.025) : 0;
  const score = clamp(0.56 + anchorCoverage * 0.28 + runtimeBoost + memoryBoost);

  return {
    schema_version: WORLDVIEW_PROFILE_SCHEMA_VERSION,
    worldview_similarity: round(score),
    worldview_stability: round(score),
    status: score >= 0.78 ? "stable" : score >= 0.64 ? "watch" : "thin",
    detected_anchors: detectedAnchors,
    persisted_anchor_overlap: persistedOverlap,
    anchor_hits: anchorHits,
    warnings: [
      detectedAnchors.length < 2 ? "worldview_anchor_thin" : null,
      detectedAnchors.includes("professional_boundary") ? null : "professional_boundary_missing",
    ].filter(Boolean),
  };
}

export {
  WORLDVIEW_ANCHORS,
  WORLDVIEW_PROFILE_SCHEMA_VERSION,
  scoreWorldviewProfile,
};
