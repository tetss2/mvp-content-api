import { promises as fs } from "fs";
import path from "path";
import { createContentStrategy } from "./content-strategy-engine.js";
import {
  HOOK_TYPES,
  OUTPUT_FORMATS,
  PRODUCTION_STAGES,
  createProductionPipeline,
} from "./content-production-pipeline.js";

const ROOT = process.cwd();
const REPORT_DIR = "reports/content-production";

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

function renderProductionPipelineReport(pipeline) {
  return `# Production Pipeline Report

Generated: ${pipeline.generated_at}

This is a local-only production simulation. It does not deploy, post, mutate Telegram runtime, mutate FAISS/index files, ingest/promote data, fine-tune models, or publish content.

## Summary

- Campaign: ${pipeline.campaign_id}
- Expert: ${pipeline.expert_id}
- Packs produced: ${pipeline.packs.length}
- Output formats supported: ${OUTPUT_FORMATS.join(", ")}

## Pipeline Stages

${mdTable(["stage", "status"], PRODUCTION_STAGES.map((stage) => [stage, "simulated"]))}

## Produced Packs

${mdTable(
  ["pack_id", "day", "intent", "primary_output", "cta", "overall_score"],
  pipeline.packs.map((pack) => [
    pack.pack_id,
    pack.strategy_node.day,
    pack.strategy_node.intent,
    pack.primary_output.output_format,
    pack.cta_variants.selected_cta.cta_type,
    pack.quality_score.overall_score,
  ]),
)}

## Example Production Pack

\`\`\`json
${JSON.stringify(pipeline.packs[0], null, 2)}
\`\`\`
`;
}

function renderPlatformAdaptationReport(pipeline) {
  const rows = [];
  for (const pack of pipeline.packs) {
    rows.push([
      pack.pack_id,
      pack.primary_output.output_format,
      pack.primary_output.ideal_length,
      pack.primary_output.pacing,
      pack.primary_output.cta_placement,
    ]);
    for (const adaptation of pack.platform_adaptations) {
      rows.push([
        `${pack.pack_id} / adaptation`,
        adaptation.output_format,
        adaptation.ideal_length,
        adaptation.adaptation_note,
        "format-specific",
      ]);
    }
  }
  return `# Platform Adaptation Report

Generated: ${pipeline.generated_at}

${mdTable(["pack", "format", "ideal_length", "pacing_or_note", "cta_placement"], rows)}
`;
}

function renderHookIntelligenceReport(pipeline) {
  const hookRows = pipeline.packs.flatMap((pack) => pack.hook_intelligence.variants.map((hook) => [
    pack.pack_id,
    hook.hook_type,
    hook.fatigue_risk,
    hook.predicted_effectiveness,
    hook.text,
  ]));
  return `# Hook Intelligence Report

Generated: ${pipeline.generated_at}

## Hook Types

${HOOK_TYPES.join(", ")}

## Hook Variants

${mdTable(["pack", "hook_type", "fatigue_risk", "effectiveness", "text"], hookRows)}
`;
}

function renderNarrativeSyncReport(pipeline) {
  return `# Narrative Sync Report

Generated: ${pipeline.generated_at}

${mdTable(
  ["pack", "emotional_tone", "audience_state", "cta_level", "previous_pack", "notes"],
  pipeline.packs.map((pack) => [
    pack.pack_id,
    pack.narrative_sync.emotional_tone,
    pack.narrative_sync.audience_state,
    pack.narrative_sync.cta_escalation_level,
    pack.narrative_sync.storytelling_continuity.previous_pack_id || "none",
    pack.narrative_sync.sync_notes.join("; "),
  ]),
)}
`;
}

function renderAiSuppressionReport(pipeline) {
  const warnings = pipeline.aggregate_warnings.filter((warning) => warning.type === "ai_suppression");
  const body = warnings.length
    ? mdTable(
      ["pack", "warning", "pattern", "block"],
      warnings.map((warning) => [warning.pack_id, warning.warning, warning.pattern, warning.block_type]),
    )
    : "No generic AI suppression warnings detected in generated pack bodies.";

  return `# AI Suppression Report

Generated: ${pipeline.generated_at}

## Suppression Result

${body}

## Boundary

Suppression is local and advisory. It does not rewrite production prompts or live outputs.
`;
}

