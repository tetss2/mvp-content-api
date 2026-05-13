import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const DEFAULT_EXPERT = "dinara";
const SUCCESS_THRESHOLD = 0.8;
const WEAK_THRESHOLD = 0.72;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback = null) {
  if (!await exists(file)) return fallback;
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readText(file, fallback = "") {
  if (!await exists(file)) return fallback;
  return fs.readFile(file, "utf8");
}

function feedbackMemoryDir(root = ROOT, expertId = DEFAULT_EXPERT) {
  return path.join(root, "expert_profiles", expertId, "feedback_memory");
}

function generationRunsDir(root = ROOT, expertId = DEFAULT_EXPERT) {
  return path.join(root, "expert_profiles", expertId, "reports", "generation_runs");
}

function feedbackReportsDir(root = ROOT, expertId = DEFAULT_EXPERT) {
  return path.join(root, "expert_profiles", expertId, "reports", "feedback_memory");
}

async function listGenerationRunDirs({ root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const dir = generationRunsDir(root, expertId);
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function loadGenerationRun(runDir, root = ROOT) {
  const request = await readJson(path.join(runDir, "request.json"), {});
  const contextPack = await readJson(path.join(runDir, "context_pack.json"), {});
  const orchestrationPlan = await readJson(path.join(runDir, "orchestration_plan.json"), {});
  const evaluation = await readJson(path.join(runDir, "evaluation.json"), {});
  const output = await readText(path.join(runDir, "generated_output.md"), "");

  return {
    run_id: path.basename(runDir),
    run_dir: runDir,
    relative_run_dir: path.relative(root, runDir).replace(/\\/g, "/"),
    request,
    context_pack: contextPack,
    orchestration_plan: orchestrationPlan,
    evaluation,
    output,
  };
}

async function loadGenerationRuns(options = {}) {
  const root = options.root || ROOT;
  const runDirs = await listGenerationRunDirs(options);
  const runs = [];
  for (const runDir of runDirs) {
    runs.push(await loadGenerationRun(runDir, root));
  }
  return runs;
}

function structurePattern(run) {
  return asArray(run.orchestration_plan?.generation_strategy?.recommended_structure).join(" -> ")
    || run.request?.generation_intent
    || "unknown_structure";
}

function contextSignature(run) {
  const selected = asArray(run.context_pack?.selected_items);
  const kinds = [...new Set(selected.map((item) => item.content_kind || "unknown"))];
  const sources = [...new Set(selected.map((item) => item.source_type || "unknown"))];
  return {
    content_kinds: kinds,
    source_types: sources,
    signature: `kinds:${kinds.join("+") || "none"}|sources:${sources.join("+") || "none"}`,
  };
}

function classifyRun(run) {
  const score = Number(run.evaluation?.overall_score || 0);
  const warnings = asArray(run.evaluation?.warnings);
  if (score >= SUCCESS_THRESHOLD && run.evaluation?.hallucination_risk !== "high" && warnings.length === 0) return "successful";
  if (score <= WEAK_THRESHOLD || warnings.length > 0 || run.evaluation?.hallucination_risk !== "low") return "weak";
  return "neutral";
}

function phraseCandidates(text) {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const phrases = [];
  for (let i = 0; i < cleaned.length - 2; i += 1) {
    phrases.push(`${cleaned[i]} ${cleaned[i + 1]} ${cleaned[i + 2]}`);
  }
  return phrases;
}

function detectStyleDrift(run) {
  const output = run.output || "";
  const evaluation = run.evaluation || {};
  const warnings = [];
  const lower = output.toLowerCase();
  const genericSignals = [
    "важно отметить",
    "в современном мире",
    "данная тема",
    "следует понимать",
    "подводя итог",
  ];
  const numberedLines = output.split(/\r?\n/).filter((line) => /^\s*\d+\./.test(line)).length;
  const paragraphs = output.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

  if (Number(evaluation.expert_tone_match_score || 0) < 0.65) warnings.push("expert_tone_match_low");
  if (Number(evaluation.emotional_warmth_score || 0) < 0.6) warnings.push("low_emotional_warmth");
  if (genericSignals.some((signal) => lower.includes(signal))) warnings.push("generic_ai_wording_detected");
  if (Number(evaluation.redundancy_score || 1) < 0.75) warnings.push("repetitive_phrasing_detected");
  if (numberedLines >= 5 && run.request?.output_constraints?.format !== "hook_list") warnings.push("over_structured_robotic_output");
  if (paragraphs.length >= 4) {
    const starts = paragraphs.map((part) => part.split(/\s+/).slice(0, 2).join(" ").toLowerCase());
    if (new Set(starts).size <= Math.ceil(starts.length / 2)) warnings.push("repetitive_paragraph_openings");
  }

  return warnings;
}

function makeSignal(run) {
  const signature = contextSignature(run);
  const driftWarnings = detectStyleDrift(run);
  return {
    run_id: run.run_id,
    run_dir: run.relative_run_dir,
    expert_id: run.request?.expert_id || DEFAULT_EXPERT,
    generation_intent: run.request?.generation_intent || run.orchestration_plan?.generation_intent || "unknown",
    platform: run.request?.output_constraints?.platform || "generic",
    format: run.request?.output_constraints?.format || "post",
    tone: run.request?.output_constraints?.tone || "expert_warm",
    cta_style: run.request?.output_constraints?.cta_style || "soft",
    classification: classifyRun(run),
    structure_pattern: structurePattern(run),
    context_signature: signature.signature,
    content_kinds: signature.content_kinds,
    source_types: signature.source_types,
    selected_context_count: asArray(run.context_pack?.selected_items).length,
    suppressed_context_count: asArray(run.context_pack?.suppressed_items).length,
    evaluation: run.evaluation,
    warnings: asArray(run.evaluation?.warnings),
    style_drift_warnings: driftWarnings,
    phrases: phraseCandidates(run.output).slice(0, 120),
    orchestration_steps: asArray(run.orchestration_plan?.orchestration_trace).map((entry) => entry.step),
    assembly_actions: asArray(run.context_pack?.assembly_trace).map((entry) => entry.action),
  };
}

function trendFor(scores) {
  if (scores.length < 3) return "stable";
  const recent = scores.slice(-3).reduce((sum, value) => sum + value, 0) / Math.min(3, scores.length);
  const prior = scores.slice(0, -3);
  if (!prior.length) return "stable";
  const priorAvg = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  if (recent - priorAvg >= 0.04) return "positive";
  if (priorAvg - recent >= 0.04) return "negative";
  return "stable";
}

function aggregatePatterns(signals, keyFn) {
  const buckets = new Map();
  for (const signal of signals) {
    const pattern = keyFn(signal);
    if (!pattern) continue;
    if (!buckets.has(pattern)) {
      buckets.set(pattern, {
        pattern,
        usage_count: 0,
        scores: [],
        intents: {},
        warnings: {},
        examples: [],
      });
    }
    const bucket = buckets.get(pattern);
    bucket.usage_count += 1;
    bucket.scores.push(Number(signal.evaluation?.overall_score || 0));
    bucket.intents[signal.generation_intent] = (bucket.intents[signal.generation_intent] || 0) + 1;
    for (const warning of [...signal.warnings, ...signal.style_drift_warnings]) {
      bucket.warnings[warning] = (bucket.warnings[warning] || 0) + 1;
    }
    bucket.examples.push(signal.run_id);
  }

  return [...buckets.values()].map((bucket) => ({
    pattern: bucket.pattern,
    usage_count: bucket.usage_count,
    average_score: round(bucket.scores.reduce((sum, value) => sum + value, 0) / bucket.scores.length),
    recent_trend: trendFor(bucket.scores),
    intents: bucket.intents,
    warnings: bucket.warnings,
    example_run_ids: bucket.examples.slice(-5),
  })).sort((a, b) => b.average_score - a.average_score || b.usage_count - a.usage_count);
}

function aggregateRetrievalFeedback(signals) {
  const byKind = aggregatePatterns(signals, (signal) => `content_kind:${signal.content_kinds.join("+") || "none"}`);
  const bySource = aggregatePatterns(signals, (signal) => `source_type:${signal.source_types.join("+") || "none"}`);
  const byContextSignature = aggregatePatterns(signals, (signal) => signal.context_signature);
  return {
    content_kind_performance: byKind,
    source_type_performance: bySource,
    context_signature_performance: byContextSignature,
    insights: buildRetrievalInsights(byKind, bySource, byContextSignature),
  };
}

function buildRetrievalInsights(byKind, bySource, byContextSignature) {
  const insights = [];
  const bestKind = byKind[0];
  const weakKind = [...byKind].reverse().find((item) => item.average_score < WEAK_THRESHOLD || Object.keys(item.warnings).length > 0);
  const bestSource = bySource[0];
  const bestContext = byContextSignature[0];
  if (bestKind) insights.push(`Best content-kind mix so far: ${bestKind.pattern} average=${bestKind.average_score}.`);
  if (bestSource) insights.push(`Best source-type mix so far: ${bestSource.pattern} average=${bestSource.average_score}.`);
  if (bestContext) insights.push(`Best full context signature so far: ${bestContext.pattern} average=${bestContext.average_score}.`);
  if (weakKind) insights.push(`Watch weaker content-kind mix: ${weakKind.pattern} average=${weakKind.average_score}.`);
  return insights;
}

function aggregateCtaFeedback(signals) {
  const byCta = aggregatePatterns(signals, (signal) => `cta:${signal.cta_style}|quality:${signal.evaluation?.cta_quality || "unknown"}`);
  return {
    cta_patterns: byCta,
    weak_cta_runs: signals
      .filter((signal) => signal.evaluation?.cta_quality !== "good" || signal.warnings.includes("missing_cta"))
      .map((signal) => ({
        run_id: signal.run_id,
        intent: signal.generation_intent,
        cta_style: signal.cta_style,
        cta_quality: signal.evaluation?.cta_quality,
        warnings: signal.warnings,
      })),
  };
}

function aggregateStyleFeedback(signals) {
  const phraseCounts = {};
  for (const signal of signals) {
    for (const phrase of signal.phrases) phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
  }
  const overused = Object.entries(phraseCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase, count]) => ({ phrase, count }));
  return {
    style_patterns: aggregatePatterns(signals, (signal) => `tone:${signal.tone}|format:${signal.format}`),
    style_drift_warnings: signals
      .filter((signal) => signal.style_drift_warnings.length)
      .map((signal) => ({
        run_id: signal.run_id,
        intent: signal.generation_intent,
        warnings: signal.style_drift_warnings,
        warmth: signal.evaluation?.emotional_warmth_score,
        tone_match: signal.evaluation?.expert_tone_match_score,
      })),
    overused_phrases: overused,
  };
}

function buildAdaptiveRecommendations(memory) {
  const recommendations = [];
  const best = memory.successful_patterns.patterns[0];
  const weak = memory.weak_patterns.patterns[0];
  const ctaWeak = memory.cta_feedback.weak_cta_runs[0];
  const styleDrift = memory.style_feedback.style_drift_warnings[0];
  const retrievalInsight = memory.retrieval_feedback.insights[0];

  if (best) {
    recommendations.push({
      type: "generation_structure",
      priority: "medium",
      recommendation: `Prefer structure pattern "${best.pattern}" for similar intents while it keeps average score ${best.average_score}.`,
    });
  }
  if (weak) {
    recommendations.push({
      type: "weak_pattern_suppression",
      priority: "high",
      recommendation: `Review or suppress weak structure pattern "${weak.pattern}" before reusing it automatically.`,
    });
  }
  if (ctaWeak) {
    recommendations.push({
      type: "cta_strategy",
      priority: "high",
      recommendation: `Strengthen CTA handling for ${ctaWeak.intent}; detected ${ctaWeak.cta_quality || "weak"} CTA with warnings ${ctaWeak.warnings.join(", ") || "none"}.`,
    });
  }
  if (styleDrift) {
    recommendations.push({
      type: "style_drift",
      priority: "medium",
      recommendation: `Add review attention to ${styleDrift.intent}; style drift warnings: ${styleDrift.warnings.join(", ")}.`,
    });
  }
  if (retrievalInsight) {
    recommendations.push({
      type: "retrieval_context",
      priority: "medium",
      recommendation: retrievalInsight,
    });
  }

  recommendations.push({
    type: "safety_boundary",
    priority: "high",
    recommendation: "Keep this recommendation-only; do not auto-rewrite prompts, mutate retrieval scoring, fine-tune, or wire into Telegram.",
  });

  return recommendations;
}

function buildFeedbackMemory(runs = []) {
  const signals = runs.map(makeSignal);
  const successfulSignals = signals.filter((signal) => signal.classification === "successful");
  const weakSignals = signals.filter((signal) => signal.classification === "weak");

  const memory = {
    generated_at: new Date().toISOString(),
    run_count: signals.length,
    thresholds: {
      success: SUCCESS_THRESHOLD,
      weak: WEAK_THRESHOLD,
    },
    successful_patterns: {
      run_count: successfulSignals.length,
      patterns: aggregatePatterns(successfulSignals, (signal) => signal.structure_pattern),
      runs: successfulSignals.map((signal) => signal.run_id),
    },
    weak_patterns: {
      run_count: weakSignals.length,
      patterns: aggregatePatterns(weakSignals, (signal) => signal.structure_pattern),
      runs: weakSignals.map((signal) => ({
        run_id: signal.run_id,
        intent: signal.generation_intent,
        score: signal.evaluation?.overall_score,
        warnings: [...signal.warnings, ...signal.style_drift_warnings],
      })),
    },
    retrieval_feedback: aggregateRetrievalFeedback(signals),
    style_feedback: aggregateStyleFeedback(signals),
    cta_feedback: aggregateCtaFeedback(signals),
    generation_feedback_log: signals,
  };

  memory.recommendations = buildAdaptiveRecommendations(memory);
  return memory;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeFeedbackMemory(memory, { root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const dir = feedbackMemoryDir(root, expertId);
  await fs.mkdir(dir, { recursive: true });

  const files = {
    successful_patterns: path.join(dir, "successful_patterns.json"),
    weak_patterns: path.join(dir, "weak_patterns.json"),
    retrieval_feedback: path.join(dir, "retrieval_feedback.json"),
    style_feedback: path.join(dir, "style_feedback.json"),
    cta_feedback: path.join(dir, "cta_feedback.json"),
    generation_feedback_log: path.join(dir, "generation_feedback_log.jsonl"),
  };

  await writeJson(files.successful_patterns, memory.successful_patterns);
  await writeJson(files.weak_patterns, memory.weak_patterns);
  await writeJson(files.retrieval_feedback, memory.retrieval_feedback);
  await writeJson(files.style_feedback, memory.style_feedback);
  await writeJson(files.cta_feedback, memory.cta_feedback);
  await fs.writeFile(
    files.generation_feedback_log,
    memory.generation_feedback_log.map((signal) => JSON.stringify(signal)).join("\n") + "\n",
    "utf8",
  );

  return files;
}

async function readFeedbackMemory({ root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const dir = feedbackMemoryDir(root, expertId);
  const successfulPatterns = await readJson(path.join(dir, "successful_patterns.json"), { run_count: 0, patterns: [], runs: [] });
  const weakPatterns = await readJson(path.join(dir, "weak_patterns.json"), { run_count: 0, patterns: [], runs: [] });
  const retrievalFeedback = await readJson(path.join(dir, "retrieval_feedback.json"), { insights: [] });
  const styleFeedback = await readJson(path.join(dir, "style_feedback.json"), { style_drift_warnings: [], overused_phrases: [] });
  const ctaFeedback = await readJson(path.join(dir, "cta_feedback.json"), { weak_cta_runs: [] });
  const logPath = path.join(dir, "generation_feedback_log.jsonl");
  const logRaw = await readText(logPath, "");
  const generationFeedbackLog = logRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const memory = {
    successful_patterns: successfulPatterns,
    weak_patterns: weakPatterns,
    retrieval_feedback: retrievalFeedback,
    style_feedback: styleFeedback,
    cta_feedback: ctaFeedback,
    generation_feedback_log: generationFeedbackLog,
  };
  memory.run_count = generationFeedbackLog.length;
  memory.recommendations = buildAdaptiveRecommendations(memory);
  return memory;
}

export {
  buildAdaptiveRecommendations,
  buildFeedbackMemory,
  detectStyleDrift,
  feedbackMemoryDir,
  feedbackReportsDir,
  generationRunsDir,
  loadGenerationRuns,
  readFeedbackMemory,
  writeFeedbackMemory,
};
