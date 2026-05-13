import { promises as fs } from "fs";
import path from "path";
import {
  CONFIDENCE_SCORE_ADJUSTMENTS,
  CONTENT_KIND_INTENT_BOOSTS,
  GENERATION_INTENTS,
  SAFETY_PENALTY,
  SOURCE_TYPE_SCORE_ADJUSTMENTS,
  rerankRetrievalItems,
} from "./expert-retrieval-intelligence.js";

const ROOT = process.cwd();
const EXPERT = "dinara";
const METADATA_DIR = path.join(ROOT, "expert_profiles", EXPERT, "knowledge_sources", "cleaned", "_metadata");
const REPORT_DIR = path.join(ROOT, "expert_profiles", EXPERT, "reports", "onboarding");
const DEFAULT_INTENT = "educational_post";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function loadMetadataSidecars() {
  if (!await exists(METADATA_DIR)) {
    throw new Error(`Metadata directory not found: ${METADATA_DIR}`);
  }

  const entries = await fs.readdir(METADATA_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".metadata.json"))
    .map((entry) => path.join(METADATA_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const sidecars = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    sidecars.push({
      ...JSON.parse(raw),
      metadata_file: path.relative(ROOT, file).replace(/\\/g, "/"),
    });
  }
  return sidecars;
}

