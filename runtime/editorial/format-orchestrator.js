import { clamp, round } from "../stabilization/utils.js";

const FORMAT_ORCHESTRATOR_SCHEMA_VERSION = "2026-05-13.format_orchestrator.v1";

const FORMAT_CYCLE = ["post", "story", "reel_script", "long_form_post", "story", "post", "reel_script"];

function formatDistributionQuality(distribution = {}) {
  const counts = Object.values(distribution).map(Number).filter((count) => count > 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return 0.72;
  const maxShare = Math.max(...counts) / total;
  return clamp(1 - Math.max(0, maxShare - 0.42) * 1.35);
}

function normalizeFormat(format = "post") {
  if (format === "carousel_script") return "post";
  if (format === "answer") return "story";
  if (format === "article") return "long_form_post";
  return format || "post";
}

function analyzeFormatOrchestration({ state = {}, runtimeState = {}, request = {}, balance = {}, audienceTemperature = {}, attention = {} } = {}) {
  const currentFormat = normalizeFormat(request.format || runtimeState.production_format || "post");
  const distribution = {
    ...(state.format_distribution || {}),
    [currentFormat]: Number(state.format_distribution?.[currentFormat] || 0) + 1,
  };
  const quality = formatDistributionQuality(distribution);
  const recent = (state.timeline || []).slice(-4).map((item) => item.format);
  const sameFormatStreak = recent.reverse().findIndex((format) => format !== currentFormat);
  const streak = sameFormatStreak === -1 ? recent.length + 1 : sameFormatStreak + 1;
  const cycleFormat = FORMAT_CYCLE[(Number(state.run_count || 0) + 1) % FORMAT_CYCLE.length];
  const saturation = audienceTemperature.audience_saturation ?? state.current_state?.audience_saturation ?? 0.2;
  const attentionDecay = attention.attention_decay ?? state.current_state?.attention_decay ?? 0.22;
  const recommendedNextFormat = saturation > 0.58
    ? "story"
    : attentionDecay > 0.5
      ? "reel_script"
      : balance.soft_selling_ratio > 0.24
        ? "educational_post"
        : quality < 0.62
          ? cycleFormat
          : cycleFormat;

  return {
    schema_version: FORMAT_ORCHESTRATOR_SCHEMA_VERSION,
    current_format: currentFormat,
    reel_post_story_balance: {
      reels: Number(distribution.reel_script || 0),
      posts: Number(distribution.post || 0) + Number(distribution.educational_post || 0),
      stories: Number(distribution.story || 0),
      long_form_posts: Number(distribution.long_form_post || 0),
    },
    format_distribution: distribution,
    format_distribution_quality: round(quality),
    same_format_streak: streak,
    recommended_next_format: recommendedNextFormat,
    avoid_selling: balance.soft_selling_ratio > 0.24 || saturation > 0.62,
    increase_warmth: saturation > 0.5 || attentionDecay > 0.45,
    increase_authority: balance.educational_ratio < 0.36 && saturation < 0.52,
    use_storytelling: attentionDecay > 0.38 || balance.storytelling_ratio < 0.2,
    inject_novelty: quality < 0.66 || streak >= 3,
    recommendation: `Next format: ${recommendedNextFormat}`,
    warnings: [
      quality < 0.62 ? "format_distribution_quality_low" : null,
      streak >= 3 ? "same_format_streak" : null,
    ].filter(Boolean),
  };
}

export {
  FORMAT_ORCHESTRATOR_SCHEMA_VERSION,
  analyzeFormatOrchestration,
  formatDistributionQuality,
  normalizeFormat,
};
