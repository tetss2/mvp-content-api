import { clamp, round } from "../stabilization/utils.js";

const CONTENT_BALANCE_SCHEMA_VERSION = "2026-05-13.content_balance.v1";

const CATEGORY_BY_INTENT = {
  educational_post: "educational",
  therapeutic_case: "storytelling",
  faq_answer: "educational",
  sales_post: "soft_selling",
  short_hook: "attention",
};

function distributionShare(distribution = {}, key) {
  const total = Object.values(distribution).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) return 0;
  return Number(distribution[key] || 0) / total;
}

function inferCategory({ runtimeState = {}, request = {} } = {}) {
  const intent = request.intent || runtimeState.generation_intent?.intent || "educational_post";
  const ctaType = request.ctaType || request.cta_type || runtimeState.cta_pacing?.selected_cta_type || "";
  if (String(ctaType).includes("consultation") || intent === "sales_post") return "soft_selling";
  if (request.format === "reel_script" || runtimeState.production_format === "reel_script") return "attention";
  return CATEGORY_BY_INTENT[intent] || "educational";
}

function analyzeContentBalance({ state = {}, runtimeState = {}, request = {}, strategicBrain = {}, campaignMemory = {} } = {}) {
  const category = inferCategory({ runtimeState, request });
  const nextDistribution = {
    ...(state.content_category_distribution || {}),
    [category]: Number(state.content_category_distribution?.[category] || 0) + 1,
  };
  const educationalRatio = distributionShare(nextDistribution, "educational");
  const softSellingRatio = distributionShare(nextDistribution, "soft_selling");
  const storytellingRatio = distributionShare(nextDistribution, "storytelling");
  const emotionalRatio = distributionShare(nextDistribution, "storytelling") + distributionShare(nextDistribution, "attention") * 0.35;
  const authorityLevel = strategicBrain.adapter_signals?.authority_level ?? strategicBrain.strategic_state_summary?.authority_level ?? 0.45;
  const authorityBalance = clamp(0.84 - Math.abs(Number(authorityLevel) - 0.58) * 0.65 - Math.max(0, softSellingRatio - 0.24) * 0.55);
  const educationalBalance = clamp(0.86 - Math.abs(educationalRatio - 0.45) * 0.75);
  const softSellingBalance = clamp(0.9 - Math.max(0, softSellingRatio - 0.22) * 1.2);
  const emotionalBalance = clamp(0.86 - Math.abs(emotionalRatio - 0.34) * 0.7);
  const diversity = clamp((educationalBalance * 0.3) + (softSellingBalance * 0.25) + (emotionalBalance * 0.2) + (authorityBalance * 0.25));
  const ctaFatigue = campaignMemory.adapter_signals?.cta_fatigue_level || "low";

  return {
    schema_version: CONTENT_BALANCE_SCHEMA_VERSION,
    selected_category: category,
    content_category_balance: nextDistribution,
    expert_authority_balance: round(authorityBalance),
    emotional_content_ratio: round(emotionalRatio),
    educational_ratio: round(educationalRatio),
    soft_selling_ratio: round(softSellingRatio),
    storytelling_ratio: round(storytellingRatio),
    editorial_diversity: round(diversity),
    educational_balance: round(educationalBalance),
    authority_balance: round(authorityBalance),
    recommendation: softSellingRatio > 0.24 || ctaFatigue === "high"
      ? "Avoid selling; use educational or reflective content next."
      : educationalRatio < 0.32
        ? "Rebuild educational grounding before another emotional or CTA-heavy post."
        : "Balance supports steady editorial progression.",
    warnings: [
      softSellingRatio > 0.26 ? "soft_selling_ratio_high" : null,
      educationalRatio < 0.28 ? "educational_ratio_low" : null,
      authorityBalance < 0.62 ? "authority_balance_watch" : null,
    ].filter(Boolean),
  };
}

export {
  CONTENT_BALANCE_SCHEMA_VERSION,
  analyzeContentBalance,
  inferCategory,
};
