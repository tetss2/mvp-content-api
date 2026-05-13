import { analyzeRuntimeQuality } from "../../scripts/runtime-quality-analyzer.js";
import { CTA_PATTERNS } from "./runtime-output-sanitizer.js";

const GENERIC_PATTERNS = [
  /важно\s+понимать/gi,
  /следует\s+отметить/gi,
  /таким\s+образом/gi,
  /в\s+современном\s+мире/gi,
  /данная\s+тема/gi,
  /в\s+заключени[еи]/gi,
  /существует\s+множество\s+факторов/gi,
];

const HALLUCINATION_RISK_PATTERNS = [
  /исследования\s+доказали/gi,
  /уч[её]ные\s+доказали/gi,
  /\b\d{2,3}%\b/g,
  /по\s+статистике/gi,
  /клинически\s+доказано/gi,
];

function countMatches(text, patterns) {
  return patterns.reduce((sum, pattern) => {
    const matches = String(text || "").match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
}

function paragraphStats(text) {
  const paragraphs = String(text || "").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const repeatedStarts = new Map();
  for (const paragraph of paragraphs) {
    const start = paragraph.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
    if (start) repeatedStarts.set(start, (repeatedStarts.get(start) || 0) + 1);
  }
  return {
    count: paragraphs.length,
    repeated_start_count: [...repeatedStarts.values()].filter((count) => count > 1).length,
    average_chars: paragraphs.length
      ? Math.round(paragraphs.reduce((sum, item) => sum + item.length, 0) / paragraphs.length)
      : 0,
  };
}

function validateRuntimeOutput({ text = "", runtimeResult = {}, promptPackage = {} } = {}) {
  const quality = analyzeRuntimeQuality({
    promptText: text,
    runtime: runtimeResult.runtime,
    promptPackage,
    generation_pipeline: runtimeResult.generation_pipeline,
    integrated_validation: runtimeResult.integrated_validation,
  });
  const genericHits = countMatches(text, GENERIC_PATTERNS);
  const ctaHits = countMatches(text, CTA_PATTERNS);
  const hallucinationRiskHits = countMatches(text, HALLUCINATION_RISK_PATTERNS);
  const paragraphs = paragraphStats(text);
  const warnings = [
    ...quality.warnings,
    quality.author_voice_confidence < 0.66 ? "author_voice_drift" : null,
    ctaHits > 1 ? "cta_overload" : null,
    genericHits > 2 ? "generic_ai_patterns" : null,
    paragraphs.repeated_start_count > 0 ? "repetition_spike" : null,
    quality.emotional_pacing_score < 0.62 ? "emotional_flatness" : null,
    quality.continuity_score < 0.62 ? "continuity_break" : null,
    hallucinationRiskHits > 0 ? "hallucination_risk_signal" : null,
  ].filter(Boolean);
  const uniqueWarnings = [...new Set(warnings)];

  return {
    status: uniqueWarnings.length ? "pass_with_warnings" : "pass",
    output_validation_enabled: true,
    output_chars: String(text || "").length,
    author_voice_drift: quality.author_voice_confidence < 0.66,
    cta_overload: ctaHits > 1,
    generic_ai_patterns: genericHits,
    repetition_spikes: paragraphs.repeated_start_count,
    emotional_flatness: quality.emotional_pacing_score < 0.62,
    continuity_breaks: quality.continuity_score < 0.62,
    hallucination_risk_signals: hallucinationRiskHits,
    quality,
    detected: {
      cta_hits: ctaHits,
      generic_hits: genericHits,
      paragraph_stats: paragraphs,
    },
    warnings: uniqueWarnings,
  };
}

export {
  validateRuntimeOutput,
};
