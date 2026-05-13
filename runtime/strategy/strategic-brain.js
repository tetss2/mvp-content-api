import { fileURLToPath } from "url";
import path from "path";
import { clamp, round, unique } from "../stabilization/utils.js";
import { analyzeTrustBuilding, trustEvent } from "./trust-building-engine.js";
import { analyzeAuthorityPacing, authorityEvent } from "./authority-pacing.js";
import { analyzeEmotionalFunnel, emotionalEvent } from "./emotional-funnel-engine.js";
import { analyzeConversionPressure, conversionEvent } from "./conversion-pressure-detector.js";
import { analyzeAudienceState } from "./audience-state-engine.js";
import { analyzePositioning, positioningEvent } from "./positioning-manager.js";
import { analyzeNarrativeLoop, narrativeLoopEvent } from "./narrative-loop-engine.js";
import { loadStrategicState, saveStrategicState, updateStrategicState } from "./strategic-memory-store.js";

const STRATEGIC_BRAIN_SCHEMA_VERSION = "2026-05-13.strategic_brain.v1";

function aggregateScores({ trust, authority, emotional, conversion, audience, positioning }) {
  const oversellingProtection = 1 - Number(conversion.overselling_risk || 0);
  const intimacyProtection = 1 - Number(emotional.intimacy_overload || 0);
  const score = clamp(
    authority.authority_balance * 0.15
    + trust.trust_pacing_score * 0.16
    + emotional.emotional_pacing_score * 0.14
    + oversellingProtection * 0.14
    + intimacyProtection * 0.1
    + positioning.positioning_consistency * 0.12
    + audience.audience_warming_quality * 0.1
    + trust.trust_retention_probability * 0.09,
  );
  return {
    authority_balance: authority.authority_balance,
    trust_pacing: trust.trust_pacing_score,
    emotional_pacing: emotional.emotional_pacing_score,
    conversion_pressure: conversion.conversion_pressure,
    overselling_risk: conversion.overselling_risk,
    intimacy_overload: emotional.intimacy_overload,
    expert_positioning_consistency: positioning.positioning_consistency,
    audience_warming_quality: audience.audience_warming_quality,
    trust_retention_probability: trust.trust_retention_probability,
    strategic_brain_score: round(score),
  };
}

function buildNextState({ previous = {}, trust, authority, emotional, conversion, audience, positioning, narrative }) {
  return {
    authority_level: authority.authority_level,
    trust_level: trust.trust_level,
    emotional_warmth: emotional.emotional_warmth,
    conversion_pressure: conversion.conversion_pressure,
    audience_resistance: audience.audience_resistance,
    audience_trust_fatigue: audience.audience_trust_fatigue,
    narrative_loop_stage: narrative.next_narrative_loop,
    positioning_consistency: positioning.positioning_consistency,
    perceived_expertise_level: authority.perceived_expertise_level,
    intimacy_pacing: emotional.intimacy_pacing,
    trust_retention_probability: trust.trust_retention_probability,
  };
}