function renderProductionQualityReport(pipeline) {
  return `# Production Quality Report

Generated: ${pipeline.generated_at}

## Aggregate Quality

\`\`\`json
${JSON.stringify(pipeline.aggregate_quality, null, 2)}
\`\`\`

## Pack Scores

${mdTable(
  ["pack", "style", "emotion", "clarity", "authenticity", "generic_risk", "hallucination", "cta", "engagement", "overall"],
  pipeline.packs.map((pack) => [
    pack.pack_id,
    pack.quality_score.style_similarity,
    pack.quality_score.emotional_match,
    pack.quality_score.clarity,
    pack.quality_score.expert_authenticity,
    pack.quality_score.ai_generic_risk,
    pack.quality_score.hallucination_risk,
    pack.quality_score.cta_quality,
    pack.quality_score.engagement_potential,
    pack.quality_score.overall_score,
  ]),
)}

## Warnings

${pipeline.aggregate_warnings.length
    ? mdTable(
      ["pack", "type", "warning", "value"],
      pipeline.aggregate_warnings.map((warning) => [
        warning.pack_id,
        warning.type,
        warning.warning,
        warning.text || warning.pattern || warning.cta_type || "",
      ]),
    )
    : "none"}
`;
}

async function writeReports(pipeline) {
  await fs.mkdir(path.join(ROOT, REPORT_DIR), { recursive: true });
  const reports = {
    production_pipeline_report: renderProductionPipelineReport(pipeline),
    platform_adaptation_report: renderPlatformAdaptationReport(pipeline),
    hook_intelligence_report: renderHookIntelligenceReport(pipeline),
    narrative_sync_report: renderNarrativeSyncReport(pipeline),
    ai_suppression_report: renderAiSuppressionReport(pipeline),
    production_quality_report: renderProductionQualityReport(pipeline),
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
  const pipeline = createProductionPipeline(strategy.campaign_plan, { limit: 10 });
  const reports = await writeReports(pipeline);
  const firstPack = pipeline.packs[0];
  const exampleSuppressionWarning = pipeline.aggregate_warnings.find((warning) => warning.type === "ai_suppression") || {
    warning: "none",
    pattern: "none",
    pack_id: "none",
  };

  console.log("Production pipeline simulation: 10 campaign nodes");
  console.log(`Campaign: ${pipeline.campaign_id}`);

  console.log("\nGenerated reports:");
  for (const file of Object.values(reports)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nExample production pack:");
  console.log(JSON.stringify(firstPack, null, 2));

  console.log("\nExample hook variants:");
  console.log(JSON.stringify(firstPack.hook_intelligence.variants.slice(0, 4), null, 2));

  console.log("\nExample platform adaptations:");
  console.log(JSON.stringify(firstPack.platform_adaptations, null, 2));

  console.log("\nExample CTA escalation:");
  console.log(JSON.stringify(pipeline.packs.map((pack) => ({
    pack_id: pack.pack_id,
    day: pack.strategy_node.day,
    cta_type: pack.cta_variants.selected_cta.cta_type,
    escalation_level: pack.cta_variants.selected_cta.escalation_level,
  })), null, 2));

  console.log("\nExample AI suppression warning:");
  console.log(JSON.stringify(exampleSuppressionWarning, null, 2));

  console.log("\nExample quality score:");
  console.log(JSON.stringify(firstPack.quality_score, null, 2));

  console.log("\nWarnings/errors:");
  console.log(pipeline.aggregate_warnings.length ? `Production warnings detected: ${pipeline.aggregate_warnings.length}` : "none");

  console.log("\nLocal-only confirmation: no deploy, no production mutation, no Telegram runtime changes, no auto-posting, no Railway deploy, no FAISS/index mutation, no ingest/promote, no OpenAI fine-tuning, no production publishing.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {
  renderAiSuppressionReport,
  renderHookIntelligenceReport,
  renderNarrativeSyncReport,
  renderPlatformAdaptationReport,
  renderProductionPipelineReport,
  renderProductionQualityReport,
  writeReports,
};
