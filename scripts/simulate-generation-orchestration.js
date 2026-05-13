import { promises as fs } from "fs";
import path from "path";
import { assembleContextPack } from "./expert-context-assembly.js";
import { createGenerationPlan, getSupportedIntents, INTENT_STRATEGIES } from "./expert-generation-orchestration.js";
import { rerankRetrievalItems } from "./expert-retrieval-intelligence.js";

const ROOT = process.cwd();
const EXPERT = "dinara";
const METADATA_DIR = path.join(ROOT, "expert_profiles", EXPERT, "knowledge_sources", "cleaned", "_metadata");
const REPORT_DIR = path.join(ROOT, "expert_profiles", EXPERT, "reports", "onboarding");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge_intake", "sexologist");
const MAX_CONTEXT_ITEMS = 6;
const MAX_TOTAL_CHARS = 12000;
const EXCERPT_CHARS = 1600;

const DEFAULT_USER_REQUEST = "Напиши экспертный пост про женскую сексуальность";
const DEFAULT_OUTPUT_CONSTRAINTS = {
  platform: "instagram",
  length: "medium",
  tone: "expert_warm",
  format: "post",
  cta_style: "soft",
};

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

function normalizeName(value = "") {
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

function sanitizeCell(value) {
  return String(value || "").replace(/\|/g, "/");
}

function strategyRow([intent, strategy]) {
  return `| ${intent} | ${sanitizeCell(strategy.goal)} | ${strategy.recommended_structure.join(" -> ")} | ${strategy.voice_priorities.join(", ")} |`;
}

function renderPlanJson(plan) {
  return JSON.stringify({
    expert_id: plan.expert_id,
    generation_intent: plan.generation_intent,
    generation_strategy: plan.generation_strategy,
    context_injection_plan: {
      primary_context: plan.context_injection_plan.primary_context,
      supporting_context: plan.context_injection_plan.supporting_context,
      tone_style_context: plan.context_injection_plan.tone_style_context,
      max_quoted_content_chars_per_item: plan.context_injection_plan.max_quoted_content_chars_per_item,
      injection_rules: plan.context_injection_plan.injection_rules,
    },
    output_policy: plan.output_policy,
    orchestration_trace: plan.orchestration_trace,
  }, null, 2);
}

function renderBlueprintJson(plan) {
  return JSON.stringify(plan.prompt_blueprint, null, 2);
}

function renderContextInjectionExample(plan) {
  return JSON.stringify({
    primary_context: plan.context_injection_plan.primary_context.map((item) => ({
      id: item.id,
      title: item.title,
      role: item.role,
      content_kind: item.content_kind,
    })),
    supporting_context: plan.context_injection_plan.supporting_context.map((item) => ({
      id: item.id,
      title: item.title,
      role: item.role,
      content_kind: item.content_kind,
    })),
    max_quoted_content_chars_per_item: plan.context_injection_plan.max_quoted_content_chars_per_item,
    safety_exclusions: plan.context_injection_plan.safety_exclusions.slice(0, 5),
  }, null, 2);
}

function renderTraceExample(plan) {
  return JSON.stringify(plan.orchestration_trace.map((entry) => ({
    step: entry.step,
    ...Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "at" && key !== "step")),
  })), null, 2);
}