async function runStrategicBrain({
  expertId = "dinara",
  root = process.cwd(),
  runtimeResult = {},
  request = {},
  identityRuntime = {},
  campaignMemory = {},
  persist = true,
  initializeStorage = true,
} = {}) {
  const runtimeState = runtimeResult.runtime_state || runtimeResult.runtime?.runtime_state || {};
  const loaded = await loadStrategicState(expertId, { root, initialize: initializeStorage });
  const state = loaded.state;

  const trust = analyzeTrustBuilding({ state, runtimeState, campaignMemory, identityRuntime });
  const authority = analyzeAuthorityPacing({ state, runtimeState, trust, identityRuntime });
  const emotional = analyzeEmotionalFunnel({ state, runtimeState, campaignMemory });
  const conversion = analyzeConversionPressure({ state, runtimeState, campaignMemory, trust });
  const audience = analyzeAudienceState({ state, runtimeState, trust, emotional, conversion, campaignMemory });
  const positioning = analyzePositioning({ state, runtimeState, authority, identityRuntime });
  const narrative = analyzeNarrativeLoop({ state, campaignMemory, conversion });
  const scores = aggregateScores({ trust, authority, emotional, conversion, audience, positioning });
  const nextState = buildNextState({ previous: state.current_state, trust, authority, emotional, conversion, audience, positioning, narrative });

  const warnings = unique([
    ...trust.warnings,
    ...authority.warnings,
    ...emotional.warnings,
    ...conversion.warnings,
    ...audience.warnings,
    ...positioning.warnings,
    ...narrative.warnings,
  ]);

  const event = {
    summary: {
      at: new Date().toISOString(),
      run_id: runtimeState.run_id,
      topic: request.topic || request.userRequest || runtimeState.generation_intent?.topic,
      strategic_brain_score: scores.strategic_brain_score,
      trust_level: trust.trust_level,
      authority_level: authority.authority_level,
      conversion_pressure: conversion.conversion_pressure,
      overselling_risk: conversion.overselling_risk,
      strategic_next_move: narrative.strategic_next_move,
    },
    trust: trustEvent({ runtimeState, analysis: trust }),
    authority: authorityEvent({ runtimeState, analysis: authority }),
    emotional: emotionalEvent({ runtimeState, analysis: emotional }),
    conversion: conversionEvent({ runtimeState, analysis: conversion }),
    positioning: positioningEvent({ runtimeState, analysis: positioning }),
    narrative: narrativeLoopEvent({ runtimeState, analysis: narrative }),
  };

  let updatedState = state;
  if (persist) {
    updatedState = updateStrategicState(state, event, nextState, scores);
    await saveStrategicState(expertId, updatedState, { root });
  }

  return {
    schema_version: STRATEGIC_BRAIN_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    run_id: runtimeState.run_id || null,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    activation_scope: "admin_runtime_preview_only",
    production_activation_allowed: false,
    production_generation_replaced: false,
    telegram_runtime_mutation: false,
    external_api_calls: false,
    faiss_or_index_mutation: false,
    ingest_or_promote: false,
    strategic_brain_enabled: true,
    trust_engine_enabled: true,
    authority_pacing_enabled: true,
    emotional_funnel_enabled: true,
    positioning_engine_enabled: true,
    oversale_protection_enabled: true,
    strategic_state_loaded_from_disk: loaded.loaded_from_disk,
    strategic_state_persisted_after_run: persist,
    strategic_state_path: path.relative(root, loaded.path).replace(/\\/g, "/"),
    strategic_state_run_count: updatedState.run_count || state.run_count || 0,
    strategic_state_summary: nextState,
    trust_building: trust,
    authority_pacing: authority,
    emotional_funnel: emotional,
    conversion_pressure: conversion,
    audience_state: audience,
    positioning,
    narrative_loop: narrative,
    strategic_scores: scores,
    adapter_signals: {
      strategic_brain_score: scores.strategic_brain_score,
      trust_level: trust.trust_level,
      authority_level: authority.authority_level,
      emotional_warmth_level: emotional.emotional_warmth,
      audience_fatigue: audience.audience_trust_fatigue,
      conversion_pressure: conversion.conversion_pressure,
      intimacy_pacing: emotional.intimacy_pacing,
      overselling_risk: conversion.overselling_risk,
      current_narrative_loop: narrative.current_narrative_loop,
      strategic_next_move: narrative.strategic_next_move,
      authority_pacing_recommendation: authority.recommendation,
      conversion_pressure_warning: conversion.warning_level,
      next_soft_conversion_opportunity: conversion.next_soft_conversion_opportunity,
      overselling_prevention_signal: conversion.recommendation,
      positioning_reinforcement_suggestion: positioning.reinforcement_suggestion,
      audience_emotional_state: audience.audience_emotional_state,
      trust_retention_probability: trust.trust_retention_probability,
    },
    warnings,
    status: warnings.length ? "pass_with_warnings" : "pass",
  };
}

async function runCli() {
  const result = await runStrategicBrain({
    persist: false,
    runtimeResult: {
      runtime_state: {
        run_id: "strategic_brain_smoke_test",
        generation_intent: { topic: "relationship anxiety", intent: "educational_post" },
        audience_state: { stage: "warming" },
        cta_pacing: { selected_cta_type: "low_pressure_cta" },
        decision_engine: {
          cta_strength: "low",
          authority_framing: "low_pressure_expertise",
          emotional_depth: "moderate",
        },
      },
    },
  });
  console.log(JSON.stringify(result.adapter_signals, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  STRATEGIC_BRAIN_SCHEMA_VERSION,
  aggregateScores,
  runStrategicBrain,
};
