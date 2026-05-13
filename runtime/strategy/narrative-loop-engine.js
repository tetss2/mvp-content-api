import { round } from "../stabilization/utils.js";

const NARRATIVE_LOOP_SCHEMA_VERSION = "2026-05-13.narrative_loop_engine.v1";

const LOOP_ORDER = ["recognition", "normalization", "expert_reframe", "practical_anchor", "soft_invitation"];

function nextLoopStage(current = "recognition", signals = {}) {
  if (signals.audience_fatigue_risk === "high") return "normalization";
  const index = LOOP_ORDER.indexOf(current);
  return LOOP_ORDER[(index + 1 + LOOP_ORDER.length) % LOOP_ORDER.length];
}

function analyzeNarrativeLoop({ state = {}, campaignMemory = {}, conversion = {} } = {}) {
  const previous = state.current_state || {};
  const current = previous.narrative_loop_stage || "recognition";
  const signals = campaignMemory.adapter_signals || {};
  const next = conversion.overselling_risk > 0.45 ? "normalization" : nextLoopStage(current, signals);
  const loopCoherence = signals.narrative_arc_status === "coherent" ? 0.82 : signals.narrative_arc_status === "watch" ? 0.68 : 0.56;

  return {
    schema_version: NARRATIVE_LOOP_SCHEMA_VERSION,
    current_narrative_loop: current,
    next_narrative_loop: next,
    narrative_loop_coherence: round(loopCoherence),
    strategic_next_move: conversion.next_soft_conversion_opportunity === "soft_consultation_bridge" && next === "soft_invitation"
      ? "soft_conversion_bridge"
      : `${next}_move`,
    recommendation: next === "soft_invitation"
      ? "Offer a gentle next step only without urgency."
      : "Continue the trust-building narrative loop.",
    warnings: [
      loopCoherence < 0.62 ? "narrative_loop_fragmented" : null,
    ].filter(Boolean),
  };
}

function narrativeLoopEvent({ runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    current: analysis.current_narrative_loop,
    next: analysis.next_narrative_loop,
    strategic_next_move: analysis.strategic_next_move,
  };
}

export {
  NARRATIVE_LOOP_SCHEMA_VERSION,
  analyzeNarrativeLoop,
  narrativeLoopEvent,
};