function pickExamples(sidecars) {
  const byKind = new Map();
  const selected = [];

  for (const item of sidecars) {
    const key = `${item.source_type}:${item.content_kind}:${item.confidence_level}:${item.is_generation_safe}`;
    if (!byKind.has(key)) byKind.set(key, item);
  }

  const preferredKinds = [
    "educational",
    "therapeutic_case",
    "faq",
    "short_hook",
    "sales",
    "storytelling",
    "questionnaire",
  ];

  for (const kind of preferredKinds) {
    const match = sidecars.find((item) => item.content_kind === kind && !selected.includes(item));
    if (match) selected.push(match);
  }

  for (const item of byKind.values()) {
    if (selected.length >= 10) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected.slice(0, 10);
}

function makeSimulationItems(sidecars) {
  return pickExamples(sidecars).map((metadata, index) => ({
    id: metadata.content_sha256 || metadata.metadata_file || `sample-${index}`,
    title: metadata.title || path.basename(metadata.cleaned_path || metadata.source_path || metadata.metadata_file || `sample-${index}`),
    base_score: Number((0.92 - index * 0.035).toFixed(3)),
    metadata,
  }));
}

function formatTable(items, scoreKey) {
  const rows = items.map((item, index) => {
    const trace = item.retrieval_trace;
    const metadata = item.metadata || item.retrieval_metadata;
    const score = scoreKey === "final"
      ? trace?.final_score
      : item.base_score;
    const title = (item.title || metadata?.source_path || item.id || "untitled").replace(/\|/g, "/");
    return `| ${index + 1} | ${Number(score).toFixed(4)} | ${metadata?.source_type || "unknown"} | ${metadata?.confidence_level || "unknown"} | ${metadata?.content_kind || "unknown"} | ${metadata?.is_generation_safe !== false} | ${title} |`;
  });
  return [
    "| rank | score | source_type | confidence | content_kind | safe | title |",
    "| ---: | ---: | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function traceBlock(item) {
  return JSON.stringify(item.retrieval_trace, null, 2);
}

function noisyExamples(reranked) {
  const noisy = reranked.filter((item) => item.retrieval_trace.penalties.length > 0).slice(0, 4);
  if (!noisy.length) return "- No noisy examples found in current simulation sample.";
  return noisy.map((item) => {
    const metadata = item.retrieval_metadata;
    return `- ${metadata.source_path || item.title}: ${item.retrieval_trace.penalties.join(", ")}; final ${item.retrieval_trace.final_score}`;
  }).join("\n");
}

function renderReport({ generatedAt, before, after, intent }) {
  const sourceWeights = Object.entries(SOURCE_TYPE_SCORE_ADJUSTMENTS)
    .map(([key, value]) => `| ${key} | ${value >= 0 ? `+${value}` : value} |`)
    .join("\n");
  const confidenceWeights = Object.entries(CONFIDENCE_SCORE_ADJUSTMENTS)
    .map(([key, value]) => `| ${key} | ${value >= 0 ? `+${value}` : value} |`)
    .join("\n");
  const contentBoosts = GENERATION_INTENTS
    .map((generationIntent) => {
      const boosts = CONTENT_KIND_INTENT_BOOSTS[generationIntent] || {};
      const details = Object.entries(boosts)
        .map(([kind, value]) => `${kind}:+${value}`)
        .join(", ");
      return `| ${generationIntent} | ${details || "none"} |`;
    })
    .join("\n");

  return `# Dinara Retrieval Scoring Report

Generated: ${generatedAt}

This report is local-only. It does not mutate Railway, production indexes, FAISS files, ingestion state, promotion state, Telegram runtime behavior, or generation prompts.

## Purpose

The metadata-aware retrieval scoring layer reranks already-retrieved documents after vector or semantic retrieval. It treats vector similarity as the base score, then applies deterministic metadata boosts and penalties from onboarding intelligence sidecars.

## Scoring Rules

Final score is:

\`\`\`text
base vector score
+ source_type adjustment
+ confidence_level adjustment
+ expert_signal_score adjustment
+ optional content_kind intent match
- generation safety and warning penalties
\`\`\`

The layer is additive, explainable, and backward compatible: callers can keep using plain retrieval results, or call the reranker as a post-processing step.

## Source Type Weights

| source_type | adjustment |
| --- | ---: |
${sourceWeights}

## Confidence Boosts

| confidence_level | adjustment |
| --- | ---: |
${confidenceWeights}

## Expert Signal

\`expert_signal_score\` is converted into a small continuous adjustment: values above 0.50 boost the result, values below 0.50 penalize it. This keeps expert-specific material influential without letting the metadata overwhelm semantic relevance.

## Safety Penalties

- \`is_generation_safe: false\`: ${SAFETY_PENALTY}
- each actionable warning except reference bookkeeping: -0.12

Unsafe documents are suppressed but not deleted. This preserves auditability and allows future assessment-specific workflows to opt into questionnaires deliberately.

## Content Kind Boosts

| generation_intent | content_kind boosts |
| --- | --- |
${contentBoosts}

Simulation intent used here: \`${intent}\`.

## Before Ranking

${formatTable(before, "base")}

## After Metadata-Aware Reranking

${formatTable(after, "final")}

## Noisy Document Suppression Examples

${noisyExamples(after)}

## Explainability Examples

### Top Reranked Item

\`\`\`json
${traceBlock(after[0])}
\`\`\`

### Largest Suppressed Item

\`\`\`json
${traceBlock([...after].sort((a, b) => a.retrieval_trace.final_score - b.retrieval_trace.final_score)[0])}
\`\`\`

## Future Recommendations

- Wire this as an optional post-retrieval reranker in a retrieval service adapter, not inside generation prompts.
- Keep \`generation_intent\` explicit at the API boundary so Instagram, Telegram, and future expert surfaces can choose intent independently.
- Add offline evaluation snapshots comparing plain vector ranking with metadata-aware reranking.
- Consider hard exclusion only for known unsafe source classes after human review; keep the current layer as a soft reranker for now.
- Extend sidecar matching from source-level metadata to chunk-level metadata when production indexes are rebuilt intentionally.
`;
}

async function main() {
  const intentArgIndex = process.argv.indexOf("--intent");
  const intent = intentArgIndex >= 0 ? process.argv[intentArgIndex + 1] || DEFAULT_INTENT : DEFAULT_INTENT;
  const sidecars = await loadMetadataSidecars();
  const simulationItems = makeSimulationItems(sidecars);
  const before = [...simulationItems].sort((a, b) => b.base_score - a.base_score);
  const after = rerankRetrievalItems(simulationItems, { generation_intent: intent });
  const generatedAt = new Date().toISOString();
  const reportPath = path.join(REPORT_DIR, `${stamp()}_retrieval_scoring_report.md`);

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(reportPath, renderReport({ generatedAt, before, after, intent }), "utf8");

  console.log(`Loaded metadata sidecars: ${sidecars.length}`);
  console.log(`Generation intent: ${intent}`);
  console.log(`Report: ${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`);
  console.log("\nBefore ranking:");
  for (const item of before.slice(0, 6)) {
    console.log(`${before.indexOf(item) + 1}. ${item.base_score.toFixed(3)} ${item.metadata.source_type}/${item.metadata.content_kind} ${item.title}`);
  }
  console.log("\nAfter metadata-aware reranking:");
  for (const item of after.slice(0, 6)) {
    console.log(`${item.reranked_position}. ${item.retrieval_trace.final_score.toFixed(4)} ${item.retrieval_metadata.source_type}/${item.retrieval_metadata.content_kind} ${item.title}`);
    console.log(`   boosts: ${item.retrieval_trace.boosts.join(", ") || "none"}`);
    console.log(`   penalties: ${item.retrieval_trace.penalties.join(", ") || "none"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