function renderReport({ generatedAt, reportPath, sidecarCount, candidateCount, plans }) {
  const educationalPlan = plans.educational_post;
  const strategyTable = Object.entries(INTENT_STRATEGIES)
    .map(strategyRow)
    .join("\n");
  const supportedIntents = getSupportedIntents().map((intent) => `- \`${intent}\``).join("\n");
  const blueprintSections = Object.keys(educationalPlan.prompt_blueprint).map((section) => `- \`${section}\``).join("\n");

  return `# Dinara Generation Orchestration Report

Generated: ${generatedAt}

Report path: \`${path.relative(ROOT, reportPath).replace(/\\/g, "/")}\`

This report is local-only. It did not call OpenAI, deploy, mutate production indexes, mutate FAISS/vector indexes, run ingest, run promote, generate final content, wire prompts into production, or change the live Telegram bot runtime.

## Simulation Inputs

- Expert: \`${EXPERT}\`
- Metadata sidecars loaded: ${sidecarCount}
- Simulated retrieval candidates: ${candidateCount}
- Context max items: ${MAX_CONTEXT_ITEMS}
- Context max total chars: ${MAX_TOTAL_CHARS}
- User request used for examples: ${DEFAULT_USER_REQUEST}

## Supported Intents

${supportedIntents}

## Strategy Per Intent

| generation_intent | goal | recommended structure | voice priorities |
| --- | --- | --- | --- |
${strategyTable}

## Example Generation Plan: educational_post

\`\`\`json
${renderPlanJson(educationalPlan)}
\`\`\`

## Example Prompt Blueprint Sections

${blueprintSections}

\`\`\`json
${renderBlueprintJson(educationalPlan)}
\`\`\`

## Context Injection Example

\`\`\`json
${renderContextInjectionExample(educationalPlan)}
\`\`\`

## Output Policy Example

\`\`\`json
${JSON.stringify(educationalPlan.output_policy, null, 2)}
\`\`\`

## Orchestration Trace Example

\`\`\`json
${renderTraceExample(educationalPlan)}
\`\`\`

## Future Integration Recommendations

- Keep generation orchestration after context assembly and before any model call.
- Pass only \`prompt_blueprint\`, \`context_injection_plan\`, and \`output_policy\` to a future prompt renderer.
- Store \`orchestration_trace\` next to retrieval and assembly traces for support/debugging.
- Add expert-specific voice profiles as an input to \`expert_voice_instruction\` before live generation.
- Add offline evaluation fixtures before connecting this to Telegram or Instagram surfaces.
- Keep OpenAI calls, production index mutation, ingest, promote, and deployment outside this simulation script.
`;
}

async function main() {
  const sidecars = await loadMetadataSidecars();
  const simulationItems = await makeSimulationItems(sidecars);
  const plans = {};
  const packs = {};

  for (const intent of getSupportedIntents()) {
    const reranked = rerankRetrievalItems(simulationItems, { generation_intent: intent });
    packs[intent] = assembleContextPack({
      expert_id: EXPERT,
      generation_intent: intent,
      max_context_items: MAX_CONTEXT_ITEMS,
      max_total_chars: MAX_TOTAL_CHARS,
      candidates: reranked,
    });
    plans[intent] = createGenerationPlan({
      expert_id: EXPERT,
      generation_intent: intent,
      user_request: DEFAULT_USER_REQUEST,
      context_pack: packs[intent],
      output_constraints: {
        ...DEFAULT_OUTPUT_CONSTRAINTS,
        format: intent === "faq_answer" ? "answer" : intent === "short_hook" ? "hook_list" : "post",
        cta_style: intent === "short_hook" ? "none" : DEFAULT_OUTPUT_CONSTRAINTS.cta_style,
      },
    });
  }

  const generatedAt = new Date().toISOString();
  const reportPath = path.join(REPORT_DIR, `${stamp()}_generation_orchestration_report.md`);
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(reportPath, renderReport({
    generatedAt,
    reportPath,
    sidecarCount: sidecars.length,
    candidateCount: simulationItems.length,
    plans,
  }), "utf8");

  const educationalPlan = plans.educational_post;

  console.log(`Loaded metadata sidecars: ${sidecars.length}`);
  console.log(`Simulated retrieval candidates: ${simulationItems.length}`);
  console.log(`Report: ${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`);
  console.log("\nSupported intents:");
  console.log(getSupportedIntents().join(", "));
  console.log("\nEducational post generation plan summary:");
  console.log(`Goal: ${educationalPlan.generation_strategy.goal}`);
  console.log(`Structure: ${educationalPlan.generation_strategy.recommended_structure.join(" -> ")}`);
  console.log(`Primary context ids: ${educationalPlan.context_injection_plan.primary_context.map((item) => item.id).join(", ") || "none"}`);
  console.log(`Output policy: ${educationalPlan.output_policy.platform}/${educationalPlan.output_policy.length}/${educationalPlan.output_policy.format}/${educationalPlan.output_policy.tone}`);
  console.log("\nPrompt blueprint sections:");
  console.log(Object.keys(educationalPlan.prompt_blueprint).join(", "));
  console.log("\nOrchestration trace:");
  for (const entry of educationalPlan.orchestration_trace) {
    console.log(`- ${entry.step}`);
  }
  console.log("\nWarnings:");
  console.log(packs.educational_post.context_summary.warnings.join(", ") || "none");
  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no OpenAI calls, no live bot changes, no final content generation, no production prompt wiring.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
