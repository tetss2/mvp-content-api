import { clamp, round } from "../stabilization/utils.js";

const STORYTELLING_ENGINE_SCHEMA_VERSION = "2026-05-13.storytelling_engine.v1";

const STAGES = ["opening", "recognition", "deepening", "reframe", "integration", "renewal"];

function nextStage(stage = "opening", pressure = 0.12) {
  const index = Math.max(0, STAGES.indexOf(stage));
  if (pressure > 0.58) return "renewal";
  return STAGES[Math.min(STAGES.length - 1, index + 1)];
}

function topicCluster(topic = "") {
  const normalized = String(topic || "untitled").toLowerCase();
  if (/стыд|shame/.test(normalized)) return "shame";
  if (/тревог|anx/.test(normalized)) return "anxiety";
  if (/желан|desire/.test(normalized)) return "desire";
  if (/границ|boundar/.test(normalized)) return "boundaries";
  if (/консульт|consult|cta/.test(normalized)) return "consultation";
  return normalized.split(/\s+/).slice(0, 2).join("_") || "general";
}

function analyzeStorytelling({ state = {}, runtimeState = {}, request = {}, balance = {}, strategicBrain = {} } = {}) {
  const previousStage = state.current_arc?.stage || state.current_state?.narrative_progression_stage || "opening";
  const topic = request.topic || request.userRequest || runtimeState.generation_intent?.topic || "untitled topic";
  const cluster = topicCluster(topic);
  const recentClusters = (state.timeline || []).slice(-10).map((item) => item.topic_cluster);
  const clusterRepeats = recentClusters.filter((item) => item === cluster).length;
  const conversionPressure = strategicBrain.adapter_signals?.conversion_pressure || 0.12;
  const stage = clusterRepeats >= 3 ? "renewal" : nextStage(previousStage, conversionPressure);
  const continuity = clamp(
    0.72
    + Math.min(0.12, (state.episodic_storylines || []).length * 0.006)
    - Math.max(0, clusterRepeats - 2) * 0.08
    + (balance.storytelling_ratio < 0.18 ? 0.05 : 0),
  );
  const seriesQuality = clamp(continuity - (stage === "renewal" ? 0.03 : 0) + (previousStage !== stage ? 0.04 : 0));

  return {
    schema_version: STORYTELLING_ENGINE_SCHEMA_VERSION,
    current_content_arc: state.current_arc?.name || "trust_warming_arc",
    previous_narrative_stage: previousStage,
    narrative_progression_stage: stage,
    topic_cluster: cluster,
    episodic_storyline_continuity: {
      active_thread: cluster,
      previous_stage: previousStage,
      next_stage: stage,
      cluster_repeats: clusterRepeats,
    },
    storytelling_continuity: round(continuity),
    series_continuity_quality: round(seriesQuality),
    recommended_next_narrative_move: stage === "renewal"
      ? "reset_with_new_reader_problem"
      : stage === "deepening"
        ? "add_embodied_example_or_case_fragment"
        : stage === "reframe"
          ? "turn recognition into expert reframe"
          : "continue the storyline one step forward",
    warnings: [
      clusterRepeats >= 3 ? "storyline_cluster_repetition" : null,
      continuity < 0.62 ? "storytelling_continuity_low" : null,
    ].filter(Boolean),
  };
}

function storytellingEvent({ runtimeState = {}, request = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    topic: request.topic || request.userRequest || runtimeState.generation_intent?.topic,
    topic_cluster: analysis.topic_cluster,
    arc: analysis.current_content_arc,
    stage: analysis.narrative_progression_stage,
    next_move: analysis.recommended_next_narrative_move,
  };
}

export {
  STORYTELLING_ENGINE_SCHEMA_VERSION,
  STAGES,
  analyzeStorytelling,
  storytellingEvent,
  topicCluster,
};
