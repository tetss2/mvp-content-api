import { promises as fs } from "fs";
import path from "path";
import { assembleContextPack, GENERATION_INTENT_STRATEGIES } from "./expert-context-assembly.js";
import { rerankRetrievalItems } from "./expert-retrieval-intelligence.js";

const ROOT = process.cwd();
const EXPERT = "dinara";
const METADATA_DIR = path.join(ROOT, "expert_profiles", EXPERT, "knowledge_sources", "cleaned", "_metadata");
const REPORT_DIR = path.join(ROOT, "expert_profiles", EXPERT, "reports", "onboarding");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge_intake", "sexologist");
const MAX_CONTEXT_ITEMS = 6;
const MAX_TOTAL_CHARS = 12000;
const EXCERPT_CHARS = 1600;

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

async function walkFiles(dir) {
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
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
      metadata_filename: path.basename(file),
    });
  }
  return sidecars;
}

function sidecarTitle(metadata) {
  const fromMetadataFile = metadata.metadata_filename
    ?.replace(/^current_kb_(approved|high|medium)__/, "")
    .replace(/\.metadata\.json$/, "");
  return metadata.title || fromMetadataFile || path.basename(metadata.cleaned_path || metadata.source_path || "untitled");
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/\.metadata\.json$/, "")
    .replace(/^current_kb_(approved|high|medium)__/, "")
    .normalize("NFC");
}

async function resolveContentPath(metadata, knowledgeFiles) {
  const declared = metadata.cleaned_path || metadata.source_path;
  if (declared) {
    const absolute = path.join(ROOT, declared);
    if (await exists(absolute)) return absolute;
  }

  const sidecarBase = normalizeName(metadata.metadata_filename || "");
  const exact = knowledgeFiles.find((file) => normalizeName(path.basename(file)) === sidecarBase);
  if (exact) return exact;

  const withoutCleaned = sidecarBase.replace(/\.cleaned\.txt$/, "");
  return knowledgeFiles.find((file) => normalizeName(path.basename(file)).includes(withoutCleaned)) || null;
}

function cleanExcerpt(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_CHARS);
}

async function readExcerpt(metadata, knowledgeFiles) {
  const contentPath = await resolveContentPath(metadata, knowledgeFiles);
  if (!contentPath) return "";
  const raw = await fs.readFile(contentPath, "utf8");
  return cleanExcerpt(raw);
}

function simulatedBaseScore(metadata, index) {
  const confidenceBoost = metadata.confidence_level === "high" ? 0.06 : metadata.confidence_level === "medium" ? 0.02 : -0.05;
  const safeBoost = metadata.is_generation_safe === false ? -0.08 : 0.03;
  const signalBoost = Math.max(0, Math.min(1, Number(metadata.expert_signal_score || 0))) * 0.08;
  return Number((0.72 - index * 0.012 + confidenceBoost + safeBoost + signalBoost).toFixed(4));
}

function makeDuplicateProbe(items) {
  const duplicateSource = items.find((item) => item.metadata?.content_sha256 && item.metadata?.is_generation_safe !== false);
  if (!duplicateSource) return null;
  return {
    ...duplicateSource,
    id: `${duplicateSource.id}:duplicate-probe`,
    title: `${duplicateSource.title} duplicate probe`,
    base_score: Number((duplicateSource.base_score - 0.03).toFixed(4)),
  };
}

async function makeSimulationItems(sidecars) {
  const knowledgeFiles = (await walkFiles(KNOWLEDGE_DIR)).filter((file) => file.endsWith(".txt"));
  const items = [];

  for (const [index, metadata] of sidecars.entries()) {
    const title = sidecarTitle(metadata);
    items.push({
      id: metadata.content_sha256 || metadata.metadata_file || `candidate-${index}`,
      title,
      base_score: simulatedBaseScore(metadata, index),
      content: await readExcerpt(metadata, knowledgeFiles),
      metadata,
    });
  }

  const duplicateProbe = makeDuplicateProbe(items);
  if (duplicateProbe) items.push(duplicateProbe);

  return items;
}

function itemLine(item) {
  const trace = item.retrieval_trace || {};
  const title = (item.title || item.source_path || item.id || "untitled").replace(/\|/g, "/");
  return `| ${item.selection_rank || "-"} | ${Number(trace.final_score || 0).toFixed(4)} | ${item.source_type || item.retrieval_metadata?.source_type || "unknown"} | ${item.content_kind || item.retrieval_metadata?.content_kind || "unknown"} | ${item.confidence_level || item.retrieval_metadata?.confidence_level || "unknown"} | ${title} |`;
}

function suppressedLine(item) {
  const trace = item.retrieval_trace || {};
  const title = (item.title || item.source_path || item.id || "untitled").replace(/\|/g, "/");
  return `| ${Number(trace.final_score || 0).toFixed(4)} | ${item.source_type} | ${item.content_kind} | ${item.suppressed_because.join(", ")} | ${title} |`;
}

function renderContextPackJson(pack) {
  return JSON.stringify({
    expert_id: pack.expert_id,
    generation_intent: pack.generation_intent,
    selected_items: pack.selected_items.slice(0, 3).map((item) => ({
      selection_rank: item.selection_rank,
      title: item.title,
      source_type: item.source_type,
      content_kind: item.content_kind,
      selected_because: item.selected_because,
      retrieval_trace: item.retrieval_trace,
    })),
    context_summary: pack.context_summary,
  }, null, 2);
}

