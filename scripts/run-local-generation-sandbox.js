import { promises as fs } from "fs";
import path from "path";
import { compareGenerationRuns, runGenerationSandbox } from "./expert-generation-sandbox.js";

const ROOT = process.cwd();
const EXPERT = "dinara";
const REPORT_DIR = path.join(ROOT, "expert_profiles", EXPERT, "reports", "onboarding");

const SCENARIOS = [
  {
    name: "educational-instagram-post",
    generation_intent: "educational_post",
    user_request: "Напиши экспертный Instagram-пост про женскую сексуальность.",
    output_constraints: {
      platform: "instagram",
      length: "medium",
      tone: "expert_warm",
      format: "post",
      cta_style: "soft",
    },
  },
  {
    name: "storytelling-telegram-post",
    generation_intent: "storytelling",
    user_request: "Напиши теплый Telegram-пост через историю про стыд и близость.",
    output_constraints: {
      platform: "telegram",
      length: "medium",
      tone: "empathetic",
      format: "post",
      cta_style: "soft",
    },
  },
  {
    name: "faq-answer",
    generation_intent: "faq_answer",
    user_request: "Ответь на вопрос: нормально ли, что сексуальное желание меняется в отношениях?",
    output_constraints: {
      platform: "generic",
      length: "short",
      tone: "calm",
      format: "answer",
      cta_style: "consultative",
    },
  },
  {
    name: "short-hook-list",
    generation_intent: "short_hook",
    user_request: "Сделай короткие хуки про женскую сексуальность для Reels.",
    output_constraints: {
      platform: "instagram",
      length: "short",
      tone: "provocative",
      format: "hook_list",
      cta_style: "none",
    },
  },
  {
    name: "therapeutic-case-post",
    generation_intent: "therapeutic_case",
    user_request: "Напиши пост через анонимный терапевтический пример про избегание близости.",
    output_constraints: {
      platform: "instagram",
      length: "medium",
      tone: "expert_warm",
      format: "post",
      cta_style: "consultative",
    },
  },
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function scenarioTable(runs) {
  return runs.map((run) => {
    const evaluation = run.evaluation;
    return `| ${run.request.generation_intent} | ${run.request.output_constraints.platform} | ${run.request.output_constraints.format} | ${run.adapter_result.provider} | ${evaluation.overall_score} | ${evaluation.hallucination_risk} | ${evaluation.cta_quality} | ${evaluation.warnings.length ? evaluation.warnings.join(", ") : "none"} |`;
  }).join("\n");
}

function artifactTable(runs) {
  return runs.map((run) => {
    const paths = run.storage.relative_artifact_paths;
    return `| ${run.request.generation_intent} | \`${paths.finalPrompt}\` | \`${paths.generatedOutput}\` | \`${paths.evaluation}\` |`;
  }).join("\n");
}

function promptStructureExample(run) {
  return JSON.stringify(run.prompt_assembly.sections, null, 2);
}

function comparisonJson(comparison) {
  return JSON.stringify({
    run_count: comparison.run_count,
    average_overall_score: comparison.average_overall_score,
    best_run: comparison.best_run,
    lowest_scoring_run: comparison.lowest_scoring_run,
    warning_counts: comparison.warning_counts,
  }, null, 2);
}

function renderReport({ generatedAt, reportPath, runs, comparison }) {
  const strategies = runs.map((run) => (
    `- \`${run.request.generation_intent}\`: ${run.orchestration_plan.generation_strategy.goal}`
  )).join("\n");
  const warnings = Object.keys(comparison.warning_counts).length
    ? Object.entries(comparison.warning_counts).map(([warning, count]) => `- ${warning}: ${count}`).join("\n")
    : "- none";

  return `# Dinara Local Generation Sandbox Report

Generated: ${generatedAt}

Report path: \`${relative(reportPath)}\`

This report is local-only. Prompts and generated outputs are stored on disk only. This run did not deploy, mutate production indexes, mutate FAISS/vector files, run ingest, run promote, wire prompts into production, or change live Telegram behavior.

## Executed Scenarios

| intent | platform | format | adapter | overall_score | hallucination_risk | cta_quality | warnings |
| --- | --- | --- | --- | ---: | --- | --- | --- |
${scenarioTable(runs)}

## Generation Strategies Used

${strategies}

## Artifact Paths

| intent | final_prompt.txt | generated_output.md | evaluation.json |
| --- | --- | --- | --- |
${artifactTable(runs)}

## Prompt Structure Example

Example from \`${runs[0].request.generation_intent}\`:

\`\`\`json
${promptStructureExample(runs[0])}
\`\`\`

## Evaluation Summary Example

\`\`\`json
${JSON.stringify(runs[0].evaluation, null, 2)}
\`\`\`

## Comparison Summary

\`\`\`json
${comparisonJson(comparison)}
\`\`\`

## Warnings

${warnings}

## Recommendations For Future Feedback Learning

- Store human review labels next to \`evaluation.json\` without overwriting heuristic scores.
- Add reviewer fields for factuality, voice match, usefulness, CTA ethics, and publish readiness.
- Compare prompt strategies by keeping the same context pack and changing only orchestration or output policy.
- Track repeated warnings over time to decide which prompt constraints need tightening.
- Keep the OpenAI adapter local-only until evaluation fixtures and live safety boundaries are approved.
- Never allow suppressed or unsafe context items into final prompts.
`;
}

async function main() {
  const adapter = process.env.GENERATION_SANDBOX_ADAPTER || "mock";
  const runs = [];

  for (const scenario of SCENARIOS) {
    const run = await runGenerationSandbox({
      expert_id: EXPERT,
      run_name: scenario.name,
      generation_intent: scenario.generation_intent,
      user_request: scenario.user_request,
      output_constraints: scenario.output_constraints,
      adapter,
    });
    runs.push(run);
  }

  const comparison = compareGenerationRuns(runs);
  const generatedAt = new Date().toISOString();
  const reportPath = path.join(REPORT_DIR, `${stamp()}_generation_sandbox_report.md`);
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(reportPath, renderReport({ generatedAt, reportPath, runs, comparison }), "utf8");

  const example = runs[0];
  console.log(`Executed scenarios: ${runs.length}`);
  console.log(`Sandbox report: ${relative(reportPath)}`);
  console.log(`Example run dir: ${relative(example.storage.run_dir)}`);
  console.log(`Example prompt path: ${example.storage.relative_artifact_paths.finalPrompt}`);
  console.log(`Example generated output path: ${example.storage.relative_artifact_paths.generatedOutput}`);
  console.log("\nEvaluation summary example:");
  console.log(JSON.stringify({
    intent: example.request.generation_intent,
    overall_score: example.evaluation.overall_score,
    style_match_score: example.evaluation.style_match_score,
    structure_quality_score: example.evaluation.structure_quality_score,
    hallucination_risk: example.evaluation.hallucination_risk,
    cta_quality: example.evaluation.cta_quality,
    warnings: example.evaluation.warnings,
  }, null, 2));
  console.log("\nComparison summary:");
  console.log(comparisonJson(comparison));
  console.log("\nGenerated artifact paths:");
  for (const run of runs) {
    console.log(`- ${run.request.generation_intent}: ${relative(run.storage.run_dir)}`);
  }
  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram changes.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
