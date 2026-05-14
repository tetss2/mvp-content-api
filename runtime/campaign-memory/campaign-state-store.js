import { promises as fs } from "fs";
import path from "path";

const CAMPAIGN_STATE_SCHEMA_VERSION = "2026-05-13.campaign_memory_state.v1";
const DEFAULT_HISTORY_LIMIT = 60;

function runtimeRoot() {
  return process.env.RUNTIME_DATA_ROOT || process.cwd();
}

function campaignMemoryDir(root, expertId) {
  return path.join(root, "storage", "campaign-memory", expertId);
}

function campaignStatePath(root, expertId) {
  return path.join(campaignMemoryDir(root, expertId), "campaign-state.json");
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

function createDefaultCampaignState(expertId = "dinara") {
  return {
    schema_version: CAMPAIGN_STATE_SCHEMA_VERSION,
    expert_id: expertId,
    local_only: true,
    admin_only: true,
    production_activation_allowed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    topic_history: [],
    cta_history: [],
    narrative_arcs: [],
    content_sequence: [],
    audience_fatigue_signals: [],
    format_distribution: {},
    expert_positioning_history: [],
    aggregate_scores: {
      topic_freshness: 0.82,
      narrative_continuity: 0.72,
      cta_fatigue: 0.12,
      audience_fatigue: 0.16,
      sequence_coherence: 0.72,
      expert_positioning_consistency: 0.74,
      format_variety: 0.7,
      campaign_memory_score: 0.74,
    },
  };
}

async function loadCampaignState(expertId = "dinara", { root = runtimeRoot(), initialize = true } = {}) {
  const target = campaignStatePath(root, expertId);
  const stored = await readJson(target, null);
  if (stored) {
    return {
      state: stored,
      path: target,
      loaded_from_disk: true,
    };
  }

  const state = createDefaultCampaignState(expertId);
  if (initialize) await saveCampaignState(expertId, state, { root });
  return {
    state,
    path: target,
    loaded_from_disk: false,
  };
}

async function saveCampaignState(expertId, state, { root = runtimeRoot() } = {}) {
  const target = campaignStatePath(root, expertId);
  const next = {
    ...state,
    schema_version: CAMPAIGN_STATE_SCHEMA_VERSION,
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

async function resetCampaignState(expertId = "dinara", { root = runtimeRoot() } = {}) {
  const state = createDefaultCampaignState(expertId);
  await saveCampaignState(expertId, state, { root });
  return state;
}

function pushLimited(items = [], item, limit = DEFAULT_HISTORY_LIMIT) {
  return [...items, item].slice(-limit);
}

function updateFormatDistribution(distribution = {}, format = "post") {
  return {
    ...distribution,
    [format]: Number(distribution[format] || 0) + 1,
  };
}

function updateCampaignState(state, event, scores, { historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
  return {
    ...state,
    updated_at: new Date().toISOString(),
    run_count: Number(state.run_count || 0) + 1,
    topic_history: pushLimited(state.topic_history, event.topic_entry, historyLimit),
    cta_history: pushLimited(state.cta_history, event.cta_entry, historyLimit),
    narrative_arcs: pushLimited(state.narrative_arcs, event.narrative_entry, historyLimit),
    content_sequence: pushLimited(state.content_sequence, event.sequence_entry, historyLimit),
    audience_fatigue_signals: pushLimited(state.audience_fatigue_signals, event.fatigue_entry, historyLimit),
    format_distribution: updateFormatDistribution(state.format_distribution, event.sequence_entry.format),
    expert_positioning_history: pushLimited(state.expert_positioning_history, event.positioning_entry, historyLimit),
    aggregate_scores: scores,
  };
}

export {
  CAMPAIGN_STATE_SCHEMA_VERSION,
  createDefaultCampaignState,
  campaignMemoryDir,
  campaignStatePath,
  loadCampaignState,
  resetCampaignState,
  saveCampaignState,
  updateCampaignState,
};