function renderReport({ generatedAt, reportPath, packs }) {
  const intentRows = Object.entries(GENERATION_INTENT_STRATEGIES)
    .map(([intent, kinds]) => `| ${intent} | ${kinds.join(", ")} |`)
    .join("\n");

  const packSections = Object.values(packs).map((pack) => {
    const selectedRows = pack.selected_items.length
      ? pack.selected_items.map(itemLine).join("\n")
      : "| - | - | - | - | - | No selected items |";
    const suppressedRows = pack.suppressed_items.length
      ? pack.suppressed_items.slice(0, 10).map(suppressedLine).join("\n")
      : "| - | - | - | No suppressed items | - |";
    const warnings = pack.context_summary.warnings.length
      ? pack.context_summary.warnings.map((warning) => `- ${warning}`).join("\n")
      : "- none";

    return `## Intent: ${pack.generation_intent}

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
${selectedRows}

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
${suppressedRows}

### Warnings

${warnings}

### Example Context Pack

\`\`\`json
${renderContextPackJson(pack)}
\`\`\``;
  }).join("\n\n");

  return `# Dinara Context Assembly Report

Generated: ${generatedAt}

Report path: \`${path.relative(ROOT, reportPath).replace(/\\/g, "/")}\`

This report is local-only. It did not call OpenAI, deploy, mutate production indexes, mutate FAISS/vector indexes, run ingest, run promote, or change the live Telegram bot runtime.

## Purpose

The context assembly layer turns already-scored retrieval candidates into a curated context pack for future expert generation. Retrieval can find and rerank candidates; assembly decides which candidates are safe, diverse, budget-aware, and useful enough to send forward.

## Supported Intents

| generation_intent | preferred content kinds |
| --- | --- |
${intentRows}

## Selection Rules

- Prioritize highest \`retrieval_trace.final_score\`.
- Select generation-safe candidates only.
- Prefer candidates whose \`content_kind\` matches the generation intent.
- Preserve \`retrieval_trace\` from metadata-aware scoring.
- Add \`selected_because\` reasons such as \`high_final_score\`, \`intent_content_match\`, \`generation_safe\`, and diversity signals.

## Diversity Rules

- Max selected items per \`content_kind\`: 2.
- Max selected items per \`source_type\`: 3.
- Suppress exact \`content_sha256\` duplicates.
- Warn when selected context is narrow, has one source type, or safe candidates are scarce.

## Context Budget Rules

- Max context items: ${MAX_CONTEXT_ITEMS}.
- Max total selected characters: ${MAX_TOTAL_CHARS}.
- The simulator uses local text excerpts of up to ${EXCERPT_CHARS} characters per source to approximate future chunk-level candidates.

## Suppression Logic

Items can be suppressed for \`generation_unsafe\`, \`questionnaire_context\`, \`noisy_warnings\`, \`low_final_score\`, \`duplicate_content_hash\`, \`content_kind_limit\`, \`source_type_limit\`, \`max_context_items_reached\`, or \`context_budget_exceeded\`.

${packSections}

## Recommended Future Integration Points

- Place assembly after metadata-aware reranking and before prompt/context construction.
- Keep \`generation_intent\` explicit at the orchestration boundary for Telegram, Instagram, and future expert surfaces.
- Feed \`selected_items[].content\` into generation only after a separate prompt-building layer is designed.
- Store \`assembly_trace\` with generation diagnostics for support and evaluation.
- Move from source-level sidecars to chunk-level sidecar joins when indexes are intentionally rebuilt.
`;
}

async function main() {
  const sidecars = await loadMetadataSidecars();
  const simulationItems = await makeSimulationItems(sidecars);
  const packs = {};

  for (const intent of Object.keys(GENERATION_INTENT_STRATEGIES)) {
    const reranked = rerankRetrievalItems(simulationItems, { generation_intent: intent });
    packs[intent] = assembleContextPack({
      expert_id: EXPERT,
      generation_intent: intent,
      max_context_items: MAX_CONTEXT_ITEMS,
      max_total_chars: MAX_TOTAL_CHARS,
      candidates: reranked,
    });
  }

  const generatedAt = new Date().toISOString();
  const reportPath = path.join(REPORT_DIR, `${stamp()}_context_assembly_report.md`);
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(reportPath, renderReport({ generatedAt, reportPath, packs }), "utf8");

  const educationalPack = packs.educational_post;
  const noisySuppressed = educationalPack.suppressed_items.find((item) => item.suppressed_because.includes("generation_unsafe") || item.suppressed_because.includes("noisy_warnings"));

  console.log(`Loaded metadata sidecars: ${sidecars.length}`);
  console.log(`Simulated retrieval candidates: ${simulationItems.length}`);
  console.log(`Report: ${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`);
  console.log("\nEducational post selected context pack:");
  for (const item of educationalPack.selected_items) {
    console.log(`${item.selection_rank}. ${item.retrieval_trace.final_score.toFixed(4)} ${item.source_type}/${item.content_kind} ${item.title}`);
    console.log(`   selected because: ${item.selected_because.join(", ")}`);
  }

  console.log("\nExample suppressed noisy item:");
  if (noisySuppressed) {
    console.log(`${noisySuppressed.source_type}/${noisySuppressed.content_kind} ${noisySuppressed.title}`);
    console.log(`   suppressed because: ${noisySuppressed.suppressed_because.join(", ")}`);
    console.log(`   penalties: ${noisySuppressed.retrieval_trace?.penalties?.join(", ") || "none"}`);
  } else {
    console.log("No unsafe/noisy item appeared in the educational_post simulation.");
  }

  console.log("\nWarnings:");
  console.log(educationalPack.context_summary.warnings.join(", ") || "none");
  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no OpenAI calls, no live bot changes.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
