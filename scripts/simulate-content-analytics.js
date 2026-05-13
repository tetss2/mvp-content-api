import { promises as fs } from "fs";
import path from "path";
import { createContentStrategy } from "./content-strategy-engine.js";
import { createProductionPipeline } from "./content-production-pipeline.js";
import { analyzeContentPerformance } from "./content-analytics-engine.js";

const ROOT = process.cwd();
const REPORT_DIR = "reports/content-analytics";

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function mdTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [headerLine, separator, ...body].join("\n");
}

function reportFile(name) {
  return path.join(ROOT, REPORT_DIR, `${name}.md`);
}

function renderEngagementReport(analytics) {
  return `# Engagement Report

Generated: ${analytics.generated_at}

Local-only simulated analytics. No real social APIs, posting, deployment, Telegram runtime changes, index mutation, ingest/promote, or fine-tuning.

${mdTable(
  ["day", "pack", "platform", "views", "saves", "shares", "comments", "retention", "CTA_conversion"],
  analytics.engagement.map((item) => [
    item.day,
    item.pack_id,
    item.platform,
    item.metrics.views,
    item.metrics.saves,
    item.metrics.shares,
    item.metrics.comments,
    item.metrics.retention,
    item.metrics.CTA_conversion,
  ]),
)}
`;
}

function renderHookPerformanceReport(analytics) {
  return `# Hook Performance Report

Generated: ${analytics.generated_at}

${mdTable(
  ["hook_type", "posts", "avg_retention", "avg_saves", "avg_shares", "hook_fatigue", "insight"],
  analytics.hook_performance.map((item) => [
    item.hook_type,
    item.posts,
    item.average_retention,
    item.average_saves,
    item.average_shares,
    item.hook_fatigue,
    item.insight,
  ]),
)}
`;
}

function renderCtaAnalyticsReport(analytics) {
  return `# CTA Analytics Report

Generated: ${analytics.generated_at}

${mdTable(
  ["cta_type", "uses", "avg_CTA_conversion", "avg_DM_conversion", "avg_consultation_interest", "fatigue_risk", "recommendation"],
  analytics.cta_analytics.map((item) => [
    item.cta_type,
    item.uses,
    item.average_CTA_conversion,
    item.average_DM_conversion,
    item.average_consultation_interest,
    item.fatigue_risk,
    item.recommendation,
  ]),
)}
`;
}

function renderStorytellingAnalyticsReport(analytics) {
  return `# Storytelling Analytics Report

Generated: ${analytics.generated_at}

${mdTable(
  ["pack", "structure", "emotional_frame", "narrative_retention", "vulnerability", "authority_signal"],
  analytics.storytelling_analytics.map((item) => [
    item.pack_id,
    item.structure,
    item.emotional_frame,
    item.narrative_retention,
    item.vulnerability_resonance,
    item.authority_storytelling_performance ?? "n/a",
  ]),
)}
`;
}

function renderAudienceTransitionReport(analytics) {
  return `# Audience Transition Report

Generated: ${analytics.generated_at}

## Transitions

${mdTable(
  ["from", "to", "days", "retention_delta", "conversion_delta", "friction", "overload_risk"],
  analytics.audience_transition_analytics.transitions.map((item) => [
    item.from_state,
    item.to_state,
    item.days.join(" -> "),
    item.retention_delta,
    item.conversion_delta,
    item.friction,
    item.emotional_overload_risk,
  ]),
)}

## Friction Points

${analytics.audience_transition_analytics.friction_points.length
    ? mdTable(
      ["from", "to", "days", "friction", "overload"],
      analytics.audience_transition_analytics.friction_points.map((item) => [
        item.from_state,
        item.to_state,
        item.days.join(" -> "),
        item.friction,
        item.emotional_overload_risk,
      ]),
    )
    : "none"}
`;
}

function renderOptimizationRecommendationsReport(analytics) {
  return `# Optimization Recommendations Report

Generated: ${analytics.generated_at}

${mdTable(
  ["area", "priority", "recommendation", "evidence"],
  analytics.optimization_recommendations.map((item) => [
    item.area,
    item.priority,
    item.recommendation,
    item.evidence,
  ]),
)}
`;
}

