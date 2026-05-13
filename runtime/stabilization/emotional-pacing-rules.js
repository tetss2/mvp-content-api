import { clamp, countMatches, round, splitParagraphs, unique } from "./utils.js";

const EMOTION_PATTERNS = [
  /тревог/gi,
  /стыд/gi,
  /страх/gi,
  /боль/gi,
  /устал/gi,
  /желани/gi,
  /одиноч/gi,
  /напряж/gi,
  /обид/gi,
  /вина/gi,
];

const GROUNDING_PATTERNS = [
  /спокойн/gi,
  /заметить/gi,
  /бережн/gi,
  /пауза/gi,
  /сначала/gi,
  /маленьк/gi,
  /можно/gi,
  /безопасн/gi,
];

function evaluateEmotionalPacing(input = {}) {
  const text = input.promptText || "";
  const paragraphs = splitParagraphs(text);
  const emotionMarkers = countMatches(text, EMOTION_PATTERNS);
  const groundingMarkers = countMatches(text, GROUNDING_PATTERNS);
  const hasProgression = paragraphs.length >= 3 && emotionMarkers > 1 && groundingMarkers > 1;
  const flatPenalty = emotionMarkers < 2 ? 0.22 : 0;
  const intensityPenalty = emotionMarkers > 18 && groundingMarkers < 4 ? 0.18 : 0;
  const progressionBoost = hasProgression ? 0.14 : 0;
  const score = clamp(0.62 + progressionBoost + Math.min(0.14, groundingMarkers * 0.018) - flatPenalty - intensityPenalty);

  return {
    score: round(score),
    status: score >= 0.78 ? "progressive" : score >= 0.64 ? "watch" : "flat_or_unbalanced",
    detected: {
      emotion_markers: emotionMarkers,
      grounding_markers: groundingMarkers,
      paragraph_count: paragraphs.length,
      has_progression: hasProgression,
    },
    warnings: [
      emotionMarkers < 2 ? "emotionally_flat_pacing" : null,
      intensityPenalty > 0 ? "emotional_intensity_needs_grounding" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Move emotionally from recognition to explanation to one grounded next step.",
      "Name inner states before advice, so the text feels human and progressive.",
      "Balance emotionally charged language with calming, body-aware or relational grounding.",
      "Avoid a flat explanatory tone for intimate or psychologically sensitive topics.",
    ],
  };
}

function emotionalPacingConstraintText() {
  return unique(evaluateEmotionalPacing({}).soft_constraints).map((item) => `- ${item}`).join("\n");
}

export {
  emotionalPacingConstraintText,
  evaluateEmotionalPacing,
};
