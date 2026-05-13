import { promises as fs } from "fs";
import path from "path";
import {
  CAMPAIGN_TYPES,
  CONTENT_INTENTS,
  CTA_TYPES,
  PLATFORMS,
  createContentStrategy,
} from "./content-strategy-engine.js";

const ROOT = process.cwd();
const REPORT_DIR = "reports/content-strategy";

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

function renderContentStrategyReport(strategy) {
  return `# Content Strategy Report

Generated: ${strategy.generated_at}

This report is local-only and planning-only. It does not generate production content, post to Telegram or Instagram, mutate indexes, ingest data, promote data, deploy, or fine-tune models.

## Taxonomy Coverage

- Content intents: ${CONTENT_INTENTS.join(", ")}
- CTA types: ${CTA_TYPES.join(", ")}
- Platforms: ${PLATFORMS.join(", ")}
- Campaign type: ${strategy.campaign_plan.campaign_label}

## Weekly Strategy

${strategy.weekly_plan.map((week) => `### Week ${week.week}: ${week.primary_goal}

${mdTable(
  ["day", "topic", "intent", "platform", "audience_state", "cta"],
  week.nodes.map((node) => [node.day, node.topic, node.intent, node.platform, node.audience_state, node.cta_type]),
)}`).join("\n\n")}

## Monthly Strategy Map

\`\`\`json
${JSON.stringify(strategy.monthly_strategy_map, null, 2)}
\`\`\`
`;
}

function renderCampaignFlowReport(strategy) {
  return `# Campaign Flow Report

Generated: ${strategy.generated_at}

## Campaign Progression

${mdTable(
  ["day", "stage", "intent", "platform", "topic", "audience_state", "cta"],
  strategy.campaign_progression_map.map((node) => [
    node.day,
    node.stage,
    node.intent,
    node.platform,
    node.topic,
    node.audience_state,
    node.cta_type,
  ]),
)}

## Supported Campaign Types

${mdTable(
  ["campaign_type", "label", "default_days", "intent_pattern"],
  Object.entries(CAMPAIGN_TYPES).map(([key, value]) => [
    key,
    value.label,
    value.default_duration_days,
    value.intent_pattern.join(" -> "),
  ]),
)}

## Topic Relationship Graph Summary

- Nodes: ${strategy.topic_cluster_graph.nodes.length}
- Edges: ${strategy.topic_cluster_graph.edges.length}
- Relationship types: ${[...new Set(strategy.topic_cluster_graph.edges.map((edge) => edge.relationship))].join(", ")}
`;
}

function renderNarrativeContinuityReport(strategy) {
  return `# Narrative Continuity Report

Generated: ${strategy.generated_at}

## Repeated Themes

${mdTable(
  ["theme", "count", "days"],
  strategy.narrative_continuity.repeated_themes.map((item) => [item.theme, item.count, item.days.join(", ")]),
)}

## Emotional Progression

${mdTable(
  ["day", "emotional_frame", "audience_state", "sophistication", "positioning"],
  strategy.narrative_continuity.emotional_progression.map((item) => [
    item.day,
    item.emotional_frame,
    item.audience_state,
    item.sophistication_level,
    item.expert_positioning,
  ]),
)}

## Storytelling Continuity

${mdTable(
  ["day", "structure", "depends_on"],
  strategy.narrative_continuity.storytelling_continuity.map((item) => [
    item.day,
    item.structure,
    item.depends_on.join(", ") || "none",
  ]),
)}
`;
}

function renderAudienceProgressionReport(strategy) {
  return `# Audience Progression Report

Generated: ${strategy.generated_at}

## State Summary

- Initial state: ${strategy.audience_state_progression.initial_state}
- Final state: ${strategy.audience_state_progression.final_state}

\`\`\`json
${JSON.stringify(strategy.audience_state_progression.state_counts, null, 2)}
\`\`\`

## Daily Adaptation

${mdTable(
  ["day", "audience_state", "intent", "cta", "planning_note"],
  strategy.audience_state_progression.progression.map((item) => [
    item.day,
    item.audience_state,
    item.adapted_intent,
    item.adapted_cta,
    item.planning_note,
  ]),
)}
`;
}

