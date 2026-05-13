import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = process.cwd();
const DEFAULT_REGISTRY_PATH = "configs/experts/registry.json";
const REQUIRED_EXPERT_FIELDS = [
  "expert_id",
  "display_name",
  "status",
  "primary_language",
  "platforms",
  "content_domains",
  "retrieval_namespace",
  "voice_profile_path",
  "feedback_memory_path",
  "generation_policy_path",
  "safety_policy_path",
  "style_constraints_path",
  "created_at",
  "updated_at",
];

const REQUIRED_RUNTIME_CONFIG_KEYS = [
  "retrieval_settings_path",
  "generation_settings_path",
  "tone_settings_path",
  "cta_settings_path",
  "safety_settings_path",
  "style_settings_path",
  "context_policy_path",
  "output_policy_path",
];

function toPosix(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/");
}

function resolveRootPath(root, target) {
  return path.resolve(root, target);
}

async function readJson(root, relativePath, fallback = null) {
  const absolutePath = resolveRootPath(root, relativePath);
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (fallback !== null && error.code === "ENOENT") return fallback;
    error.message = `Failed to read JSON at ${relativePath}: ${error.message}`;
    throw error;
  }
}

async function pathExists(root, relativePath) {
  try {
    await fs.access(resolveRootPath(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function normalizeExpertMetadata(expert = {}) {
  return {
    ...expert,
    expert_id: String(expert.expert_id || "").trim(),
    retrieval_namespace: String(expert.retrieval_namespace || "").trim(),
    platforms: Array.isArray(expert.platforms) ? expert.platforms : [],
    content_domains: Array.isArray(expert.content_domains) ? expert.content_domains : [],
  };
}

async function loadExpertRegistry({ root = ROOT, registryPath = DEFAULT_REGISTRY_PATH } = {}) {
  const registry = await readJson(root, registryPath);
  return {
    ...registry,
    experts: (registry.experts || []).map(normalizeExpertMetadata),
  };
}

async function listExperts(options = {}) {
  const registry = await loadExpertRegistry(options);
  return registry.experts;
}

async function getExpertMetadata(expertId, options = {}) {
  const experts = await listExperts(options);
  const expert = experts.find((item) => item.expert_id === expertId);
  if (!expert) throw new Error(`Unknown expert_id: ${expertId}`);
  return expert;
}

async function getExpertConfig(expertId, { root = ROOT } = {}) {
  const metadata = await getExpertMetadata(expertId, { root });
  const configPath = metadata.config_path || `configs/experts/${expertId}/expert.json`;
  const config = await readJson(root, configPath);
  return {
    ...config,
    registry: metadata,
  };
}

async function getExpertVoiceProfile(expertId, { root = ROOT } = {}) {
  const metadata = await getExpertMetadata(expertId, { root });
  const voicePath = toPosix(metadata.voice_profile_path);
  if (voicePath.endsWith(".json")) {
    return {
      path: voicePath,
      profile: await readJson(root, voicePath),
    };
  }

  const candidates = [
    `${voicePath}/voice_profile.json`,
    `${voicePath}/tone_profile.json`,
    `${voicePath}/expert_phrases.json`,
  ];
  const loaded = [];
  for (const candidate of candidates) {
    if (await pathExists(root, candidate)) {
      loaded.push({
        path: candidate,
        profile: await readJson(root, candidate),
      });
    }
  }

  return {
    path: voicePath,
    profile: loaded.length ? loaded : { status: "directory_without_loaded_json", expert_id: expertId },
  };
}

async function getExpertGenerationPolicy(expertId, { root = ROOT } = {}) {
  const metadata = await getExpertMetadata(expertId, { root });
  return readJson(root, metadata.generation_policy_path);
}

async function getExpertRetrievalNamespace(expertId, { root = ROOT } = {}) {
  const config = await getExpertConfig(expertId, { root });
  return config.retrieval_namespace || config.registry?.retrieval_namespace;
}

async function getExpertFeedbackMemory(expertId, { root = ROOT } = {}) {
  const metadata = await getExpertMetadata(expertId, { root });
  const memoryPath = toPosix(metadata.feedback_memory_path);
  if (memoryPath.endsWith(".json")) {
    return {
      path: memoryPath,
      memory: await readJson(root, memoryPath),
    };
  }

  const candidates = [
    `${memoryPath}/successful_patterns.json`,
    `${memoryPath}/weak_patterns.json`,
    `${memoryPath}/retrieval_feedback.json`,
    `${memoryPath}/style_feedback.json`,
    `${memoryPath}/cta_feedback.json`,
  ];
  const loaded = [];
  for (const candidate of candidates) {
    if (await pathExists(root, candidate)) {
      loaded.push({
        path: candidate,
        memory: await readJson(root, candidate),
      });
    }
  }

  return {
    path: memoryPath,
    memory: loaded.length ? loaded : { status: "memory_directory_empty_or_missing", expert_id: expertId },
  };
}

async function resolveExpertRuntime(expertId, { root = ROOT } = {}) {
  const config = await getExpertConfig(expertId, { root });
  const runtimeConfig = config.runtime_config || {};
  const resolved = {};

  for (const key of REQUIRED_RUNTIME_CONFIG_KEYS) {
    const relativePath = runtimeConfig[key];
    resolved[key] = {
      path: relativePath,
      exists: relativePath ? await pathExists(root, relativePath) : false,
      config: relativePath ? await readJson(root, relativePath, {}) : {},
    };
  }

  return {
    expert_id: expertId,
    display_name: config.display_name,
    status: config.status,
    retrieval_namespace: config.retrieval_namespace,
    voice_profile_path: config.voice_profile_path,
    feedback_memory_path: config.feedback_memory_path,
    runtime_config: resolved,
  };
}

function addIssue(issues, severity, code, message, expertId = null) {
  issues.push({ severity, code, message, expert_id: expertId });
}

function validateRequiredFields(expert, issues) {
  for (const field of REQUIRED_EXPERT_FIELDS) {
    const value = expert[field];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
      addIssue(issues, "error", "missing_required_expert_field", `Missing required field ${field}.`, expert.expert_id || null);
    }
  }
}

function validateExpertPathScope(expert, issues) {
  const expertScopedPathFragments = [
    `configs/experts/${expert.expert_id}`,
    `expert_profiles/${expert.expert_id}`,
  ];
  const scopedFields = [
    "voice_profile_path",
    "feedback_memory_path",
    "generation_policy_path",
    "safety_policy_path",
    "style_constraints_path",
    "config_path",
    "capability_profile_path",
  ];

  for (const field of scopedFields) {
    const value = toPosix(expert[field]);
    if (!value) continue;
    const isScoped = expertScopedPathFragments.some((fragment) => value.startsWith(fragment));
    if (!isScoped) {
      addIssue(
        issues,
        "error",
        "cross_expert_path_scope",
        `${field} points outside the ${expert.expert_id} config/profile scope: ${value}`,
        expert.expert_id,
      );
    }
  }
}

function validateUniqueNamespaces(experts, issues) {
  const namespaceOwners = new Map();
  for (const expert of experts) {
    if (!expert.retrieval_namespace) continue;
    const owner = namespaceOwners.get(expert.retrieval_namespace);
    if (owner) {
      addIssue(
        issues,
        "error",
        "duplicate_retrieval_namespace",
        `Namespace ${expert.retrieval_namespace} is shared by ${owner} and ${expert.expert_id}.`,
        expert.expert_id,
      );
    }
    namespaceOwners.set(expert.retrieval_namespace, expert.expert_id);
  }
}

async function validateRuntimeFiles(expert, root, issues) {
  const configPath = expert.config_path || `configs/experts/${expert.expert_id}/expert.json`;
  if (!(await pathExists(root, configPath))) {
    addIssue(issues, "error", "missing_expert_config", `Missing expert config at ${configPath}.`, expert.expert_id);
    return;
  }

  const config = await readJson(root, configPath);
  if (config.expert_id !== expert.expert_id) {
    addIssue(issues, "error", "expert_id_mismatch", `${configPath} has expert_id=${config.expert_id}.`, expert.expert_id);
  }
  if (config.retrieval_namespace !== expert.retrieval_namespace) {
    addIssue(issues, "error", "retrieval_namespace_mismatch", `${configPath} does not match registry namespace.`, expert.expert_id);
  }

  const runtimeConfig = config.runtime_config || {};
  for (const key of REQUIRED_RUNTIME_CONFIG_KEYS) {
    const relativePath = runtimeConfig[key];
    if (!relativePath) {
      addIssue(issues, "error", "missing_runtime_config_path", `Missing runtime_config.${key}.`, expert.expert_id);
      continue;
    }
    if (!(await pathExists(root, relativePath))) {
      addIssue(issues, "error", "missing_runtime_config_file", `Missing runtime config file ${relativePath}.`, expert.expert_id);
    }
  }

  const capabilityPath = expert.capability_profile_path || `configs/experts/${expert.expert_id}/capabilities.json`;
  if (!(await pathExists(root, capabilityPath))) {
    addIssue(issues, "error", "missing_capability_profile", `Missing capability profile ${capabilityPath}.`, expert.expert_id);
  }
}

function validateRetrievalIsolation(expert, runtime, allExperts, issues) {
  const retrievalConfig = runtime.runtime_config.retrieval_settings_path?.config || {};
  if (retrievalConfig.expert_id && retrievalConfig.expert_id !== expert.expert_id) {
    addIssue(issues, "error", "retrieval_config_expert_mismatch", "Retrieval config expert_id does not match registry.", expert.expert_id);
  }
  if (retrievalConfig.retrieval_namespace !== expert.retrieval_namespace) {
    addIssue(issues, "error", "retrieval_config_namespace_mismatch", "Retrieval config namespace does not match registry.", expert.expert_id);
  }
  if (retrievalConfig.requires_namespace_filter !== true) {
    addIssue(issues, "error", "missing_namespace_filter_requirement", "Retrieval config must require namespace filtering.", expert.expert_id);
  }

  const otherNamespaces = allExperts
    .filter((item) => item.expert_id !== expert.expert_id)
    .map((item) => item.retrieval_namespace);
  const blocked = new Set(retrievalConfig.blocked_cross_expert_namespaces || []);
  const missingBlocked = otherNamespaces.filter((namespace) => !blocked.has(namespace));
  if (missingBlocked.length) {
    addIssue(
      issues,
      "warning",
      "incomplete_blocked_namespace_list",
      `Retrieval config does not explicitly block: ${missingBlocked.join(", ")}.`,
      expert.expert_id,
    );
  }
}

function validateVoiceAndFeedbackIsolation(expert, issues) {
  const voicePath = toPosix(expert.voice_profile_path);
  const feedbackPath = toPosix(expert.feedback_memory_path);
  if (voicePath && feedbackPath && voicePath === feedbackPath) {
    addIssue(issues, "error", "voice_feedback_memory_overlap", "Voice profile and feedback memory point to the same path.", expert.expert_id);
  }
  if (voicePath.includes("/template/") || feedbackPath.includes("/template/")) {
    addIssue(issues, "error", "template_runtime_path_used", "Runtime paths must not point to template folders.", expert.expert_id);
  }
}

function validatePromptAndStyleIsolation(expert, runtime, issues) {
  const generationPolicy = runtime.runtime_config.generation_settings_path?.config || {};
  const styleConstraints = runtime.runtime_config.style_settings_path?.config || {};
  const promptIsolation = generationPolicy.prompt_isolation || {};

  if (promptIsolation.forbid_shared_prompt_memory !== true) {
    addIssue(issues, "error", "shared_prompt_memory_not_forbidden", "Generation policy must forbid shared prompt memory.", expert.expert_id);
  }
  if (promptIsolation.forbid_unscoped_style_examples !== true) {
    addIssue(issues, "error", "unscoped_style_examples_not_forbidden", "Generation policy must forbid unscoped style examples.", expert.expert_id);
  }
  if (styleConstraints.forbid_cross_expert_voice_examples !== true) {
    addIssue(issues, "error", "cross_expert_voice_examples_not_forbidden", "Style constraints must forbid cross-expert voice examples.", expert.expert_id);
  }
  if (styleConstraints.style_memory_scope && !toPosix(styleConstraints.style_memory_scope).includes(expert.expert_id)) {
    addIssue(issues, "error", "style_memory_scope_mismatch", "Style memory scope must include expert_id.", expert.expert_id);
  }
}

async function validateExpertIsolation({ root = ROOT } = {}) {
  const registry = await loadExpertRegistry({ root });
  const issues = [];
  const experts = registry.experts;

  validateUniqueNamespaces(experts, issues);

  for (const expert of experts) {
    validateRequiredFields(expert, issues);
    validateExpertPathScope(expert, issues);
    validateVoiceAndFeedbackIsolation(expert, issues);
    await validateRuntimeFiles(expert, root, issues);
  }

  for (const expert of experts) {
    const runtime = await resolveExpertRuntime(expert.expert_id, { root });
    validateRetrievalIsolation(expert, runtime, experts, issues);
    validatePromptAndStyleIsolation(expert, runtime, issues);
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    expert_count: experts.length,
    active_expert_count: experts.filter((expert) => expert.status === "active").length,
    issues,
  };
}

async function buildCapabilityMatrix({ root = ROOT } = {}) {
  const experts = await listExperts({ root });
  const rows = [];
  for (const expert of experts) {
    const capabilityPath = expert.capability_profile_path || `configs/experts/${expert.expert_id}/capabilities.json`;
    rows.push({
      expert_id: expert.expert_id,
      display_name: expert.display_name,
      status: expert.status,
      capabilities: await readJson(root, capabilityPath, {}),
    });
  }
  return rows;
}

async function evaluateExpertPolicy(expertId, contentKind, { root = ROOT } = {}) {
  const generationPolicy = await getExpertGenerationPolicy(expertId, { root });
  const safetyPolicy = await readJson(root, generationPolicy.safety_policy_path || `configs/experts/${expertId}/safety-policy.json`, {});
  const allowed = (generationPolicy.allowed_content_kinds || []).includes(contentKind);
  const forbidden = (generationPolicy.forbidden_content_kinds || []).includes(contentKind)
    || (safetyPolicy.forbidden_claims || []).includes(contentKind);
  return {
    expert_id: expertId,
    content_kind: contentKind,
    allowed: allowed && !forbidden,
    reason: forbidden ? "content_kind_forbidden_by_policy" : allowed ? "content_kind_allowed" : "content_kind_not_declared",
  };
}

async function main() {
  const validation = await validateExpertIsolation({ root: ROOT });
  const experts = await listExperts({ root: ROOT });
  const matrix = await buildCapabilityMatrix({ root: ROOT });
  console.log(`Experts registered: ${experts.length}`);
  console.log(`Active experts: ${validation.active_expert_count}`);
  console.log(`Isolation validation: ${validation.ok ? "passed" : "failed"}`);
  console.log("\nRegistered expert namespaces:");
  for (const expert of experts) {
    console.log(`- ${expert.expert_id}: ${expert.retrieval_namespace}`);
  }
  console.log("\nCapability matrix preview:");
  for (const row of matrix) {
    console.log(`- ${row.expert_id}: storytelling=${row.capabilities.supports_storytelling}, reels=${row.capabilities.supports_reels_scripts}, cta=${row.capabilities.supports_cta_generation}`);
  }
  console.log("\nWarnings/errors:");
  if (!validation.issues.length) {
    console.log("none");
  } else {
    for (const issue of validation.issues) {
      console.log(`- [${issue.severity}] ${issue.expert_id || "registry"} ${issue.code}: ${issue.message}`);
    }
  }
  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram runtime changes, no OpenAI fine-tuning.");
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_REGISTRY_PATH,
  REQUIRED_EXPERT_FIELDS,
  buildCapabilityMatrix,
  evaluateExpertPolicy,
  getExpertConfig,
  getExpertFeedbackMemory,
  getExpertGenerationPolicy,
  getExpertMetadata,
  getExpertRetrievalNamespace,
  getExpertVoiceProfile,
  listExperts,
  loadExpertRegistry,
  resolveExpertRuntime,
  validateExpertIsolation,
};
