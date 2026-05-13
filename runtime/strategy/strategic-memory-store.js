import { promises as fs } from "fs";
import path from "path";

const STRATEGIC_MEMORY_SCHEMA_VERSION = "2026-05-13.strategic_memory_state.v1";
const DEFAULT_HISTORY_LIMIT = 80;

function strategicMemoryDir(root, expertId) {
  return path.join(root, "storage", "strategy", expertId);
}

function strategicStatePath(root, expertId) {
  return path.join(strategicMemoryDir(root, expertId), "strategic-state.json");
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

function createDefaultStrategicState(expertId = "dinara") {
  return {
    schema_version: STRATEGIC_MEMORY_SCHEMA_VERSION,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    production_activation_allowed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    current_state: {
      authority_level: 0.42,
      trust_level: 0.36,
      emotional_warmth: 0.58,
      conversion_pressure: 0.1,
      audience_resistance: 0.34,
      audience_trust_fatigue: 0.12,
      narrative_loop_stage: "recognition",
      positioning_consistency: 0.68,
      perceived_expertise_level: 0.44,
      intimacy_pacing: 0.36,
      trust_retention_probability: 0.68,
    },
    history: [],
    trust_history: [],
    authority_history: [],
    emotional_funnel_history: [],
    conversion_pressure_history: [],
    positioning_history: [],
    narrative_loop_history: [],
    aggregate_scores: {
      authority_balance: 0.72,
      trust_pacing: 0.7,
      emotional_pacing: 0.72,
      conversion_pressure: 0.1,
      overselling_risk: 0.08,
      intimacy_overload: 0.12,
      expert_positioning_consistency: 0.68,
      audience_warming_quality: 0.68,
      trust_retention_probability: 0.68,
      strategic_brain_score: 0.7,
    },
  };
}

async function loadStrategicState(expertId = "dinara", { root = process.cwd(), initialize = true } = {}) {
  const target = strategicStatePath(root, expertId);
  const stored = await readJson(target, null);
  if (stored) {
    return {
      state: stored,
      path: target,
      loaded_from_disk: true,
    };
  }
  const state = createDefaultStrategicState(expertId);
  if (initialize) await saveStrategicState(expertId, state, { root });
  return {
    state,
    path: target,
    loaded_from_disk: false,
  };
}

async function saveStrategicState(expertId, state, { root = process.cwd() } = {}) {
  const target = strategicStatePath(root, expertId);
  const next = {
    ...state,
    schema_version: STRATEGIC_MEMORY_SCHEMA_VERSION,
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

async function resetStrategicState(expertId = "dinara", { root = process.cwd() } = {}) {
  const state = createDefaultStrategicState(expertId);
  await saveStrategicState(expertId, state, { root });
  return state;
}

function pushLimited(items = [], item, limit = DEFAULT_HISTORY_LIMIT) {
  return [...items, item].slice(-limit);
}

function updateStrategicState(state, event, nextState, scores, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  return {
    ...state,
    updated_at: new Date().toISOString(),
    run_count: Number(state.run_count || 0) + 1,
    current_state: nextState,
    aggregate_scores: scores,
    history: pushLimited(state.history, event.summary, historyLimit),
    trust_history: pushLimited(state.trust_history, event.trust, historyLimit),
    authority_history: pushLimited(state.authority_history, event.authority, historyLimit),
    emotional_funnel_history: pushLimited(state.emotional_funnel_history, event.emotional, historyLimit),
    conversion_pressure_history: pushLimited(state.conversion_pressure_history, event.conversion, historyLimit),
    positioning_history: pushLimited(state.positioning_history, event.positioning, historyLimit),
    narrative_loop_history: pushLimited(state.narrative_loop_history, event.narrative, historyLimit),
  };
}

export {
  STRATEGIC_MEMORY_SCHEMA_VERSION,
  createDefaultStrategicState,
  loadStrategicState,
  resetStrategicState,
  saveStrategicState,
  strategicMemoryDir,
  strategicStatePath,
  updateStrategicState,
};