function renderRepetitionDetectionReport(strategy) {
  const warnings = strategy.repetition_detection.warnings.length
    ? mdTable(
      ["warning", "value", "count", "days", "severity"],
      strategy.repetition_detection.warnings.map((warning) => [
        warning.warning,
        warning.value,
        warning.count || warning.days?.length || 0,
        warning.days?.join(", ") || "none",
        warning.severity,
      ]),
    )
    : "No repetition warnings detected.";

  return `# Repetition Detection Report

Generated: ${strategy.generated_at}

## Checked Fields

${strategy.repetition_detection.checked_fields.map((field) => `- ${field}`).join("\n")}

## Warnings

${warnings}

## Planning Boundary

Warnings are recommendations for future editorial review. They do not rewrite prompts or mutate generation behavior.
`;
}

function renderCtaDistributionReport(strategy) {
  return `# CTA Distribution Report

Generated: ${strategy.generated_at}

## CTA Counts

\`\`\`json
${JSON.stringify(strategy.cta_distribution.cta_counts, null, 2)}
\`\`\`

## Escalation Pacing

${mdTable(
  ["day", "stage", "cta"],
  strategy.cta_distribution.escalation_pacing.map((item) => [item.day, item.stage, item.cta_type]),
)}

## CTA Warnings

${strategy.cta_distribution.warnings.length
    ? mdTable(
      ["warning", "cta_type", "count", "threshold", "days"],
      strategy.cta_distribution.warnings.map((warning) => [
        warning.warning,
        warning.cta_type,
        warning.count || "",
        warning.threshold || "",
        warning.days?.join(", ") || "",
      ]),
    )
    : "No CTA pacing warnings detected."}
`;
}

async function writeReports(strategy) {
  await fs.mkdir(path.join(ROOT, REPORT_DIR), { recursive: true });
  const reports = {
    content_strategy_report: renderContentStrategyReport(strategy),
    campaign_flow_report: renderCampaignFlowReport(strategy),
    narrative_continuity_report: renderNarrativeContinuityReport(strategy),
    audience_progression_report: renderAudienceProgressionReport(strategy),
    repetition_detection_report: renderRepetitionDetectionReport(strategy),
    cta_distribution_report: renderCtaDistributionReport(strategy),
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
  const reports = await writeReports(strategy);
  const exampleWeeklyStrategy = strategy.weekly_plan[0];
  const exampleCampaignFlow = strategy.campaign_progression_map.slice(0, 7);
  const exampleCtaPacing = strategy.cta_distribution.escalation_pacing.slice(0, 10);
  const exampleAudienceProgression = strategy.audience_state_progression.progression.slice(0, 10);
  const exampleRepetitionWarning = strategy.repetition_detection.warnings[0] || {
    warning: "none",
    value: "none",
    days: [],
    severity: "none",
  };

  console.log("Content strategy simulation: 30 days");
  console.log(`Campaign: ${strategy.campaign_plan.campaign_label}`);

  console.log("\nGenerated reports:");
  for (const file of Object.values(reports)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nExample weekly strategy:");
  console.log(JSON.stringify(exampleWeeklyStrategy, null, 2));

  console.log("\nExample campaign flow:");
  console.log(JSON.stringify(exampleCampaignFlow, null, 2));

  console.log("\nExample CTA pacing:");
  console.log(JSON.stringify(exampleCtaPacing, null, 2));

  console.log("\nExample audience progression:");
  console.log(JSON.stringify(exampleAudienceProgression, null, 2));

  console.log("\nExample repetition warning:");
  console.log(JSON.stringify(exampleRepetitionWarning, null, 2));

  console.log("\nWarnings/errors:");
  const warningCount = strategy.repetition_detection.warnings.length + strategy.cta_distribution.warnings.length;
  console.log(warningCount ? `Planning warnings detected: ${warningCount}` : "none");

  console.log("\nLocal-only confirmation: no deploy, no production mutation, no Telegram runtime changes, no auto-posting, no FAISS/index mutation, no ingest/promote, no OpenAI fine-tuning, no generation into production feeds.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {
  renderAudienceProgressionReport,
  renderCampaignFlowReport,
  renderContentStrategyReport,
  renderCtaDistributionReport,
  renderNarrativeContinuityReport,
  renderRepetitionDetectionReport,
  writeReports,
};
