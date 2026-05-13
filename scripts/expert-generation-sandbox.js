import { promises as fs } from "fs";
import path from "path";
import { assembleContextPack } from "./expert-context-assembly.js";
import { createGenerationPlan } from "./expert-generation-orchestration.js";
import { rerankRetrievalItems } from "./expert-retrieval-intelligence.js";
import { evaluateGeneratedOutput } from "./expert-output-evaluation.js";
import { generateWithMockAdapter } from "./adapters/mock-generation-adapter.js";
import { generateWithOpenAIAdapter } from "./adapters/openai-generation-adapter.js";

const ROOT = process.cwd();
const DEFAULT_EXPERT = "dinara";
const DEFAULT_EXCERPT_CHARS = 1600;
const DEFAULT_MAX_CONTEXT_ITEMS = 6;
const DEFAULT_MAX_TOTAL_CHARS = 12000;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slugify(value) {
  return String(value || "generation-run")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "generation-run";
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

async function loadMetadataSidecars({
  root = ROOT,
  expertId = DEFAULT_EXPERT,
  metadataDir = path.join(root, "expert_profiles", expertId, "knowledge_sources", "cleaned", "_metadata"),
} = {}) {
  if (!await exists(metadataDir)) {
    throw new Error(`Metadata directory not found: ${metadataDir}`);
  }

  const entries = await fs.readdir(metadataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".metadata.json"))
    .map((entry) => path.join(metadataDir, entry.name))
    .sort((a, b) => a.localeCompare(b));

  const sidecars = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    sidecars.push({
      ...JSON.parse(raw),
      metadata_file: path.relative(root, file).replace(/\\/g, "/"),
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

async function resolveContentPath(metadata, knowledgeFiles, root = ROOT) {
  const declared = metadata.cleaned_path || metadata.source_path;
  if (declared) {
    const absolute = path.join(root, declared);
    if (await exists(absolute)) return absolute;
  }

  const sidecarBase = normalizeName(metadata.metadata_filename || "");
  const exact = knowledgeFiles.find((file) => normalizeName(path.basename(file)) === sidecarBase);
  if (exact) return exact;

  const withoutCleaned = sidecarBase.replace(/\.cleaned\.txt$/, "");
  return knowledgeFiles.find((file) => normalizeName(path.basename(file)).includes(withoutCleaned)) || null;
}

function cleanExcerpt(text, maxChars = DEFAULT_EXCERPT_CHARS) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

async function readExcerpt(metadata, knowledgeFiles, options = {}) {
  const contentPath = await resolveContentPath(metadata, knowledgeFiles, options.root || ROOT);
  if (!contentPath) return "";
  const raw = await fs.readFile(contentPath, "utf8");
  return cleanExcerpt(raw, options.excerptChars || DEFAULT_EXCERPT_CHARS);
}

function simulatedBaseScore(metadata, index) {
  const confidenceBoost = metadata.confidence_level === "high" ? 0.06 : metadata.confidence_level === "medium" ? 0.02 : -0.05;
  const safeBoost = metadata.is_generation_safe === false ? -0.08 : 0.03;
  const signalBoost = Math.max(0, Math.min(1, Number(metadata.expert_signal_score || 0))) * 0.08;
  return Number((0.72 - index * 0.012 + confidenceBoost + safeBoost + signalBoost).toFixed(4));
}

async function createLocalRetrievalCandidates({
  root = ROOT,
  expertId = DEFAULT_EXPERT,
  knowledgeDir = path.join(root, "knowledge_intake", "sexologist"),
  excerptChars = DEFAULT_EXCERPT_CHARS,
} = {}) {
  const sidecars = await loadMetadataSidecars({ root, expertId });
  const knowledgeFiles = (await walkFiles(knowledgeDir)).filter((file) => file.endsWith(".txt"));
  const items = [];

  for (const [index, metadata] of sidecars.entries()) {
    items.push({
      id: metadata.content_sha256 || metadata.metadata_file || `candidate-${index}`,
      title: sidecarTitle(metadata),
      base_score: simulatedBaseScore(metadata, index),
      content: await readExcerpt(metadata, knowledgeFiles, { root, excerptChars }),
      metadata,
    });
  }

  return {
    sidecars,
    candidates: items,
  };
}

function contextItemsById(contextPack = {}) {
  const map = new Map();
  for (const item of contextPack.selected_items || []) {
    if (item?.id && item.is_generation_safe !== false) map.set(item.id, item);
  }
  return map;
}

function renderContextBlock({ heading, planItems = [], contextMap, maxChars }) {
  const blocks = [];
  for (const planItem of planItems) {
    const item = contextMap.get(planItem.id);
    if (!item || item.is_generation_safe === false) continue;
    const excerpt = cleanExcerpt(item.content, maxChars);
    if (!excerpt) continue;
    blocks.push([
      `### ${heading}: ${item.title || item.id}`,
      `- id: ${item.id}`,
      `- source_type: ${item.source_type}`,
      `- content_kind: ${item.content_kind}`,
      `- confidence: ${item.confidence_level}`,
      "",
      excerpt,
    ].join("\n"));
  }
  return blocks.join("\n\n");
}

function assembleFinalPrompt({ plan, contextPack }) {
  const blueprint = plan.prompt_blueprint;
  const contextMap = contextItemsById(contextPack);
  const injection = plan.context_injection_plan;
  const maxChars = injection.max_quoted_content_chars_per_item || 280;
  const primaryContext = renderContextBlock({
    heading: "Primary context",
    planItems: injection.primary_context,
    contextMap,
    maxChars,
  });
  const supportingContext = renderContextBlock({
    heading: "Supporting context",
    planItems: injection.supporting_context,
    contextMap,
    maxChars,
  });
  const toneContext = renderContextBlock({
    heading: "Tone/style context",
    planItems: injection.tone_style_context,
    contextMap,
    maxChars: Math.min(maxChars, 180),
  });

  const systemPrompt = [
    blueprint.system_instruction,
    blueprint.expert_voice_instruction,
    blueprint.safety_instruction,
  ].join("\n\n");

  const finalPrompt = [
    "# Generation Task",
    blueprint.final_user_request,
    "",
    "# Strategy",
    blueprint.generation_strategy_instruction,
    "",
    "# Output Constraints",
    blueprint.output_constraints_instruction,
    "",
    "# Context Injection Rules",
    injection.injection_rules.map((rule) => `- ${rule}`).join("\n"),
    "",
    "# Curated Context",
    primaryContext || "No primary context selected.",
    "",
    supportingContext || "No supporting context selected.",
    "",
    toneContext || "No tone/style context selected.",
    "",
    "# Safety",
    blueprint.safety_instruction,
    "",
    "# Produce Final Draft",
    "Write the requested expert content in Russian. Use the curated context as grounding, synthesize rather than copying, and do not mention internal traces or source ids.",
  ].join("\n");

  return {
    system_prompt: systemPrompt,
    final_prompt: finalPrompt,
    sections: {
      system_prompt: ["system_instruction", "expert_voice_instruction", "safety_instruction"],
      final_prompt: [
        "final_user_request",
        "generation_strategy_instruction",
        "output_constraints_instruction",
        "context_injection_rules",
        "curated_context",
        "safety_instruction",
      ],
    },
  };
}

async function runAdapter({ adapterName, systemPrompt, finalPrompt, plan }) {
  if (adapterName === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      const mockResult = await generateWithMockAdapter({ systemPrompt, finalPrompt, plan });
      return {
        ...mockResult,
        adapter_requested: "openai",
        adapter_fallback: "mock",
        warnings: [...(mockResult.warnings || []), "openai_api_key_absent_fell_back_to_mock"],
      };
    }
    return generateWithOpenAIAdapter({ systemPrompt, finalPrompt, plan });
  }

  return generateWithMockAdapter({ systemPrompt, finalPrompt, plan });
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function renderRunSummary({ request, adapterResult, evaluation, artifactPaths }) {
  return `# Generation Sandbox Run

Generated: ${new Date().toISOString()}

## Request

- Expert: \`${request.expert_id}\`
- Intent: \`${request.generation_intent}\`
- User request: ${request.user_request}
- Platform: \`${request.output_constraints?.platform || "generic"}\`
- Format: \`${request.output_constraints?.format || "post"}\`
- Adapter: \`${adapterResult.provider}\`

## Artifacts

- Request: \`${artifactPaths.request}\`
- Context pack: \`${artifactPaths.contextPack}\`
- Orchestration plan: \`${artifactPaths.orchestrationPlan}\`
- Final prompt: \`${artifactPaths.finalPrompt}\`
- Generated output: \`${artifactPaths.generatedOutput}\`
- Evaluation: \`${artifactPaths.evaluation}\`

## Evaluation Summary

- Overall score: ${evaluation.overall_score}
- Style match: ${evaluation.style_match_score}
- Structure quality: ${evaluation.structure_quality_score}
- Educational clarity: ${evaluation.educational_clarity_score}
- Emotional warmth: ${evaluation.emotional_warmth_score}
- Hallucination risk: ${evaluation.hallucination_risk}
- CTA quality: ${evaluation.cta_quality}
- Context utilization: ${evaluation.context_utilization_quality_score}
- Warnings: ${evaluation.warnings.length ? evaluation.warnings.join(", ") : "none"}

## Local-Only Boundary

This run did not deploy, mutate production indexes, mutate FAISS/vector files, run ingest, run promote, or change live Telegram behavior.
`;
}

async function storeGenerationArtifacts({
  root = ROOT,
  expertId = DEFAULT_EXPERT,
  runName,
  request,
  contextPack,
  orchestrationPlan,
  promptAssembly,
  adapterResult,
  evaluation,
}) {
  const runId = `${stamp()}_${slugify(runName || request.generation_intent)}`;
  const runDir = path.join(root, "expert_profiles", expertId, "reports", "generation_runs", runId);
  await fs.mkdir(runDir, { recursive: true });

  const artifactPaths = {
    request: path.join(runDir, "request.json"),
    contextPack: path.join(runDir, "context_pack.json"),
    orchestrationPlan: path.join(runDir, "orchestration_plan.json"),
    finalPrompt: path.join(runDir, "final_prompt.txt"),
    generatedOutput: path.join(runDir, "generated_output.md"),
    evaluation: path.join(runDir, "evaluation.json"),
    runSummary: path.join(runDir, "run_summary.md"),
  };

  await fs.writeFile(artifactPaths.request, safeJson(request), "utf8");
  await fs.writeFile(artifactPaths.contextPack, safeJson(contextPack), "utf8");
  await fs.writeFile(artifactPaths.orchestrationPlan, safeJson(orchestrationPlan), "utf8");
  await fs.writeFile(artifactPaths.finalPrompt, [
    "## SYSTEM PROMPT",
    promptAssembly.system_prompt,
    "",
    "## FINAL USER PROMPT",
    promptAssembly.final_prompt,
  ].join("\n"), "utf8");
  await fs.writeFile(artifactPaths.generatedOutput, adapterResult.output || "", "utf8");
  await fs.writeFile(artifactPaths.evaluation, safeJson(evaluation), "utf8");

  const relativePaths = Object.fromEntries(
    Object.entries(artifactPaths).map(([key, value]) => [key, path.relative(root, value).replace(/\\/g, "/")]),
  );
  await fs.writeFile(artifactPaths.runSummary, renderRunSummary({
    request,
    adapterResult,
    evaluation,
    artifactPaths: relativePaths,
  }), "utf8");

  return {
    run_id: runId,
    run_dir: runDir,
    artifact_paths: artifactPaths,
    relative_artifact_paths: relativePaths,
  };
}

async function runGenerationSandbox(input = {}) {
  const root = input.root || ROOT;
  const expertId = input.expert_id || DEFAULT_EXPERT;
  const generationIntent = input.generation_intent || "educational_post";
  const outputConstraints = input.output_constraints || {};
  const adapterName = input.adapter || process.env.GENERATION_SANDBOX_ADAPTER || "mock";

  const retrieval = input.candidates
    ? { sidecars: [], candidates: input.candidates }
    : await createLocalRetrievalCandidates({
      root,
      expertId,
      knowledgeDir: input.knowledge_dir || path.join(root, "knowledge_intake", "sexologist"),
      excerptChars: input.excerpt_chars || DEFAULT_EXCERPT_CHARS,
    });

  const reranked = rerankRetrievalItems(retrieval.candidates, { generation_intent: generationIntent });
  const contextPack = assembleContextPack({
    expert_id: expertId,
    generation_intent: generationIntent,
    max_context_items: input.max_context_items || DEFAULT_MAX_CONTEXT_ITEMS,
    max_total_chars: input.max_total_chars || DEFAULT_MAX_TOTAL_CHARS,
    candidates: reranked,
  });

  const request = {
    expert_id: expertId,
    generation_intent: generationIntent,
    user_request: input.user_request || "",
    output_constraints: outputConstraints,
    adapter: adapterName,
    local_only: true,
  };

  const orchestrationPlan = createGenerationPlan({
    expert_id: expertId,
    generation_intent: generationIntent,
    user_request: request.user_request,
    context_pack: contextPack,
    output_constraints: outputConstraints,
  });
  const promptAssembly = assembleFinalPrompt({ plan: orchestrationPlan, contextPack });
  const adapterResult = await runAdapter({
    adapterName,
    systemPrompt: promptAssembly.system_prompt,
    finalPrompt: promptAssembly.final_prompt,
    plan: orchestrationPlan,
  });
  const evaluation = evaluateGeneratedOutput({
    output: adapterResult.output,
    plan: orchestrationPlan,
    contextPack,
  });
  const storage = await storeGenerationArtifacts({
    root,
    expertId,
    runName: input.run_name || generationIntent,
    request,
    contextPack,
    orchestrationPlan,
    promptAssembly,
    adapterResult,
    evaluation,
  });

  return {
    request,
    retrieval_summary: {
      metadata_sidecars_loaded: retrieval.sidecars.length,
      candidates_count: retrieval.candidates.length,
      reranked_count: reranked.length,
    },
    context_pack: contextPack,
    orchestration_plan: orchestrationPlan,
    prompt_assembly: promptAssembly,
    adapter_result: adapterResult,
    generated_output: adapterResult.output,
    evaluation,
    storage,
  };
}

function compareGenerationRuns(runs = []) {
  const summaries = runs.map((run) => ({
    run_id: run.storage?.run_id,
    intent: run.request?.generation_intent,
    platform: run.request?.output_constraints?.platform,
    format: run.request?.output_constraints?.format,
    adapter: run.adapter_result?.provider,
    overall_score: run.evaluation?.overall_score || 0,
    hallucination_risk: run.evaluation?.hallucination_risk,
    cta_quality: run.evaluation?.cta_quality,
    warnings: run.evaluation?.warnings || [],
    output_path: run.storage?.relative_artifact_paths?.generatedOutput,
  }));

  const sorted = [...summaries].sort((a, b) => b.overall_score - a.overall_score);
  return {
    run_count: summaries.length,
    best_run: sorted[0] || null,
    lowest_scoring_run: sorted[sorted.length - 1] || null,
    average_overall_score: summaries.length
      ? Number((summaries.reduce((sum, item) => sum + item.overall_score, 0) / summaries.length).toFixed(2))
      : 0,
    high_risk_runs: summaries.filter((item) => item.hallucination_risk === "high"),
    warning_counts: summaries.reduce((acc, item) => {
      for (const warning of item.warnings) acc[warning] = (acc[warning] || 0) + 1;
      return acc;
    }, {}),
    runs: summaries,
  };
}

export {
  assembleFinalPrompt,
  compareGenerationRuns,
  createLocalRetrievalCandidates,
  loadMetadataSidecars,
  runGenerationSandbox,
  storeGenerationArtifacts,
};
