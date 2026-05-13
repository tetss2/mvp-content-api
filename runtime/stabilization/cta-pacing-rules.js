import { clamp, countMatches, round, unique } from "./utils.js";

const CTA_PATTERNS = [
  /напишите/gi,
  /запишитесь/gi,
  /приходите/gi,
  /консультац/gi,
  /сохраните/gi,
  /поделитесь/gi,
  /оставьте/gi,
  /ссылка/gi,
  /в директ/gi,
  /dm/gi,
];

const HARD_CTA_PATTERNS = [
  /запишитесь/gi,
  /приходите на консультац/gi,
  /напишите в директ/gi,
  /успейте/gi,
  /только сегодня/gi,
  /обязательно/gi,
];

function ctaLevel(type) {
  return {
    low_pressure_cta: 1,
    save_share_cta: 1,
    educational_cta: 2,
    emotional_cta: 2,
    trust_cta: 3,
    soft_cta: 3,
    dm_cta: 4,
    consultation_cta: 5,
  }[type] || 1;
}

function evaluateCtaPacing(input = {}) {
  const text = input.promptText || "";
  const runtimeCta = input.ctaPacing || {};
  const decisions = input.runtimeDecisions || {};
  const selectedType = runtimeCta.selected_cta_type || input.selectedCtaType || "low_pressure_cta";
  const trustScore = Number(input.trustScore ?? 0.35);
  const requestedLevel = ctaLevel(selectedType);
  const allowedLevel = trustScore < 0.35 ? 2 : trustScore < 0.55 ? 3 : trustScore < 0.75 ? 4 : 5;
  const ctaMentions = countMatches(text, CTA_PATTERNS);
  const hardMentions = countMatches(text, HARD_CTA_PATTERNS);
  const strongDecision = decisions.cta_strength === "strong" ? 0.18 : decisions.cta_strength === "medium" ? 0.08 : 0;
  const overload = clamp((Math.max(0, requestedLevel - allowedLevel) * 0.18) + Math.min(0.36, ctaMentions * 0.035) + Math.min(0.3, hardMentions * 0.08) + strongDecision);
  const score = clamp(1 - overload);

  return {
    score: round(score),
    pressure_score: round(overload),
    status: overload >= 0.46 ? "reduce" : overload >= 0.24 ? "watch" : "soft",
    detected: {
      selected_cta_type: selectedType,
      selected_cta_level: requestedLevel,
      allowed_cta_level: allowedLevel,
      cta_mentions: ctaMentions,
      hard_cta_mentions: hardMentions,
      runtime_cta_strength: decisions.cta_strength,
    },
    warnings: [
      overload >= 0.24 ? "reduce_cta_strength" : null,
      hardMentions > 0 ? "hard_cta_language" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Integrate CTA as one gentle continuation, not as pressure.",
      "Prefer save/return/observe wording unless trust pacing allows a consultation CTA.",
      "If a consultation is mentioned, frame it as support for a long-painful topic, not urgency.",
      "Avoid repeated CTA wording across the same prompt.",
    ],
  };
}

function ctaConstraintText() {
  return unique(evaluateCtaPacing({}).soft_constraints).map((item) => `- ${item}`).join("\n");
}

export {
  ctaConstraintText,
  evaluateCtaPacing,
};
