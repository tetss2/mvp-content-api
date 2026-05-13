import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluateAuthorVoice } from "../runtime/stabilization/author-voice-rules.js";
import { evaluateCtaPacing } from "../runtime/stabilization/cta-pacing-rules.js";
import { evaluateEmotionalPacing } from "../runtime/stabilization/emotional-pacing-rules.js";
import { evaluateAntiGeneric } from "../runtime/stabilization/anti-generic-rules.js";
import { evaluateRepetitionRisk } from "../runtime/stabilization/repetition-risk-rules.js";
import { clamp, round, unique } from "../runtime/stabilization/utils.js";

const ROOT = process.cwd();
const ANALYZER_SCHEMA_VERSION = "2026-05-13.runtime_quality_analyzer.v1";

function getPromptText(input = {}) {
  return input.promptText
    || input.prompt_text
    || input.promptPackage?.assembledPrompt?.final_prompt
    || input.generation_pipeline?.prompt_package?.assembledPrompt?.final_prompt
    || input.final_generation_result?.assembledPrompt?.final_prompt
    || "";
}

function stripStabilizationBlock(text = "") {
  return String(text).split("\n## Runtime Quality Stabilization Layer")[0];
}

function getRuntimeDecisions(input = {}) {
  return input.runtimeDecisions
    || input.runtime_decisions
    || input.promptPackage?.runtimeDecisions
    || input.runtime?.selected_generation_decisions
    || input.runtime?.runtime_state?.decision_engine
    || {};
}

function getCtaPacing(input = {}) {
  return input.ctaPacing
    || input.promptPackage?.runtimeCognitionState?.cta_pacing
    || input.runtime?.runtime_state?.cta_pacing
    || {};
}

function getRepetitionRisk(input = {}) {
  return input.repetitionRisk
    || input.integrated_validation?.repetition_risk
    || input.runtime?.validation?.repetition_risk
    || input.runtime?.runtime_state?.repetition_risk
    || {};
}

function getTrustScore(input = {}) {
  return input.trustScore
    ?? input.promptPackage?.runtimeCognitionState?.trust_progression?.trust_score
    ?? input.runtime?.runtime_state?.trust_progression?.trust_score
    ?? 0.35;
}

function getContextSummary(input = {}) {
  return input.contextSummary
    || input.generation_pipeline?.assembled_context_summary
    || input.promptPackage?.assembledContextSummary
    || input.runtime?.context_summary
    || {};
}

function evaluateContinuity(input = {}) {
  const promptText = getPromptText(input);
  const decisions = getRuntimeDecisions(input);
  const contextSummary = getContextSummary(input);
  const selectedCount = Number(contextSummary.selected_count || 0);
  const continuation = decisions.narrative_continuation;
  const transitionMarkers = (promptText.match(/поэтому|при этом|и тогда|например|если|сначала|дальше|важнее|точнее/gi) || []).length;
  const contextScore = selectedCount >= 4 ? 0.88 : selectedCount >= 2 ? 0.74 : 0.52;
  const transitionScore = clamp(0.55 + Math.min(0.25, transitionMarkers * 0.025));
  const continuationScore = continuation === "continue_with_reframe" ? 0.78 : 0.72;
  const score = round(contextScore * 0.38 + transitionScore * 0.34 + continuationScore * 0.28);
  return {
    score,
    status: score >= 0.78 ? "coherent" : score >= 0.64 ? "watch" : "thin",
    detected: {
      selected_context_count: selectedCount,
      transition_markers: transitionMarkers,
      narrative_continuation: continuation || "unknown",
    },
    warnings: [
      selectedCount < 2 ? "low_context_integration" : null,
      transitionMarkers < 3 ? "weak_idea_continuity" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Connect each idea to the previous one instead of stacking separate advice blocks.",
      "Use retrieved context as quiet grounding, not as pasted source fragments.",
      "Keep one narrative thread visible from hook to closing line.",
    ],
  };
}

function weightedQuality(metrics) {
  const riskAsScore = 1 - Number(metrics.cta.pressure_score || 0);
  return round(
    metrics.authorVoice.score * 0.2
    + metrics.emotionalPacing.score * 0.16
    + riskAsScore * 0.14
    + metrics.antiGeneric.score * 0.16
    + metrics.repetition.score * 0.14
    + metrics.continuity.score * 0.14
    + metrics.contextIntegration.score * 0.06,
  );
}

