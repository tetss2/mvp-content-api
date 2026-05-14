import { fileURLToPath } from "url";
import path from "path";
import { clamp, round, unique } from "../stabilization/utils.js";
import { analyzeAudienceTemperature } from "./audience-temperature-engine.js";
import { analyzeAttentionLoop } from "./attention-loop-engine.js";
import { analyzeContentBalance } from "./content-balance-engine.js";
import { createEditorialCalendarSlot } from "./editorial-calendar-engine.js";
import { analyzeEditorialPacing } from "./editorial-pacing-engine.js";
import { analyzeEmotionalArc } from "./emotional-arc-planner.js";
import { analyzeFormatOrchestration } from "./format-orchestrator.js";
import { loadEditorialState, saveEditorialState, updateEditorialState } from "./editorial-memory-store.js";
import { analyzeStorytelling, storytellingEvent } from "./storytelling-engine.js";

const EDITORIAL_DIRECTOR_SCHEMA_VERSION = "2026-05-13.editorial_director.v1";

function aggregateScores({ balance, storytelling, format, audienceTemperature, attention, emotionalArc, pacing }) {
  const score = clamp(
    balance.editorial_diversity * 0.13
    + emotionalArc.emotional_pacing_quality * 0.1
    + storytelling.storytelling_continuity * 0.12
    + pacing.content_freshness * 0.11
    + attention.audience_retention_probability * 0.1
    + attention.attention_loop_stability * 0.1
    + (1 - pacing.saturation_risk) * 0.09
    + balance.educational_balance * 0.08
    + balance.authority_balance * 0.08
    + (1 - pacing.content_fatigue_risk) * 0.07
    + format.format_distribution_quality * 0.07
    + storytelling.series_continuity_quality * 0.05,
  );
  return {
    editorial_diversity: balance.editorial_diversity,
    emotional_pacing_quality: emotionalArc.emotional_pacing_quality,
    storytelling_continuity: storytelling.storytelling_continuity,
    content_freshness: pacing.content_freshness,
    audience_retention_probability: attention.audience_retention_probability,
    attention_loop_stability: attention.attention_loop_stability,
    saturation_risk: pacing.saturation_risk,
    educational_balance: balance.educational_balance,
    authority_balance: balance.authority_balance,
    content_fatigue_risk: pacing.content_fatigue_risk,
    format_distribution_quality: format.format_distribution_quality,
    series_continuity_quality: storytelling.series_continuity_quality,
    editorial_director_score: round(score),
  };
}

function buildNextState({ audienceTemperature, attention, pacing, storytelling }) {
  return {
    audience_temperature: audienceTemperature.audience_temperature,
    audience_saturation: audienceTemperature.audience_saturation,
    attention_decay: attention.attention_decay,
    emotional_carryover: audienceTemperature.emotional_carryover,
    trust_carryover: audienceTemperature.trust_carryover,
    authority_carryover: audienceTemperature.authority_carryover,
    editorial_freshness: pacing.editorial_freshness,
    narrative_progression_stage: storytelling.narrative_progression_stage,
    attention_loop_status: attention.attention_loop_status,
  };
}

function timelineEntry({ runtimeState = {}, request = {}, balance, format, storytelling, audienceTemperature, attention, pacing }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    topic: request.topic || request.userRequest || runtimeState.generation_intent?.topic || "untitled topic",
    topic_cluster: storytelling.topic_cluster,
    category: balance.selected_category,
    format: format.current_format,
    audience_temperature: audienceTemperature.audience_temperature,
    audience_saturation: audienceTemperature.audience_saturation,
    attention_decay: attention.attention_decay,
    freshness: pacing.editorial_freshness,
    narrative_stage: storytelling.narrative_progression_stage,
  };
}

