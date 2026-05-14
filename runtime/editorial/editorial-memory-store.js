import { promises as fs } from "fs";
import path from "path";

const EDITORIAL_MEMORY_SCHEMA_VERSION = "2026-05-13.editorial_memory.v1";
const DEFAULT_HISTORY_LIMIT = 90;

function editorialMemoryDir(root, expertId) {
  return path.join(root, "storage", "editorial", expertId);
}

function editorialStatePath(root, expertId) {
  return path.join(editorialMemoryDir(root, expertId), "editorial-state.json");
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

function createDefaultEditorialState(expertId = "dinara") {
  return {
    schema_version: EDITORIAL_MEMORY_SCHEMA_VERSION,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    production_activation_allowed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    timeline: [],
    content_category_distribution: {},
    format_distribution: {},
    repetition_clusters: {},
    episodic_storylines: [],
    current_arc: {
      name: "trust_warming_arc",
      stage: "opening",
      progression: 0.18,
    },
    current_state: {
      audience_temperature: 0.42,
      audience_saturation: 0.18,
      attention_decay: 0.22,
      emotional_carryover: 0.34,
      trust_carryover: 0.4,
      authority_carryover: 0.36,
      editorial_freshness: 0.82,
      narrative_progression_stage: "opening",
      attention_loop_status: "stable",
    },
    aggregate_scores: {
      editorial_diversity: 0.78,
      emotional_pacing_quality: 0.76,
      storytelling_continuity: 0.72,
      content_freshness: 0.82,
      audience_retention_probability: 0.74,
      attention_loop_stability: 0.76,
      saturation_risk: 0.18,
      educational_balance: 0.74,
      authority_balance: 0.72,
      content_fatigue_risk: 0.16,
      format_distribution_quality: 0.72,
      series_continuity_quality: 0.7,
      editorial_director_score: 0.74,
    },
  };
}

async function loadEditorialState(expertId = "dinara", { root = process.cwd(), initialize = true } = {}) {
  const target = editorialStatePath(root, expertId);
  const stored = await readJson(target, null);
  if (stored) {
    return {
      state: stored,
      path: target,
      loaded_from_disk: true,
    };
  }

  const state = createDefaultEditorialState(expertId);
  if (initialize) await saveEditorialState(expertId, state, { root });
  return {
    state,
    path: target,
    loaded_from_disk: false,
  };
}

async function saveEditorialState(expertId, state, { root = process.cwd() } = {}) {
  const target = editorialStatePath(root, expertId);
  const next = {
    ...state,
    schema_version: EDITORIAL_MEMORY_SCHEMA_VERSION,
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

async function resetEditorialState(expertId = "dinara", { root = process.cwd() } = {}) {
  const state = createDefaultEditorialState(expertId);
  await saveEditorialState(expertId, state, { root });
  return state;
}

function pushLimited(items = [], item, limit = DEFAULT_HISTORY_LIMIT) {
  return [...items, item].slice(-limit);
}

function increment(distribution = {}, key = "unknown") {
  return {
    ...distribution,
    [key]: Number(distribution[key] || 0) + 1,
  };
}

function updateEditorialState(state, event, nextState, scores, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  return {
    ...state,
    updated_at: new Date().toISOString(),
    run_count: Number(state.run_count || 0) + 1,
    timeline: pushLimited(state.timeline, event.timeline_entry, historyLimit),
    content_category_distribution: increment(state.content_category_distribution, event.timeline_entry.category),
    format_distribution: increment(state.format_distribution, event.timeline_entry.format),
    repetition_clusters: {
      ...(state.repetition_clusters || {}),
      [event.timeline_entry.topic_cluster]: Number(state.repetition_clusters?.[event.timeline_entry.topic_cluster] || 0) + 1,
    },
    episodic_storylines: pushLimited(state.episodic_storylines, event.storyline_entry, historyLimit),
    current_arc: event.current_arc,
    current_state: nextState,
    aggregate_scores: scores,
  };
}

export {
  EDITORIAL_MEMORY_SCHEMA_VERSION,
  createDefaultEditorialState,
  editorialMemoryDir,
  editorialStatePath,
  loadEditorialState,
  resetEditorialState,
  saveEditorialState,
  updateEditorialState,
};
