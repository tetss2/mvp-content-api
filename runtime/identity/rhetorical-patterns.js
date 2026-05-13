import { clamp, countMatches, round, splitParagraphs } from "../stabilization/utils.js";

const RHETORICAL_PATTERNS_SCHEMA_VERSION = "2026-05-13.rhetorical_patterns.v1";

const RHETORICAL_MARKERS = {
  reader_mirror: [/если вам/gi, /если ты/gi, /когда внутри/gi, /может казаться/gi],
  normalization_to_reframe: [/это не всегда/gi, /это может быть/gi, /не потому что/gi, /а потому что/gi],
  expert_meaning: [/в терапии/gi, /как психолог/gi, /как сексолог/gi, /психика/gi],
  concrete_example: [/например/gi, /условн/gi, /представим/gi],
  gentle_next_step: [/первый шаг/gi, /можно начать/gi, /заметить/gi, /сохраните/gi],
  question_hook: [/\?/g],
};

const CTA_MARKERS = {
  soft_save: [/сохран/gi, /вернитесь/gi],
  consultation_soft: [/консультац/gi, /разобрать/gi],
  reflective: [/замет/gi, /спросите себя/gi],
  direct_pressure: [/запишитесь сейчас/gi, /успейте/gi, /только сегодня/gi],
};

function sentenceLengths(text = "") {
  return String(text)
    .split(/[.!?]+/)
    .map((item) => item.trim().split(/\s+/).filter(Boolean).length)
    .filter(Boolean);
}

function rhythmLabels(lengths = [], paragraphs = []) {
  const average = lengths.length ? lengths.reduce((sum, item) => sum + item, 0) / lengths.length : 0;
  const labels = [];
  if (average <= 11) labels.push("short_reflective_sentences");
  if (average > 11 && average <= 18) labels.push("medium_explanatory_cadence");
  if (paragraphs.length >= 3 && paragraphs.length <= 6) labels.push("measured_paragraph_pacing");
  if (lengths.some((item) => item <= 5)) labels.push("emotional_short_opener");
  return labels;
}

function scoreRhetoricalPatterns({ text = "", runtimeState = {}, memory = {} } = {}) {
  const detected = [];
  const hits = {};
  for (const [marker, patterns] of Object.entries(RHETORICAL_MARKERS)) {
    const count = countMatches(text, patterns);
    hits[marker] = count;
    if (count > 0) detected.push(marker);
  }
  const decisions = runtimeState.decision_engine || {};
  if (decisions.hook_type === "recognition_hook") detected.push("reader_mirror");
  if (decisions.narrative_continuation) detected.push(`narrative_${decisions.narrative_continuation}`);
  if (decisions.authority_framing) detected.push("expert_meaning");

  const ctaPatterns = [];
  const ctaHits = {};
  for (const [marker, patterns] of Object.entries(CTA_MARKERS)) {
    const count = countMatches(text, patterns);
    ctaHits[marker] = count;
    if (count > 0) ctaPatterns.push(marker);
  }
  const ctaStrength = decisions.cta_strength || runtimeState.cta_pacing?.selected_cta_type;
  if (ctaStrength === "low" || ctaStrength === "soft" || ctaStrength === "low_pressure_cta") ctaPatterns.push("soft_runtime_cta");
  if (ctaStrength === "strong") ctaPatterns.push("direct_runtime_cta");

  const paragraphs = splitParagraphs(text);
  const lengths = sentenceLengths(text);
  const labels = rhythmLabels(lengths, paragraphs);
  const persistedPatterns = Object.keys(memory.tendencies?.rhetorical_patterns || {});
  const persistedOverlap = detected.filter((item) => persistedPatterns.includes(item)).length;
  const structureCoverage = detected.length / Object.keys(RHETORICAL_MARKERS).length;
  const pressurePenalty = ctaPatterns.includes("direct_pressure") ? 0.12 : 0;
  const score = clamp(0.54 + structureCoverage * 0.3 + Math.min(0.08, labels.length * 0.025) + Math.min(0.08, persistedOverlap * 0.025) - pressurePenalty);

  return {
    schema_version: RHETORICAL_PATTERNS_SCHEMA_VERSION,
    rhetorical_similarity: round(score),
    rhetorical_continuity: round(score),
    status: score >= 0.78 ? "continuous" : score >= 0.64 ? "watch" : "unstable",
    detected_patterns: [...new Set(detected)],
    cta_patterns: [...new Set(ctaPatterns)],
    rhythm_labels: labels,
    pacing_labels: labels.includes("measured_paragraph_pacing") ? ["measured"] : ["uneven"],
    marker_hits: hits,
    cta_hits: ctaHits,
    sentence_count: lengths.length,
    average_sentence_words: round(lengths.length ? lengths.reduce((sum, item) => sum + item, 0) / lengths.length : 0),
    paragraph_count: paragraphs.length,
    persisted_pattern_overlap: persistedOverlap,
    warnings: [
      detected.length < 2 ? "rhetorical_pattern_thin" : null,
      ctaPatterns.includes("direct_pressure") ? "cta_pressure_artifact" : null,
      labels.length === 0 ? "phrase_rhythm_untracked" : null,
    ].filter(Boolean),
  };
}

export {
  RHETORICAL_MARKERS,
  RHETORICAL_PATTERNS_SCHEMA_VERSION,
  scoreRhetoricalPatterns,
};
