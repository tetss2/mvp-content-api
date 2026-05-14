import { promises as fs } from "fs";
import path from "path";

const PERSONA_MEMORY_SCHEMA_VERSION = "2026-05-13.persona_identity_memory.v1";
const DEFAULT_HISTORY_LIMIT = 24;

function runtimeRoot() {
  return process.env.RUNTIME_DATA_ROOT || process.cwd();
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 3) {
  return Number(clamp(value, -999, 999).toFixed(digits));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function identityStorageDir(root, expertId) {
  return path.join(root, "storage", "identity", expertId);
}

function identityMemoryPath(root, expertId) {
  return path.join(identityStorageDir(root, expertId), "persona-identity-state.json");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(target, fallback = null) {
  if (!await exists(target)) return fallback;
  return JSON.parse(await fs.readFile(target, "utf8"));
}

function createDefaultPersonaMemory(expertId = "dinara") {
  return {
    schema_version: PERSONA_MEMORY_SCHEMA_VERSION,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    production_activation_allowed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    aggregate_identity: {
      identity_confidence: 0.72,
      author_similarity: 0.72,
      rhetorical_similarity: 0.7,
      emotional_similarity: 0.72,
      continuity_similarity: 0.7,
      worldview_similarity: 0.74,
      generic_ai_divergence: 0.24,
      narrative_persistence: 0.7,
    },
    tendencies: {
      emotional_tone: {},
      phrase_rhythm: {},
      rhetorical_patterns: {},
      cta_behavior: {},
      pacing: {},
      worldview_anchors: {},
      semantic_structures: {},
      narrative_markers: {},
    },
    continuity_memory: {
      recent_themes: [],
      recent_emotional_arcs: [],
      repeated_semantic_structures: [],
      repetitive_narrative_habits: [],
      continuity_anchors: [],
    },
    history: [],
  };
}

async function loadPersonaMemory(expertId = "dinara", { root = runtimeRoot(), initialize = true } = {}) {
  const target = identityMemoryPath(root, expertId);
  const stored = await readJson(target, null);
  if (stored) {
    return {
      state: stored,
      path: target,
      loaded_from_disk: true,
    };
  }

  const state = createDefaultPersonaMemory(expertId);
  if (initialize) {
    await savePersonaMemory(expertId, state, { root });
  }
  return {
    state,
    path: target,
    loaded_from_disk: false,
  };
}

async function savePersonaMemory(expertId, state, { root = runtimeRoot() } = {}) {
  const target = identityMemoryPath(root, expertId);
  const next = {
    ...state,
    schema_version: PERSONA_MEMORY_SCHEMA_VERSION,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    production_activation_allowed: false,
    updated_at: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return target;
}

function incrementMap(source = {}, values = [], weight = 1) {
  const next = { ...source };
  for (const value of values.filter(Boolean)) {
    next[value] = round((next[value] || 0) + weight, 4);
  }
  return next;
}

function blendMetric(previous, current, alpha = 0.28) {
  if (previous == null) return round(current);
  return round((Number(previous) * (1 - alpha)) + (Number(current) * alpha));
}

function updatePersonaMemory(memory, identityResult, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  const fingerprint = identityResult.identity_fingerprint || {};
  const continuity = identityResult.persona_continuity || {};
  const rhetorical = identityResult.rhetorical_patterns || {};
  const emotional = identityResult.emotional_signature || {};
  const worldview = identityResult.worldview_profile || {};
  const previousAggregate = memory.aggregate_identity || {};
  const aggregate_identity = {};

  for (const [key, value] of Object.entries(fingerprint)) {
    aggregate_identity[key] = blendMetric(previousAggregate[key], value);
  }

  const tendencies = {
    emotional_tone: incrementMap(memory.tendencies?.emotional_tone, emotional.detected_emotions || []),
    phrase_rhythm: incrementMap(memory.tendencies?.phrase_rhythm, rhetorical.rhythm_labels || []),
    rhetorical_patterns: incrementMap(memory.tendencies?.rhetorical_patterns, rhetorical.detected_patterns || []),
    cta_behavior: incrementMap(memory.tendencies?.cta_behavior, rhetorical.cta_patterns || []),
    pacing: incrementMap(memory.tendencies?.pacing, rhetorical.pacing_labels || []),
    worldview_anchors: incrementMap(memory.tendencies?.worldview_anchors, worldview.detected_anchors || []),
    semantic_structures: incrementMap(memory.tendencies?.semantic_structures, continuity.semantic_structures || []),
    narrative_markers: incrementMap(memory.tendencies?.narrative_markers, continuity.continuity_anchors || []),
  };

  const continuity_memory = {
    recent_themes: unique([...(memory.continuity_memory?.recent_themes || []), ...(continuity.recent_themes || [])]).slice(-historyLimit),
    recent_emotional_arcs: unique([...(memory.continuity_memory?.recent_emotional_arcs || []), ...(continuity.recent_emotional_arcs || [])]).slice(-historyLimit),
    repeated_semantic_structures: unique([...(memory.continuity_memory?.repeated_semantic_structures || []), ...(continuity.semantic_structures || [])]).slice(-historyLimit),
    repetitive_narrative_habits: unique([...(memory.continuity_memory?.repetitive_narrative_habits || []), ...(continuity.narrative_habits || [])]).slice(-historyLimit),
    continuity_anchors: unique([...(memory.continuity_memory?.continuity_anchors || []), ...(continuity.continuity_anchors || [])]).slice(-historyLimit),
  };

  const historyItem = {
    at: new Date().toISOString(),
    run_id: identityResult.run_id,
    topic: identityResult.topic,
    identity_confidence: fingerprint.identity_confidence,
    persona_drift_level: identityResult.drift_detection?.persona_drift_level,
    generic_ai_divergence: fingerprint.generic_ai_divergence,
    worldview_similarity: fingerprint.worldview_similarity,
    rhetorical_similarity: fingerprint.rhetorical_similarity,
  };

  return {
    ...memory,
    updated_at: new Date().toISOString(),
    run_count: Number(memory.run_count || 0) + 1,
    aggregate_identity,
    tendencies,
    continuity_memory,
    history: [...(memory.history || []), historyItem].slice(-historyLimit),
  };
}

export {
  PERSONA_MEMORY_SCHEMA_VERSION,
  createDefaultPersonaMemory,
  identityMemoryPath,
  identityStorageDir,
  loadPersonaMemory,
  savePersonaMemory,
  updatePersonaMemory,
};
