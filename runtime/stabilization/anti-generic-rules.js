import { clamp, countMatches, round, splitParagraphs, unique } from "./utils.js";

const GENERIC_AI_PATTERNS = [
  /важно понимать/gi,
  /следует отметить/gi,
  /в современном мире/gi,
  /данная тема/gi,
  /таким образом/gi,
  /в заключени[еи]/gi,
  /подводя итог/gi,
  /рассмотрим подробнее/gi,
  /существует множество факторов/gi,
  /необходимо/gi,
  /является важным/gi,
];

const STRUCTURAL_PATTERNS = [
  /^\s*\d+[.)]\s+/gm,
  /^\s*[-*]\s+/gm,
  /#{1,4}\s+/g,
  /\*\*[^*]+\*\*/g,
];

function evaluateAntiGeneric(input = {}) {
  const text = input.promptText || "";
  const genericHits = countMatches(text, GENERIC_AI_PATTERNS);
  const structuralHits = countMatches(text, STRUCTURAL_PATTERNS);
  const paragraphs = splitParagraphs(text);
  const similarParagraphShape = paragraphs.length >= 5
    && paragraphs.filter((item) => item.length >= 180 && item.length <= 340).length / paragraphs.length > 0.7;
  const risk = clamp(Math.min(0.5, genericHits * 0.055) + Math.min(0.28, structuralHits * 0.018) + (similarParagraphShape ? 0.14 : 0));
  const score = clamp(1 - risk);

  return {
    score: round(score),
    risk_score: round(risk),
    status: risk >= 0.42 ? "high" : risk >= 0.22 ? "medium" : "low",
    detected: {
      generic_phrase_hits: genericHits,
      excessive_formatting_hits: structuralHits,
      similar_paragraph_shape: similarParagraphShape,
    },
    warnings: [
      risk >= 0.22 ? "generic_ai_patterns" : null,
      similarParagraphShape ? "ai_like_paragraph_structure" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Replace generic educational scaffolding with concrete inner-life observations.",
      "Use fewer headers, numbered lists, and bolded formula blocks unless the format requires them.",
      "Vary paragraph rhythm: short human observations can sit beside fuller expert explanation.",
      "Avoid motivational slogans and universal advice that could fit any expert.",
    ],
  };
}

function antiGenericConstraintText() {
  return unique(evaluateAntiGeneric({}).soft_constraints).map((item) => `- ${item}`).join("\n");
}

export {
  antiGenericConstraintText,
  evaluateAntiGeneric,
};
