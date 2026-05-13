import { fileURLToPath } from "url";
import path from "path";
import { clamp, round, unique } from "../stabilization/utils.js";
import { scoreWorldviewProfile } from "./worldview-profile.js";
import { scoreEmotionalSignature } from "./emotional-signature.js";
import { scoreRhetoricalPatterns } from "./rhetorical-patterns.js";
import { scoreNarrativeContinuity } from "./narrative-continuity.js";
import { detectIdentityDrift } from "./identity-drift-detector.js";
import { loadPersonaMemory, savePersonaMemory, updatePersonaMemory } from "./persona-memory.js";

const AUTHOR_IDENTITY_ENGINE_SCHEMA_VERSION = "2026-05-13.author_identity_engine.v1";

function getPromptText({ promptPackage = {}, finalGenerationResult = {} } = {}) {
  return finalGenerationResult.content
    || promptPackage.assembledPrompt?.final_prompt
    || "";
}

function buildIdentityFingerprint({ worldview, emotional, rhetorical, continuity, drift, stabilization }) {
  const authorSimilarity = clamp(
    Number(stabilization.author_voice_confidence ?? 0.72) * 0.5
    + rhetorical.rhetorical_similarity * 0.2
    + emotional.emotional_similarity * 0.15
    + worldview.worldview_similarity * 0.15,
  );
  const genericDivergence = clamp(1 - Number(stabilization.generic_ai_risk_score ?? drift.generic_ai_tone_risk ?? 0.24));
  const identityConfidence = clamp(
    authorSimilarity * 0.24
    + rhetorical.rhetorical_similarity * 0.18
    + emotional.emotional_similarity * 0.18
    + continuity.continuity_similarity * 0.16
    + worldview.worldview_similarity * 0.16
    + genericDivergence * 0.08
    - drift.persona_drift_score * 0.12,
  );

  return {
    identity_confidence: round(identityConfidence),
    author_similarity: round(authorSimilarity),
    rhetorical_similarity: rhetorical.rhetorical_similarity,
    emotional_similarity: emotional.emotional_similarity,
    continuity_similarity: continuity.continuity_similarity,
    worldview_similarity: worldview.worldview_similarity,
    generic_ai_divergence: round(genericDivergence),
    narrative_persistence: continuity.narrative_persistence,
  };
}

async function runAuthorIdentityEngine({
  expertId = "dinara",
  root = process.cwd(),
  runtimeResult = {},
  promptPackage = {},
  finalGenerationResult = {},
  persist = true,
  initializeStorage = true,
} = {}) {
  const runtimeState = runtimeResult.runtime_state || runtimeResult.runtime?.runtime_state || {};
  const stabilization = runtimeResult.integrated_validation?.stabilization
    || runtimeResult.generation_pipeline?.runtime_quality_stabilization?.after
    || {};
  const text = getPromptText({ promptPackage, finalGenerationResult });
  const loadedMemory = await loadPersonaMemory(expertId, { root, initialize: initializeStorage });
  const memory = loadedMemory.state;

  const worldview = scoreWorldviewProfile({ text, runtimeState, memory });
  const emotional = scoreEmotionalSignature({ text, runtimeState, memory });
  const rhetorical = scoreRhetoricalPatterns({ text, runtimeState, memory });
  const continuity = scoreNarrativeContinuity({ text, runtimeState, memory, rhetorical, emotional });
  const drift = detectIdentityDrift({ text, worldview, emotional, rhetorical, continuity, stabilization });
  const fingerprint = buildIdentityFingerprint({ worldview, emotional, rhetorical, continuity, drift, stabilization });

  const identityResult = {
    schema_version: AUTHOR_IDENTITY_ENGINE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    run_id: runtimeState.run_id || runtimeResult.run_id || null,
    expert_id: expertId,
    topic: runtimeState.generation_intent?.topic || null,
    local_only: true,
    admin_only: true,
    activation_scope: "admin_runtime_preview_only",
    production_activation_allowed: false,
    production_generation_replaced: false,
    telegram_runtime_mutation: false,
    external_api_calls: false,
    faiss_or_index_mutation: false,
    ingest_or_promote: false,
    identity_engine_enabled: true,
    persona_memory_enabled: true,
    worldview_tracking_enabled: true,
    identity_drift_detection_enabled: true,
    persona_memory_loaded_from_disk: loadedMemory.loaded_from_disk,
    persona_memory_path: path.relative(root, loadedMemory.path).replace(/\\/g, "/"),
    identity_fingerprint: fingerprint,
    worldview_profile: worldview,
    emotional_signature: emotional,
    rhetorical_patterns: rhetorical,
    persona_continuity: continuity,
    drift_detection: drift,
    preview_metrics: {
      identity_confidence: fingerprint.identity_confidence,
      persona_drift_level: drift.persona_drift_level,
      worldview_stability: worldview.worldview_stability,
      emotional_continuity: emotional.emotional_continuity,
      rhetorical_continuity: rhetorical.rhetorical_continuity,
      generic_ai_divergence: fingerprint.generic_ai_divergence,
      narrative_persistence: continuity.narrative_persistence,
    },
    warnings: unique([
      ...(worldview.warnings || []),
      ...(emotional.warnings || []),
      ...(rhetorical.warnings || []),
      ...(continuity.warnings || []),
      ...(drift.warnings || []),
    ]),
  };

  let persisted = false;
  if (persist) {
    const updated = updatePersonaMemory(memory, identityResult);
    await savePersonaMemory(expertId, updated, { root });
    identityResult.persona_memory_persisted_after_run = true;
    identityResult.persona_memory_run_count = updated.run_count;
    identityResult.persisted_aggregate_identity = updated.aggregate_identity;
    persisted = true;
  }

  if (!persisted) {
    identityResult.persona_memory_persisted_after_run = false;
    identityResult.persona_memory_run_count = memory.run_count || 0;
    identityResult.persisted_aggregate_identity = memory.aggregate_identity || {};
  }

  return identityResult;
}

async function runCli() {
  const result = await runAuthorIdentityEngine({
    expertId: "dinara",
    persist: false,
    promptPackage: {
      assembledPrompt: {
        final_prompt: "Local identity engine syntax smoke test. No production generation.",
      },
    },
  });
  console.log(JSON.stringify(result.preview_metrics, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  AUTHOR_IDENTITY_ENGINE_SCHEMA_VERSION,
  buildIdentityFingerprint,
  runAuthorIdentityEngine,
};