function renderGrowthPatternsReport(analytics) {
  return `# Growth Patterns Report

Generated: ${analytics.generated_at}

${analytics.growth_patterns.length
    ? mdTable(
      ["pattern", "pack", "driver", "signal"],
      analytics.growth_patterns.map((item) => [
        item.pattern,
        item.pack_id,
        item.driver,
        item.signal,
      ]),
    )
    : "No growth patterns detected."}
`;
}

function renderContentDecayReport(analytics) {
  return `# Content Decay Report

Generated: ${analytics.generated_at}

${analytics.content_decay.length
    ? mdTable(
      ["warning", "theme_or_cta", "count", "first_retention", "latest_retention"],
      analytics.content_decay.map((item) => [
        item.warning,
        item.theme || item.cta_type || item.note,
        item.count || "",
        item.first_retention || "",
        item.latest_retention || "",
      ]),
    )
    : "No content decay warnings detected."}
`;
}

async function writeReports(analytics) {
  await fs.mkdir(path.join(ROOT, REPORT_DIR), { recursive: true });
  const reports = {
    engagement_report: renderEngagementReport(analytics),
    hook_performance_report: renderHookPerformanceReport(analytics),
    cta_analytics_report: renderCtaAnalyticsReport(analytics),
    storytelling_analytics_report: renderStorytellingAnalyticsReport(analytics),
    audience_transition_report: renderAudienceTransitionReport(analytics),
    optimization_recommendations_report: renderOptimizationRecommendationsReport(analytics),
    growth_patterns_report: renderGrowthPatternsReport(analytics),
    content_decay_report: renderContentDecayReport(analytics),
  };
  const paths = {};
  for (const [name, content] of Object.entries(reports)) {
    const file = reportFile(name);
    await fs.writeFile(file, content, "utf8");
    paths[name] = file;
  }
  return paths;
}

async function main() {
  const strategy = createContentStrategy({
    expertId: "dinara",
    campaignType: "trust_building_flow",
    durationDays: 30,
    initialAudienceState: "cold",
  });
  const pipeline = createProductionPipeline(strategy.campaign_plan, { limit: 30 });
  const analytics = analyzeContentPerformance(pipeline);
  const reports = await writeReports(analytics);
  const hookInsight = analytics.hook_performance[0] || {};
  const ctaRecommendation = analytics.optimization_recommendations.find((item) => item.area === "CTA pacing")
    || analytics.optimization_recommendations[0]
    || {};
  const transitionInsight = analytics.audience_transition_analytics.transitions[0] || {};
  const growthPattern = analytics.growth_patterns[0] || { pattern: "none" };
  const decayWarning = analytics.content_decay[0] || { warning: "none" };

  console.log("Content analytics simulation: 30 days");
  console.log(`Packs analyzed: ${analytics.engagement.length}`);

  console.log("\nGenerated reports:");
  for (const file of Object.values(reports)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nExample engagement simulation:");
  console.log(JSON.stringify(analytics.engagement[0], null, 2));

  console.log("\nExample hook performance insight:");
  console.log(JSON.stringify(hookInsight, null, 2));

  console.log("\nExample CTA optimization recommendation:");
  console.log(JSON.stringify(ctaRecommendation, null, 2));

  console.log("\nExample audience transition insight:");
  console.log(JSON.stringify(transitionInsight, null, 2));

  console.log("\nExample growth pattern:");
  console.log(JSON.stringify(growthPattern, null, 2));

  console.log("\nExample content decay warning:");
  console.log(JSON.stringify(decayWarning, null, 2));

  console.log("\nWarnings/errors:");
  console.log(analytics.content_decay.length ? `Content decay warnings detected: ${analytics.content_decay.length}` : "none");

  console.log("\nLocal-only confirmation: no deploy, no production mutation, no Telegram runtime changes, no auto-posting, no Railway deploy, no FAISS/index mutation, no ingest/promote, no OpenAI fine-tuning, no real social API integrations, no production publishing.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {
  renderAudienceTransitionReport,
  renderContentDecayReport,
  renderCtaAnalyticsReport,
  renderEngagementReport,
  renderGrowthPatternsReport,
  renderHookPerformanceReport,
  renderOptimizationRecommendationsReport,
  renderStorytellingAnalyticsReport,
  writeReports,
};
