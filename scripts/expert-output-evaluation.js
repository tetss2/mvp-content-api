function clampScore(value) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function countMatches(text, patterns) {
  const lower = text.toLowerCase();
  return patterns.reduce((count, pattern) => count + (lower.includes(pattern.toLowerCase()) ? 1 : 0), 0);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function repeatedLineRatio(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return 0;
  const unique = new Set(lines.map((line) => line.toLowerCase()));
  return 1 - unique.size / lines.length;
}

function hasCTA(text) {
  return countMatches(text, ["сохран", "напишите", "поделитесь", "консультац", "обратитесь", "запишитесь"]) > 0;
}

function structureSignal(text, plan = {}) {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length;
  const structure = asArray(plan.generation_strategy?.recommended_structure);
  const hasList = /^\s*(\d+\.|-)/m.test(text);
  const target = plan.generation_intent === "short_hook" ? 1 : Math.min(5, Math.max(3, structure.length));
  const paragraphScore = target === 1
    ? (paragraphs <= 2 || hasList ? 0.9 : 0.55)
    : Math.min(1, paragraphs / target);
  return clampScore(paragraphScore + (hasList && plan.output_policy?.format === "hook_list" ? 0.08 : 0));
}

function contextUtilizationScore(text, contextPack = {}) {
  const selected = asArray(contextPack.selected_items);
  if (!selected.length) return 0.3;

  const lower = text.toLowerCase();
  const sourceTerms = selected.flatMap((item) => {
    const titleTerms = String(item.title || "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length > 5)
      .slice(0, 4);
    const kind = item.content_kind ? [item.content_kind] : [];
    return [...titleTerms, ...kind];
  });

  const matches = sourceTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  const conceptualSignals = countMatches(text, [
    "сексуаль",
    "желани",
    "тело",
    "близост",
    "стыд",
    "безопас",
    "контекст",
    "отношени",
  ]);

  return clampScore(0.35 + Math.min(0.35, conceptualSignals * 0.06) + Math.min(0.3, matches * 0.04));
}

function estimateHallucinationRisk(text, plan = {}, contextPack = {}) {
  const warnings = [];
  const riskSignals = countMatches(text, [
    "гарант",
    "всегда",
    "никогда",
    "диагноз",
    "вылечит",
    "100%",
    "доказано, что все",
  ]);
  const selectedCount = asArray(contextPack.selected_items).length;
  const unsupportedProof = countMatches(text, ["исследования доказали", "статистика показывает", "клинически доказано"]) > 0;

  if (riskSignals > 1) warnings.push("absolute_or_clinical_claims_detected");
  if (unsupportedProof) warnings.push("unsupported_proof_language_detected");
  if (selectedCount === 0) warnings.push("no_selected_context_available");
  if (plan.context_injection_plan?.safety_exclusions?.length > 0 && countMatches(text, ["опросник", "анкета"]) > 0) {
    warnings.push("possible_suppressed_questionnaire_leakage");
  }

  const risk = warnings.length >= 2 ? "high" : warnings.length === 1 ? "medium" : "low";
  return { risk, warnings };
}

function evaluateGeneratedOutput({ output = "", plan = {}, contextPack = {} } = {}) {
  const text = String(output || "");
  const words = wordCount(text);
  const warmthSignals = countMatches(text, ["береж", "спокой", "важно", "можно", "без стыда", "поддерж", "вниматель"]);
  const claritySignals = countMatches(text, ["например", "важно", "потому", "если", "контекст", "шаг"]);
  const expertSignals = countMatches(text, ["сексолог", "психолог", "специалист", "консультац", "отношени", "тело", "желани"]);
  const forbiddenMatches = asArray(plan.generation_strategy?.forbidden_patterns)
    .filter((pattern) => text.toLowerCase().includes(String(pattern).toLowerCase()));
  const hallucination = estimateHallucinationRisk(text, plan, contextPack);
  const ctaPresent = hasCTA(text);
  const redundancy = repeatedLineRatio(text);
  const warnings = [...hallucination.warnings];

  if (words < 25) warnings.push("very_short_output");
  if (redundancy > 0.25) warnings.push("repetitive_output");
  if (forbiddenMatches.length) warnings.push("forbidden_pattern_language_detected");
  if (plan.output_policy?.cta_style !== "none" && !ctaPresent) warnings.push("missing_cta");

  const styleMatchScore = clampScore(0.52 + warmthSignals * 0.06 + expertSignals * 0.04 - forbiddenMatches.length * 0.12);
  const structureQualityScore = structureSignal(text, plan);
  const educationalClarityScore = clampScore(0.45 + claritySignals * 0.07 + (words > 60 ? 0.1 : 0));
  const emotionalWarmthScore = clampScore(0.45 + warmthSignals * 0.08);
  const expertToneMatchScore = clampScore(0.5 + expertSignals * 0.06 + warmthSignals * 0.03 - forbiddenMatches.length * 0.1);
  const contextUtilizationQualityScore = contextUtilizationScore(text, contextPack);

  return {
    style_match_score: styleMatchScore,
    structure_quality_score: structureQualityScore,
    educational_clarity_score: educationalClarityScore,
    emotional_warmth_score: emotionalWarmthScore,
    redundancy_score: clampScore(1 - redundancy),
    hallucination_risk: hallucination.risk,
    cta_quality: ctaPresent || plan.output_policy?.cta_style === "none" ? "good" : "weak",
    expert_tone_match_score: expertToneMatchScore,
    context_utilization_quality_score: contextUtilizationQualityScore,
    overall_score: clampScore((
      styleMatchScore
      + structureQualityScore
      + educationalClarityScore
      + emotionalWarmthScore
      + expertToneMatchScore
      + contextUtilizationQualityScore
      + clampScore(1 - redundancy)
    ) / 7),
    warnings,
    metrics: {
      word_count: words,
      repeated_line_ratio: Number(redundancy.toFixed(3)),
      cta_present: ctaPresent,
      forbidden_matches: forbiddenMatches,
    },
  };
}

export {
  evaluateGeneratedOutput,
};
