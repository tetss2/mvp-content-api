import { clamp, round } from "../stabilization/utils.js";

const TOPIC_HISTORY_SCHEMA_VERSION = "2026-05-13.topic_history.v1";

function normalizeTopic(topic = "") {
  return String(topic).toLowerCase().trim().replace(/\s+/g, " ");
}

function topicTokens(topic = "") {
  return normalizeTopic(topic).split(/\s+/).filter((token) => token.length > 3);
}

function topicOverlap(a = "", b = "") {
  const left = new Set(topicTokens(a));
  const right = new Set(topicTokens(b));
  if (!left.size || !right.size) return 0;
  const hits = [...left].filter((token) => right.has(token)).length;
  return hits / Math.max(left.size, right.size);
}

function analyzeTopicHistory({ topic = "", state = {} } = {}) {
  const history = state.topic_history || [];
  const recent = history.slice(-8);
  const normalized = normalizeTopic(topic);
  const exactRecentRepeats = recent.filter((item) => normalizeTopic(item.topic) === normalized).length;
  const overlaps = recent.map((item) => topicOverlap(topic, item.topic));
  const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0;
  const freshness = clamp(0.9 - exactRecentRepeats * 0.18 - maxOverlap * 0.22);
  const repetitionRisk = clamp(exactRecentRepeats * 0.22 + maxOverlap * 0.32);

  return {
    schema_version: TOPIC_HISTORY_SCHEMA_VERSION,
    topic,
    recent_topics: recent.map((item) => item.topic),
    recent_topic_overlap: round(maxOverlap),
    repeated_topic_count: exactRecentRepeats,
    topic_freshness: round(freshness),
    topic_repetition_risk: round(repetitionRisk),
    status: repetitionRisk >= 0.48 ? "reframe" : repetitionRisk >= 0.25 ? "watch" : "fresh",
    recommendation: repetitionRisk >= 0.48
      ? "Use an adjacent angle or continue with a new case frame."
      : repetitionRisk >= 0.25
        ? "Keep the topic, but change hook, example, and CTA."
        : "Topic is fresh enough for the campaign sequence.",
    warnings: [
      exactRecentRepeats > 1 ? "repeated_topic_recently" : null,
      maxOverlap >= 0.6 ? "high_recent_topic_overlap" : null,
    ].filter(Boolean),
  };
}

function topicEntry({ topic, runtimeState = {}, analysis }) {
  return {
    at: new Date().toISOString(),
    run_id: runtimeState.run_id,
    topic,
    intent: runtimeState.generation_intent?.intent,
    freshness: analysis.topic_freshness,
    repetition_risk: analysis.topic_repetition_risk,
  };
}

export {
  TOPIC_HISTORY_SCHEMA_VERSION,
  analyzeTopicHistory,
  topicEntry,
};