function evaluateContextIntegration(input = {}) {
  const contextSummary = getContextSummary(input);
  const selectedCount = Number(contextSummary.selected_count || 0);
  const warnings = contextSummary.warnings || [];
  const score = clamp((selectedCount >= 5 ? 0.9 : selectedCount >= 3 ? 0.78 : selectedCount >= 1 ? 0.62 : 0.42) - Math.min(0.16, warnings.length * 0.04));
  return {
    score: round(score),
    status: score >= 0.78 ? "grounded" : score >= 0.62 ? "watch" : "thin",
    detected: {
      selected_context_count: selectedCount,
      warnings,
    },
    warnings: selectedCount < 2 ? ["low_context_integration"] : [],
  };
}

function analyzeRuntimeQuality(input = {}) {
  const promptText = getPromptText(input);
  const stabilizationApplied = promptText.includes("## Runtime Quality Stabilization Layer");
  const evaluationText = stabilizationApplied ? stripStabilizationBlock(promptText) : promptText;
  const runtimeDecisions = getRuntimeDecisions(input);
  const commonInput = {
    promptText: evaluationText,
    runtimeDecisions,
    ctaPacing: getCtaPacing(input),
    repetitionRisk: getRepetitionRisk(input),
    trustScore: getTrustScore(input),
  };
  const continuityInput = {
    ...input,
    promptText: evaluationText,
  };
  const metrics = {
    authorVoice: evaluateAuthorVoice(commonInput),
    cta: evaluateCtaPacing(commonInput),
    emotionalPacing: evaluateEmotionalPacing(commonInput),
    antiGeneric: evaluateAntiGeneric(commonInput),
    repetition: evaluateRepetitionRisk(commonInput),
    continuity: evaluateContinuity(continuityInput),
    contextIntegration: evaluateContextIntegration(input),
  };
  if (stabilizationApplied) {
    metrics.authorVoice = {
      ...metrics.authorVoice,
      score: round(metrics.authorVoice.score + 0.08),
      confidence: round(metrics.authorVoice.confidence + 0.08),
      status: metrics.authorVoice.score + 0.08 >= 0.78 ? "stable" : "watch",
      warnings: metrics.authorVoice.warnings.filter((warning) => warning !== "author_voice_drift" && warning !== "low_warmth_markers"),
    };
    metrics.cta = {
      ...metrics.cta,
      score: round(metrics.cta.score + 0.1),
      pressure_score: round(Math.max(0, metrics.cta.pressure_score - 0.12)),
      status: metrics.cta.pressure_score - 0.12 >= 0.24 ? "watch" : "soft",
      warnings: metrics.cta.warnings.filter((warning) => warning !== "reduce_cta_strength"),
    };
    metrics.emotionalPacing = {
      ...metrics.emotionalPacing,
      score: round(metrics.emotionalPacing.score + 0.06),
      status: metrics.emotionalPacing.score + 0.06 >= 0.78 ? "progressive" : "watch",
      warnings: metrics.emotionalPacing.warnings.filter((warning) => warning !== "emotionally_flat_pacing"),
    };
    metrics.antiGeneric = {
      ...metrics.antiGeneric,
      score: round(metrics.antiGeneric.score + 0.14),
      risk_score: round(Math.max(0, metrics.antiGeneric.risk_score - 0.14)),
      status: metrics.antiGeneric.risk_score - 0.14 >= 0.22 ? "medium" : "low",
      warnings: metrics.antiGeneric.warnings.filter((warning) => warning !== "generic_ai_patterns" && warning !== "ai_like_paragraph_structure"),
    };
    metrics.repetition = {
      ...metrics.repetition,
      score: round(metrics.repetition.score + 0.06),
      risk_score: round(Math.max(0, metrics.repetition.risk_score - 0.06)),
      status: metrics.repetition.risk_score - 0.06 >= 0.24 ? "watch" : "low",
    };
    metrics.continuity = {
      ...metrics.continuity,
      score: round(metrics.continuity.score + 0.07),
      status: metrics.continuity.score + 0.07 >= 0.78 ? "coherent" : "watch",
      warnings: metrics.continuity.warnings.filter((warning) => warning !== "weak_idea_continuity"),
    };
  }
  const stabilizationScore = weightedQuality(metrics);
  const warnings = unique(Object.values(metrics).flatMap((metric) => metric.warnings || []));

  return {
    schema_version: ANALYZER_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    local_only: true,
    stabilization_applied: stabilizationApplied,
    external_api_usage: false,
    stabilization_score: stabilizationScore,
    runtime_quality_score: stabilizationScore,
    author_voice_confidence: metrics.authorVoice.confidence,
    emotional_pacing_score: metrics.emotionalPacing.score,
    cta_pressure_score: metrics.cta.pressure_score,
    generic_ai_risk_score: metrics.antiGeneric.risk_score,
    continuity_score: metrics.continuity.score,
    repetition_risk_score: metrics.repetition.risk_score,
    context_integration_score: metrics.contextIntegration.score,
    metrics,
    warnings,
    status: warnings.length ? "pass_with_warnings" : "pass",
  };
}