async function runEditorialDirector({
  expertId = "dinara",
  root = process.cwd(),
  runtimeResult = {},
  request = {},
  campaignMemory = {},
  strategicBrain = {},
  persist = true,
  initializeStorage = true,
} = {}) {
  const runtimeState = runtimeResult.runtime_state || runtimeResult.runtime?.runtime_state || {};
  const loaded = await loadEditorialState(expertId, { root, initialize: initializeStorage });
  const state = loaded.state;

  const balance = analyzeContentBalance({ state, runtimeState, request, strategicBrain, campaignMemory });
  const audienceTemperature = analyzeAudienceTemperature({ state, strategicBrain, campaignMemory, balance });
  const storytelling = analyzeStorytelling({ state, runtimeState, request, balance, strategicBrain });
  const format = analyzeFormatOrchestration({ state, runtimeState, request, balance, audienceTemperature });
  const emotionalArc = analyzeEmotionalArc({ state, audienceTemperature, storytelling, strategicBrain });
  const attention = analyzeAttentionLoop({ state, storytelling, format, audienceTemperature, balance });
  const pacing = analyzeEditorialPacing({ balance, audienceTemperature, attention, emotionalArc, storytelling });
  const calendar = createEditorialCalendarSlot({ state, format, balance, storytelling, pacing });
  const scores = aggregateScores({ balance, storytelling, format, audienceTemperature, attention, emotionalArc, pacing });
  const nextState = buildNextState({ audienceTemperature, attention, pacing, storytelling });
  const currentArc = {
    name: storytelling.current_content_arc,
    stage: storytelling.narrative_progression_stage,
    progression: round(clamp((Number(state.current_arc?.progression || 0.18) + 0.08) % 1)),
  };

  const event = {
    timeline_entry: timelineEntry({ runtimeState, request, balance, format, storytelling, audienceTemperature, attention, pacing }),
    storyline_entry: storytellingEvent({ runtimeState, request, analysis: storytelling }),
    current_arc: currentArc,
  };

  let updatedState = state;
  if (persist) {
    updatedState = updateEditorialState(state, event, nextState, scores);
    await saveEditorialState(expertId, updatedState, { root });
  }

  const warnings = unique([
    ...balance.warnings,
    ...audienceTemperature.warnings,
    ...storytelling.warnings,
    ...format.warnings,
    ...emotionalArc.warnings,
    ...attention.warnings,
    ...pacing.warnings,
  ]);

  return {
    schema_version: EDITORIAL_DIRECTOR_SCHEMA_VERSION,
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
    auto_posting: false,
    editorial_director_enabled: true,
    storytelling_engine_enabled: true,
    format_orchestration_enabled: true,
    attention_loop_engine_enabled: true,
    audience_temperature_engine_enabled: true,
    editorial_memory_enabled: true,
    freshness_monitor_enabled: true,
    editorial_state_loaded_from_disk: loaded.loaded_from_disk,
    editorial_state_persisted_after_run: persist,
    editorial_state_path: path.relative(root, loaded.path).replace(/\\/g, "/"),
    editorial_state_run_count: updatedState.run_count || state.run_count || 0,
    editorial_state_summary: {
      ...nextState,
      current_content_arc: currentArc.name,
      content_category_balance: updatedState.content_category_distribution || state.content_category_distribution || {},
      reel_post_story_balance: format.reel_post_story_balance,
      repetition_clusters: updatedState.repetition_clusters || state.repetition_clusters || {},
    },
    content_balance: balance,
    audience_temperature: audienceTemperature,
    storytelling,
    format_orchestration: format,
    emotional_arc: emotionalArc,
    attention_loop: attention,
    editorial_pacing: pacing,
    editorial_calendar: calendar,
    editorial_scores: scores,
    adapter_signals: {
      editorial_state_summary: nextState,
      recommended_content_format: format.recommended_next_format,
      current_audience_temperature: audienceTemperature.audience_temperature_label,
      audience_temperature_score: audienceTemperature.audience_temperature,
      saturation_warning: audienceTemperature.saturation_warning,
      next_emotional_direction: emotionalArc.next_emotional_direction,
      attention_loop_status: attention.attention_loop_status,
      storytelling_continuity_signals: storytelling.episodic_storyline_continuity,
      freshness_recommendations: pacing.freshness_recommendation,
      content_category_balancing_signals: {
        category: balance.selected_category,
        educational_ratio: balance.educational_ratio,
        soft_selling_ratio: balance.soft_selling_ratio,
        storytelling_ratio: balance.storytelling_ratio,
        emotional_content_ratio: balance.emotional_content_ratio,
      },
      recommended_next_narrative_move: pacing.recommended_next_narrative_move,
      editorial_freshness: pacing.editorial_freshness,
      authority_saturation: round(1 - balance.authority_balance),
      emotional_saturation: emotionalArc.emotional_saturation,
      fatigue_risk: pacing.content_fatigue_risk,
      saturation_risk: pacing.saturation_risk,
      editorial_director_score: scores.editorial_director_score,
    },
    warnings,
    status: warnings.length ? "pass_with_warnings" : "pass",
  };
}

async function runCli() {
  const result = await runEditorialDirector({
    persist: false,
    runtimeResult: {
      runtime_state: {
        run_id: "editorial_director_smoke_test",
        generation_intent: { topic: "relationship anxiety", intent: "educational_post" },
        production_format: "post",
        cta_pacing: { selected_cta_type: "low_pressure_cta" },
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
  EDITORIAL_DIRECTOR_SCHEMA_VERSION,
  aggregateScores,
  runEditorialDirector,
};
