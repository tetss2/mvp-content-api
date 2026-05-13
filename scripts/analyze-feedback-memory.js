import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  feedbackReportsDir,
  readFeedbackMemory,
} from "./expert-feedback-memory.js";

const ROOT = process.cwd();
const EXPERT = "dinara";

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function tableRows(items, render, empty = "| - | - | - |") {
  return items?.length ? items.map(render).join("\n") : empty;
}

function warningsList(warnings) {
  if (!warnings || !Object.keys(warnings).length) return "none";
  return Object.entries(warnings).map(([key, count]) => `${key}:${count}`).join(", ");
}

function renderPatternRow(pattern) {
  return `| ${pattern.pattern} | ${pattern.usage_count} | ${pattern.average_score} | ${pattern.recent_trend} | ${warningsList(pattern.warnings)} |`;
}

function renderFeedbackMemoryReport(memory) {
  const strongest = memory.successful_patterns.patterns.slice(0, 10);
  const weakest = memory.weak_patterns.patterns.slice(0, 10);
  const commonWarnings = {};
  for (const signal of memory.generation_feedback_log) {
    for (const warning of [...(signal.warnings || []), ...(signal.style_drift_warnings || [])]) {
      commonWarnings[warning] = (commonWarnings[warning] || 0) + 1;
    }
  }
  const warningLines = Object.keys(commonWarnings).length
    ? Object.entries(commonWarnings).map(([warning, count]) => `- ${warning}: ${count}`).join("\n")
    : "- none";

  return `# Feedback Memory Report

Generated: ${new Date().toISOString()}

This report is local-only and recommendation-only. It does not modify prompts, retrieval scoring, indexes, Telegram behavior, or model training.

## Summary

- Runs analyzed: ${memory.run_count}
- Successful runs: ${memory.successful_patterns.run_count}
- Weak runs: ${memory.weak_patterns.run_count}

## Strongest Generation Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(strongest, renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Weakest Generation Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(weakest, renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Common Warnings

${warningLines}

## Adaptive Recommendations

${memory.recommendations.map((item) => `- [${item.priority}] ${item.type}: ${item.recommendation}`).join("\n")}
`;
}

function renderStyleDriftReport(memory) {
  const drift = memory.style_feedback.style_drift_warnings || [];
  const overused = memory.style_feedback.overused_phrases || [];

  return `# Style Drift Report

Generated: ${new Date().toISOString()}

## Style Drift Warnings

| run_id | intent | warnings | warmth | tone_match |
| --- | --- | --- | ---: | ---: |
${tableRows(drift, (item) => `| ${item.run_id} | ${item.intent} | ${item.warnings.join(", ")} | ${item.warmth ?? "-"} | ${item.tone_match ?? "-"} |`, "| none | - | none | - | - |")}

## Overused Phrasing

| phrase | count |
| --- | ---: |
${tableRows(overused, (item) => `| ${item.phrase} | ${item.count} |`, "| none | 0 |")}

## Interpretation

Style drift warnings are review signals only. They should guide future prompt review and human feedback labeling, not automatic prompt rewriting.
`;
}

function renderRetrievalLearningReport(memory) {
  const retrieval = memory.retrieval_feedback;
  return `# Retrieval Learning Report

Generated: ${new Date().toISOString()}

## Insights

${(retrieval.insights || []).map((insight) => `- ${insight}`).join("\n") || "- none"}

## Content Kind Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(retrieval.content_kind_performance || [], renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Source Type Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(retrieval.source_type_performance || [], renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Context Signature Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(retrieval.context_signature_performance || [], renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Boundary

These insights do not mutate retrieval scoring. They only identify context mixes worth reviewing.
`;
}

function renderGenerationPatternReport(memory) {
  const byIntent = {};
  for (const signal of memory.generation_feedback_log) {
    const intent = signal.generation_intent || "unknown";
    if (!byIntent[intent]) byIntent[intent] = { count: 0, scores: [], warnings: {} };
    byIntent[intent].count += 1;
    byIntent[intent].scores.push(Number(signal.evaluation?.overall_score || 0));
    for (const warning of [...(signal.warnings || []), ...(signal.style_drift_warnings || [])]) {
      byIntent[intent].warnings[warning] = (byIntent[intent].warnings[warning] || 0) + 1;
    }
  }
  const intentRows = Object.entries(byIntent)
    .map(([intent, item]) => {
      const avg = item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length;
      return `| ${intent} | ${item.count} | ${Number(avg.toFixed(3))} | ${warningsList(item.warnings)} |`;
    })
    .join("\n") || "| none | 0 | 0 | none |";

  return `# Generation Pattern Report

Generated: ${new Date().toISOString()}

## Best Intent Types And Weakest Intent Types

| intent | run_count | average_score | warnings |
| --- | ---: | ---: | --- |
${intentRows}

## Successful Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(memory.successful_patterns.patterns, renderPatternRow, "| none | 0 | 0 | stable | none |")}

## Weak Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
${tableRows(memory.weak_patterns.patterns, renderPatternRow, "| none | 0 | 0 | stable | none |")}
`;
}

async function writeFeedbackReports(memory, { root = ROOT, expertId = EXPERT } = {}) {
  const dir = feedbackReportsDir(root, expertId);
  await fs.mkdir(dir, { recursive: true });
  const reports = {
    feedback_memory_report: path.join(dir, "feedback_memory_report.md"),
    style_drift_report: path.join(dir, "style_drift_report.md"),
    retrieval_learning_report: path.join(dir, "retrieval_learning_report.md"),
    generation_pattern_report: path.join(dir, "generation_pattern_report.md"),
  };
  await fs.writeFile(reports.feedback_memory_report, renderFeedbackMemoryReport(memory), "utf8");
  await fs.writeFile(reports.style_drift_report, renderStyleDriftReport(memory), "utf8");
  await fs.writeFile(reports.retrieval_learning_report, renderRetrievalLearningReport(memory), "utf8");
  await fs.writeFile(reports.generation_pattern_report, renderGenerationPatternReport(memory), "utf8");
  return reports;
}

async function main() {
  const memory = await readFeedbackMemory({ root: ROOT, expertId: EXPERT });
  const reports = await writeFeedbackReports(memory, { root: ROOT, expertId: EXPERT });
  console.log(`Feedback memory runs analyzed: ${memory.run_count}`);
  console.log("Generated reports:");
  for (const report of Object.values(reports)) {
    console.log(`- ${relative(report)}`);
  }
  console.log("Local-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram changes.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  renderFeedbackMemoryReport,
  renderGenerationPatternReport,
  renderRetrievalLearningReport,
  renderStyleDriftReport,
  writeFeedbackReports,
};