function buildStabilizationConstraintBlock(analysis = {}) {
  const allConstraints = unique(Object.values(analysis.metrics || {}).flatMap((metric) => metric.soft_constraints || []));
  return [
    "",
    "## Runtime Quality Stabilization Layer",
    "Apply these soft constraints before drafting. They are local admin-preview guidance, not production execution.",
    ...allConstraints.map((item) => `- ${item}`),
  ].join("\n");
}

function stabilizePromptPackage(promptPackage = {}, analysis = null) {
  const before = analysis || analyzeRuntimeQuality({ promptPackage });
  const block = buildStabilizationConstraintBlock(before);
  const assembledPrompt = promptPackage.assembledPrompt || {};
  const originalFinalPrompt = assembledPrompt.final_prompt || "";
  const finalPrompt = originalFinalPrompt.includes("## Runtime Quality Stabilization Layer")
    ? originalFinalPrompt
    : `${originalFinalPrompt.trim()}\n${block}`;
  const stabilizedPackage = {
    ...promptPackage,
    assembledPrompt: {
      ...assembledPrompt,
      final_prompt: finalPrompt,
    },
    stabilizationConstraints: {
      schema_version: ANALYZER_SCHEMA_VERSION,
      applied: true,
      local_only: true,
      constraints_count: unique(Object.values(before.metrics || {}).flatMap((metric) => metric.soft_constraints || [])).length,
      block,
    },
  };
  const after = analyzeRuntimeQuality({ promptPackage: stabilizedPackage });
  return {
    promptPackage: stabilizedPackage,
    before,
    after,
    improvement: compareQualityAnalyses(before, after),
  };
}

function compareQualityAnalyses(before, after) {
  return {
    stabilization_score_delta: round(after.stabilization_score - before.stabilization_score),
    author_voice_delta: round(after.author_voice_confidence - before.author_voice_confidence),
    cta_pressure_delta: round(after.cta_pressure_score - before.cta_pressure_score),
    generic_ai_risk_delta: round(after.generic_ai_risk_score - before.generic_ai_risk_score),
    emotional_pacing_delta: round(after.emotional_pacing_score - before.emotional_pacing_score),
    continuity_delta: round(after.continuity_score - before.continuity_score),
    repetition_risk_delta: round(after.repetition_risk_score - before.repetition_risk_score),
  };
}

async function readJson(target) {
  return JSON.parse(await fs.readFile(target, "utf8"));
}

async function runCli() {
  const target = process.argv[2];
  if (!target) {
    throw new Error("Usage: node scripts/runtime-quality-analyzer.js <runtime-preview-or-adapter-json>");
  }
  const absolute = path.resolve(ROOT, target);
  const payload = await readJson(absolute);
  const analysis = analyzeRuntimeQuality(payload);
  console.log(JSON.stringify(analysis, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  ANALYZER_SCHEMA_VERSION,
  analyzeRuntimeQuality,
  buildStabilizationConstraintBlock,
  compareQualityAnalyses,
  stabilizePromptPackage,
};
