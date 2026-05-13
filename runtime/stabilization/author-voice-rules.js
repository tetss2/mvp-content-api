import { clamp, countMatches, round, splitParagraphs, unique } from "./utils.js";

const WARMTH_PATTERNS = [
  /бережн/gi,
  /мягк/gi,
  /спокойн/gi,
  /можно/gi,
  /важно заметить/gi,
  /иногда/gi,
  /внутри/gi,
  /рядом/gi,
  /контакт/gi,
  /чувств/gi,
  /тело/gi,
  /стыд/gi,
  /безопасн/gi,
];

const ROBOTIC_PATTERNS = [
  /следует отметить/gi,
  /таким образом/gi,
  /в заключени[еи]/gi,
  /данная тема/gi,
  /рассмотрим подробнее/gi,
  /существует множество факторов/gi,
  /это является важным аспектом/gi,
  /необходимо подчеркнуть/gi,
  /важно понимать/gi,
];

const EXPERT_FRAME_PATTERNS = [
  /как психолог/gi,
  /как сексолог/gi,
  /в терапии/gi,
  /на консультации/gi,
  /к специалисту/gi,
  /психик/gi,
];

function evaluateAuthorVoice(input = {}) {
  const text = input.promptText || "";
  const decisions = input.runtimeDecisions || {};
  const paragraphs = splitParagraphs(text);
  const warmth = countMatches(text, WARMTH_PATTERNS);
  const robotic = countMatches(text, ROBOTIC_PATTERNS);
  const expertFrame = countMatches(text, EXPERT_FRAME_PATTERNS);
  const hasSoftAuthority = decisions.authority_framing === "low_pressure_expertise" || decisions.authority_framing === "explicit_expert_frame";
  const paragraphPenalty = paragraphs.length >= 7 && paragraphs.every((item) => item.length < 260) ? 0.07 : 0;
  const score = clamp(0.58 + Math.min(0.22, warmth * 0.018) + Math.min(0.12, expertFrame * 0.02) + (hasSoftAuthority ? 0.04 : 0) - Math.min(0.25, robotic * 0.045) - paragraphPenalty);

  return {
    score: round(score),
    confidence: round(score),
    status: score >= 0.78 ? "stable" : score >= 0.66 ? "watch" : "drift",
    detected: {
      warmth_markers: warmth,
      robotic_transitions: robotic,
      expert_framing_markers: expertFrame,
      paragraph_count: paragraphs.length,
    },
    warnings: [
      score < 0.66 ? "author_voice_drift" : null,
      robotic > 1 ? "robotic_transitions" : null,
      warmth < 4 ? "low_warmth_markers" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Keep Dinara's voice warm, specific, and gently expert rather than motivational.",
      "Use psychologically nuanced Russian phrasing with lived inner states, not abstract advice.",
      "Prefer soft authority: explain what may be happening inside the psyche before suggesting action.",
      "Avoid formulaic transitions such as 'таким образом', 'в заключение', and 'следует отметить'.",
    ],
  };
}

function authorVoiceConstraintText() {
  return unique(evaluateAuthorVoice({}).soft_constraints).map((item) => `- ${item}`).join("\n");
}

export {
  evaluateAuthorVoice,
  authorVoiceConstraintText,
};
