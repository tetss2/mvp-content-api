import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { basename, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import {
  addFileItem,
  addTextItem,
  addUrlItem,
  canUseKnowledgeIntake,
  createIntakeSession,
  getActiveIntakeSession,
  getTargetLabel,
  isUrlText,
  setSessionStatus,
  summarizeSession,
} from "./knowledge-intake.js";
import { retrieveGroundingContext } from "./retrieval_service.js";
import { buildSexologistPrompt, normalizeSexologistStyleKey, SEXOLOGIST_STYLE_META } from "./sexologist_prompt.js";
import { buildAuthorVoicePrompt, loadAuthorVoiceProfile, logAuthorVoiceStatus } from "./author_voice.js";
import { getLengthConfig } from "./generation_config.js";
import { runRuntimeGenerationAdapter } from "./scripts/runtime-generation-adapter.js";
import {
  ONBOARDING_ROLES,
  analyzeOnboardingMaterial,
  buildUserScenarioContext,
  createUserScenario,
  ensureUserExpertFolders,
  generatePersonaDrafts,
  getUserRoot,
  getOnboardingInventory,
  loadUserProfile,
  loadUserScenario,
  listUserScenarios,
  saveUserProfile,
  storeOnboardingFile,
  storeOnboardingText,
  userHasCompletedExpert,
} from "./expert-onboarding.js";
let ffmpegPath = "ffmpeg";
let ffmpegAvailable = false;
try {
  ffmpegPath = execSync(process.platform === "win32" ? "where ffmpeg" : "which ffmpeg", { stdio: ["ignore", "pipe", "ignore"] }).toString().split(/\r?\n/)[0].trim();
  ffmpegAvailable = true;
  console.log("ffmpeg available");
} catch(e) {
  console.warn("ffmpeg not found; audio mixing will fall back to voice-only:", e.message);
}
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegPath);

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const NODE_ENV = process.env.NODE_ENV || "development";
const RUNTIME_MODE = (process.env.RUNTIME_MODE || process.env.APP_ENV || (NODE_ENV === "production" ? "production" : "development")).toLowerCase();
const IS_BETA_RUNTIME = ["beta", "demo", "staging", "railway-beta"].includes(RUNTIME_MODE);
const RUNTIME_NAME = process.env.RUNTIME_NAME || (IS_BETA_RUNTIME ? "mvp-content-api-beta" : "mvp-content-api");
const RUNTIME_DATA_ROOT = process.env.RUNTIME_DATA_ROOT || (IS_BETA_RUNTIME ? join(__dirname, "runtime-data", "beta") : __dirname);
const TELEGRAM_TOKEN_SOURCE = IS_BETA_RUNTIME
  ? "TELEGRAM_BETA_TOKEN"
  : (process.env.TELEGRAM_TOKEN ? "TELEGRAM_TOKEN" : (process.env.TELEGRAM_BETA_TOKEN ? "TELEGRAM_BETA_TOKEN" : null));
const TELEGRAM_TOKEN = TELEGRAM_TOKEN_SOURCE ? process.env[TELEGRAM_TOKEN_SOURCE] : null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const FAL_KEY = process.env.FALAI_KEY;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const LEADS_BOT_TOKEN = process.env.LEADS_BOT_TOKEN;
const TG_CHANNEL = process.env.TG_CHANNEL; // chat_id канала, напр. -1001234567890
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY;
const ADMIN_TG_ID = 109664871;
const IS_PRODUCTION = NODE_ENV === "production";
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true" || (!IS_PRODUCTION && process.env.DEBUG_LOGS !== "false");
const TELEGRAM_POLLING_ENABLED = process.env.TELEGRAM_POLLING !== "false";
const MAIN_BOT_ENABLED = TELEGRAM_POLLING_ENABLED && Boolean(TELEGRAM_TOKEN);
const LEADS_BOT_REQUESTED = process.env.START_LEADS_BOT === "true";
const LEADS_BOT_ENABLED = LEADS_BOT_REQUESTED && Boolean(LEADS_BOT_TOKEN);
const TELEGRAM_STARS_ENABLED = process.env.TELEGRAM_STARS_ENABLED === "true";
const TELEGRAM_STARS_PROVIDER_TOKEN = process.env.TELEGRAM_STARS_PROVIDER_TOKEN || "";
const BETA_PACK_STARS_PRICE_SOURCE = process.env.BETA_PACK_STARS_PRICE ? "env" : "default";
const BETA_PACK_STARS_PRICE = Number(process.env.BETA_PACK_STARS_PRICE || 149);
const TELEGRAM_STARS_CURRENCY = "XTR";
const TELEGRAM_STARS_PROVIDER_TOKEN_REQUIRED = false;
const TELEGRAM_STARS_CHECKOUT_READY = TELEGRAM_STARS_ENABLED && TELEGRAM_STARS_CURRENCY === "XTR";
const STARTUP_WARNINGS = [];
const POLLING_LOCK_PATH = process.env.POLLING_LOCK_PATH || join(RUNTIME_DATA_ROOT, "telegram-polling.lock");
const POLLING_LOCK_STALE_MS = Number(process.env.POLLING_LOCK_STALE_MS || 120000);
const POLLING_RETRY_MS = Number(process.env.POLLING_RETRY_MS || 30000);
const POLLING_CONFLICT_RETRY_MS = Number(process.env.POLLING_CONFLICT_RETRY_MS || 8000);
const POLLING_MAX_RETRIES = Number(process.env.POLLING_MAX_RETRIES || 3);
const IS_CLOUD_RUNTIME = IS_BETA_RUNTIME || IS_PRODUCTION || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
const POLLING_STARTUP_DELAY_MS = Number(process.env.POLLING_STARTUP_DELAY_MS || (IS_CLOUD_RUNTIME ? 4000 : 0));
const ENTITLEMENTS_PATH = process.env.ENTITLEMENTS_PATH || join(RUNTIME_DATA_ROOT, "entitlements.json");
const PAYMENT_EVENTS_PATH = process.env.PAYMENT_EVENTS_PATH || join(RUNTIME_DATA_ROOT, "payment_events.jsonl");
const EXPERTS_RUNTIME_PATH = process.env.EXPERTS_RUNTIME_PATH || join(__dirname, "runtime_data", "experts.json");
const MEDIA_PROFILES_RUNTIME_PATH = process.env.MEDIA_PROFILES_RUNTIME_PATH || join(__dirname, "runtime_data", "media_profiles.json");

const PAID_BETA_PLANS = {
  demo: {
    plan: "demo",
    generationLimit: Number(process.env.PAID_BETA_DEMO_GENERATION_LIMIT || 2),
    days: null,
  },
  beta_paid: {
    plan: "beta_paid",
    generationLimit: Number(process.env.PAID_BETA_GENERATION_LIMIT || 50),
    days: Number(process.env.PAID_BETA_DEFAULT_DAYS || 30),
  },
  admin: {
    plan: "admin",
    generationLimit: Number(process.env.PAID_BETA_ADMIN_GENERATION_LIMIT || 1000000),
    days: null,
  },
};

process.env.RUNTIME_DATA_ROOT = RUNTIME_DATA_ROOT;
if (!process.env.USERS_ROOT) process.env.USERS_ROOT = join(RUNTIME_DATA_ROOT, "users");

function safeLogValue(value) {
  if (value === undefined || value === null || value === "") return value;
  const text = String(value);
  if (text.length <= 10) return "[set]";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function tokenPresenceReport() {
  return {
    TELEGRAM_BETA_TOKEN: {
      present: Boolean(process.env.TELEGRAM_BETA_TOKEN),
      fingerprint: safeLogValue(process.env.TELEGRAM_BETA_TOKEN),
    },
    TELEGRAM_BOT_TOKEN: {
      present: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      fingerprint: safeLogValue(process.env.TELEGRAM_BOT_TOKEN),
    },
    TELEGRAM_TOKEN: {
      present: Boolean(process.env.TELEGRAM_TOKEN),
      fingerprint: safeLogValue(process.env.TELEGRAM_TOKEN),
    },
    BOT_TOKEN: {
      present: Boolean(process.env.BOT_TOKEN),
      fingerprint: safeLogValue(process.env.BOT_TOKEN),
    },
    LEADS_BOT_TOKEN: {
      present: Boolean(process.env.LEADS_BOT_TOKEN),
      fingerprint: safeLogValue(process.env.LEADS_BOT_TOKEN),
    },
  };
}

function runtimeLog(...args) {
  console.log(`[${RUNTIME_NAME}]`, ...args);
}

function debugLog(...args) {
  if (DEBUG_LOGS) console.log(`[${RUNTIME_NAME}:debug]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRuntimeDirectory(path, label = "directory") {
  const created = await fs.mkdir(path, { recursive: true });
  if (created) runtimeLog("directory initialized", { label, path });
  return path;
}

function isProcessRunning(pid) {
  if (!pid || Number(pid) === process.pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function readPollingLock() {
  try {
    const raw = await fs.readFile(POLLING_LOCK_PATH, "utf-8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

async function acquirePollingLock() {
  await ensureRuntimeDirectory(dirname(POLLING_LOCK_PATH), "polling lock directory");
  const current = await readPollingLock();
  if (current?.pid && isProcessRunning(current.pid)) {
    runtimeLog("polling already active", { pid: current.pid, lockPath: POLLING_LOCK_PATH });
    return false;
  }
  if (current?.acquiredAt && Date.now() - Date.parse(current.acquiredAt) < POLLING_LOCK_STALE_MS) {
    runtimeLog("polling already active", { lockPath: POLLING_LOCK_PATH, acquiredAt: current.acquiredAt });
    return false;
  }
  if (current) await fs.rm(POLLING_LOCK_PATH, { force: true });

  const lock = {
    pid: process.pid,
    runtimeName: RUNTIME_NAME,
    runtimeMode: RUNTIME_MODE,
    acquiredAt: new Date().toISOString(),
  };
  try {
    const handle = await fs.open(POLLING_LOCK_PATH, "wx");
    await handle.writeFile(JSON.stringify(lock, null, 2), "utf-8");
    await handle.close();
    runtimeLog("polling instance acquired", { pid: process.pid, lockPath: POLLING_LOCK_PATH });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") {
      runtimeLog("polling already active", { lockPath: POLLING_LOCK_PATH });
      return false;
    }
    throw error;
  }
}

async function releasePollingLock() {
  const current = await readPollingLock();
  if (!current || Number(current.pid) !== process.pid) return;
  await fs.rm(POLLING_LOCK_PATH, { force: true }).catch(() => {});
}

async function readJsonFileSafe(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf-8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`[${RUNTIME_NAME}] JSON read failed, using fallback: ${error.message}`);
    }
    return fallback;
  }
}

async function writeJsonFileSafe(path, value) {
  await ensureRuntimeDirectory(dirname(path), "runtime json directory");
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, path);
}

const DEFAULT_RUNTIME_EXPERT = Object.freeze({
  expertId: "dinara",
  displayName: "Динара",
  knowledgeBase: "psychologist",
  styleProfile: "dinara_style",
  status: "active",
});

const DEFAULT_MEDIA_PROFILE = Object.freeze({
  expertId: "dinara",
  voiceProfileId: null,
  imageAvatarProfileId: null,
  videoAvatarProfileId: null,
  status: "draft",
  updatedAt: "2026-05-15T00:00:00.000Z",
});

function normalizeRuntimeExpert(expert = {}) {
  return {
    expertId: String(expert.expertId || DEFAULT_RUNTIME_EXPERT.expertId),
    displayName: expert.displayName || DEFAULT_RUNTIME_EXPERT.displayName,
    knowledgeBase: expert.knowledgeBase || DEFAULT_RUNTIME_EXPERT.knowledgeBase,
    styleProfile: expert.styleProfile || DEFAULT_RUNTIME_EXPERT.styleProfile,
    status: expert.status || DEFAULT_RUNTIME_EXPERT.status,
    createdAt: expert.createdAt || new Date().toISOString(),
  };
}

function normalizeExpertRegistry(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeRuntimeExpert);
  if (Array.isArray(raw?.experts)) return raw.experts.map(normalizeRuntimeExpert);
  if (raw && typeof raw === "object" && raw.expertId) return [normalizeRuntimeExpert(raw)];
  return [normalizeRuntimeExpert()];
}

function normalizeMediaProfile(profile = {}) {
  return {
    expertId: String(profile.expertId || DEFAULT_MEDIA_PROFILE.expertId),
    voiceProfileId: profile.voiceProfileId || null,
    imageAvatarProfileId: profile.imageAvatarProfileId || null,
    videoAvatarProfileId: profile.videoAvatarProfileId || null,
    status: profile.status || DEFAULT_MEDIA_PROFILE.status,
    updatedAt: profile.updatedAt || DEFAULT_MEDIA_PROFILE.updatedAt,
  };
}

function normalizeMediaProfileRegistry(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeMediaProfile);
  if (Array.isArray(raw?.profiles)) return raw.profiles.map(normalizeMediaProfile);
  if (raw && typeof raw === "object" && raw.expertId) return [normalizeMediaProfile(raw)];
  return [normalizeMediaProfile()];
}

async function loadExpertRegistry() {
  const raw = await readJsonFileSafe(EXPERTS_RUNTIME_PATH, null);
  return normalizeExpertRegistry(raw);
}

async function loadMediaProfileRegistry() {
  const raw = await readJsonFileSafe(MEDIA_PROFILES_RUNTIME_PATH, null);
  return normalizeMediaProfileRegistry(raw);
}

async function ensureExpertRegistry() {
  const existed = await fileExists(EXPERTS_RUNTIME_PATH);
  const experts = await loadExpertRegistry();
  const activeExperts = experts.filter((expert) => expert.status === "active");
  if (!existed) {
    await writeJsonFileSafe(EXPERTS_RUNTIME_PATH, experts[0] || normalizeRuntimeExpert());
  }
  runtimeLog("expert registry ready", {
    path: EXPERTS_RUNTIME_PATH,
    fileCreated: !existed,
    totalExperts: experts.length,
    activeExperts: activeExperts.length,
    defaultExpertId: activeExperts[0]?.expertId || experts[0]?.expertId || DEFAULT_RUNTIME_EXPERT.expertId,
  });
  return experts;
}

function getDefaultMediaProfile() {
  return normalizeMediaProfile();
}

async function getMediaProfileForExpert(expertId) {
  const profiles = await loadMediaProfileRegistry();
  return profiles.find((profile) => profile.expertId === expertId) || getDefaultMediaProfile();
}

function cloudinaryAudioReady() {
  return Boolean(CLOUDINARY_CLOUD && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

function getActiveExpertIdForChat(chatId) {
  const state = chatId ? (userState.get(chatId) || {}) : {};
  return state.lastExpertId || state.activeExpertId || process.env.DEFAULT_EXPERT_ID || DEFAULT_RUNTIME_EXPERT.expertId;
}

async function getVoiceReadiness(chatId) {
  const expertId = getActiveExpertIdForChat(chatId);
  const mediaProfile = await getMediaProfileForExpert(expertId);
  const voiceProfileId = mediaProfile.voiceProfileId || FISH_AUDIO_VOICE_ID || null;
  return {
    enabled: Boolean(FISH_AUDIO_API_KEY && voiceProfileId),
    expertId,
    fishAudioKeyPresent: Boolean(FISH_AUDIO_API_KEY),
    voiceProfileIdPresent: Boolean(voiceProfileId),
    voiceProfileSource: mediaProfile.voiceProfileId ? "media_profile" : (FISH_AUDIO_VOICE_ID ? "env" : "missing"),
    cloudinaryPresent: cloudinaryAudioReady(),
    ffmpegRequired: true,
    ffmpegPresent: ffmpegAvailable,
    voiceProfileId,
  };
}

async function getImageReadiness(chatId) {
  const expertId = getActiveExpertIdForChat(chatId);
  const mediaProfile = await getMediaProfileForExpert(expertId);
  const imageAvatarProfileId = mediaProfile.imageAvatarProfileId || null;
  const loraUrl = imageAvatarProfileId || LORA_URL;
  return {
    enabled: Boolean(FAL_KEY && loraUrl),
    expertId,
    falKeyPresent: Boolean(FAL_KEY),
    mediaProfileStatus: mediaProfile.status || "unknown",
    imageAvatarProfileIdPresent: Boolean(imageAvatarProfileId),
    imageAvatarProfileSource: imageAvatarProfileId ? "media_profile" : "built_in_dinara_lora",
    loraUrlPresent: Boolean(loraUrl),
    loraUrl,
    modelEndpoint: "fal-ai/flux-lora",
    imageSize: "square_hd",
  };
}

async function getVideoReadiness(chatId) {
  const voice = await getVoiceReadiness(chatId);
  const image = await getImageReadiness(chatId);
  const mediaProfile = await getMediaProfileForExpert(voice.expertId);
  return {
    enabled: Boolean(FAL_KEY && cloudinaryAudioReady() && FISH_AUDIO_API_KEY && voice.voiceProfileId && image.loraUrl),
    expertId: voice.expertId,
    falKeyPresent: Boolean(FAL_KEY),
    cloudinaryPresent: cloudinaryAudioReady(),
    fishAudioKeyPresent: Boolean(FISH_AUDIO_API_KEY),
    voiceProfileIdPresent: Boolean(voice.voiceProfileId),
    voiceProfileSource: voice.voiceProfileSource,
    imageAvatarProfileIdPresent: image.imageAvatarProfileIdPresent,
    imageAvatarProfileSource: image.imageAvatarProfileSource,
    loraUrlPresent: image.loraUrlPresent,
    videoAvatarProfileIdPresent: Boolean(mediaProfile.videoAvatarProfileId),
    modelEndpoint: "fal-ai/creatify/aurora",
    imageModelEndpoint: image.modelEndpoint,
    imageSize: image.imageSize,
    audioBridge: "Cloudinary video/upload",
    loraUrl: image.loraUrl,
    voiceProfileId: voice.voiceProfileId,
  };
}

async function guardConfiguredVoiceGeneration(chatId) {
  const readiness = await getVoiceReadiness(chatId);
  if (readiness.enabled) return readiness;
  await bot.sendMessage(chatId, "Voice generation is not configured yet.");
  return null;
}

function buildVoiceReadinessMissingText(readiness) {
  const missing = [];
  if (!readiness.fishAudioKeyPresent) missing.push("FISH_AUDIO_API_KEY");
  if (!readiness.voiceProfileIdPresent) missing.push("voiceProfileId в runtime_data/media_profiles.json или FISH_AUDIO_VOICE_ID");
  if (!missing.length) return null;
  return [
    "Голос Динары пока не настроен.",
    "",
    `Не хватает: ${missing.join(", ")}.`,
    "",
    "Cloudinary и ffmpeg для /test_voice не обязательны: они нужны для видео-аудио URL и микса с музыкой.",
  ].join("\n");
}

function formatVoiceGenerationError(error) {
  const raw = String(error?.message || error || "unknown error").trim();
  if (!raw) return "Неизвестная ошибка Fish Audio.";
  if (raw.includes("Voice generation is not configured")) return raw;
  if (raw.includes("Fish Audio error:")) return raw.slice(0, 900);
  return `Fish Audio не смог сгенерировать голос: ${raw.slice(0, 900)}`;
}

function buildImageReadinessMissingText(readiness) {
  const missing = [];
  if (!readiness.falKeyPresent) missing.push("FALAI_KEY");
  if (!readiness.loraUrlPresent) missing.push("Dinara LoRA URL или imageAvatarProfileId в runtime_data/media_profiles.json");
  if (!missing.length) return null;
  return [
    "Генерация изображения Динары пока не настроена.",
    "",
    `Не хватает: ${missing.join(", ")}.`,
    "",
    "Для /test_image нужен только FALAI_KEY и существующий Dinara LoRA/profile.",
  ].join("\n");
}

function formatImageGenerationError(error) {
  const raw = String(error?.message || error || "unknown error").trim();
  if (!raw) return "Неизвестная ошибка FAL.ai.";
  if (raw.includes("fal photo error")) return raw.slice(0, 900);
  return `FAL.ai не смог сгенерировать изображение: ${raw.slice(0, 900)}`;
}

function buildVideoReadinessMissingText(readiness) {
  const missing = [];
  if (!readiness.falKeyPresent) missing.push("FALAI_KEY");
  if (!readiness.cloudinaryPresent) missing.push("CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
  if (!readiness.fishAudioKeyPresent) missing.push("FISH_AUDIO_API_KEY");
  if (!readiness.voiceProfileIdPresent) missing.push("voiceProfileId в runtime_data/media_profiles.json или FISH_AUDIO_VOICE_ID");
  if (!readiness.loraUrlPresent) missing.push("Dinara LoRA URL или imageAvatarProfileId в runtime_data/media_profiles.json");
  if (!missing.length) return null;
  return [
    "Видео Динары пока не настроено.",
    "",
    `Не хватает: ${missing.join(", ")}.`,
    "",
    "Для /test_video нужны изображение, mp3 и публичный audio URL через Cloudinary.",
  ].join("\n");
}

function formatVideoGenerationError(error) {
  const raw = String(error?.message || error || "unknown error").trim();
  if (!raw) return "Неизвестная ошибка генерации видео.";
  if (raw.includes("Cloudinary")) return raw.slice(0, 900);
  if (raw.includes("Aurora")) return raw.slice(0, 900);
  if (raw.includes("Fish Audio")) return raw.slice(0, 900);
  if (raw.includes("fal photo error")) return raw.slice(0, 900);
  return `Видео не удалось сгенерировать: ${raw.slice(0, 900)}`;
}

async function getExpertById(expertId) {
  const experts = await loadExpertRegistry();
  return experts.find((expert) => expert.expertId === expertId) || null;
}

async function listActiveExperts() {
  const experts = await loadExpertRegistry();
  return experts.filter((expert) => expert.status === "active");
}

async function getDefaultExpert() {
  const activeExperts = await listActiveExperts();
  return activeExperts[0] || normalizeRuntimeExpert();
}

function buildExpertIsolationFoundation(expert) {
  const expertId = expert?.expertId || DEFAULT_RUNTIME_EXPERT.expertId;
  return {
    expertId,
    embeddingNamespace: expertId,
    retrievalConfigId: expert?.knowledgeBase || DEFAULT_RUNTIME_EXPERT.knowledgeBase,
    authorProfileId: expert?.styleProfile || DEFAULT_RUNTIME_EXPERT.styleProfile,
    embeddingsPath: join("knowledge_indexes", expert?.knowledgeBase || DEFAULT_RUNTIME_EXPERT.knowledgeBase, "production", "current"),
    authorProfilePath: join("author_profiles", expertId),
  };
}

async function resolveGenerationOwnership(chatId, scenario, styleKey = "auto") {
  const state = chatId ? (userState.get(chatId) || {}) : {};
  const expertId = state.activeExpertId || process.env.DEFAULT_EXPERT_ID || DEFAULT_RUNTIME_EXPERT.expertId;
  const expert = await getExpertById(expertId) || await getDefaultExpert();
  const knowledgeBase = scenario === "sexologist"
    ? "sexologist"
    : scenario === "psychologist"
      ? expert.knowledgeBase || DEFAULT_RUNTIME_EXPERT.knowledgeBase
      : scenario || expert.knowledgeBase || DEFAULT_RUNTIME_EXPERT.knowledgeBase;
  const styleProfile = scenario === "sexologist"
    ? `sexologist:${normalizeSexologistStyleKey(styleKey)}`
    : expert.styleProfile || DEFAULT_RUNTIME_EXPERT.styleProfile;
  return {
    expertId: expert.expertId,
    displayName: expert.displayName,
    knowledgeBase,
    styleProfile,
    registryStatus: expert.status,
    isolation: buildExpertIsolationFoundation({ ...expert, knowledgeBase, styleProfile }),
  };
}

async function appendJsonlSafe(path, value) {
  await ensureRuntimeDirectory(dirname(path), "runtime jsonl directory");
  await fs.appendFile(path, `${JSON.stringify(value)}\n`, "utf-8");
}

async function ensurePaidBetaStorage() {
  await ensureRuntimeDirectory(dirname(ENTITLEMENTS_PATH), "paid beta storage");
  const entitlementsExisted = await fileExists(ENTITLEMENTS_PATH);
  const paymentEventsExisted = await fileExists(PAYMENT_EVENTS_PATH);
  if (!entitlementsExisted) await writeJsonFileSafe(ENTITLEMENTS_PATH, { users: {} });
  if (!paymentEventsExisted) await fs.writeFile(PAYMENT_EVENTS_PATH, "", "utf-8");
  runtimeLog("paid beta access layer enabled", {
    entitlementsFileExists: await fileExists(ENTITLEMENTS_PATH),
    paymentEventsFileExists: await fileExists(PAYMENT_EVENTS_PATH),
  });
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing required env var: ${name}`);
}

function warnOptionalEnv(name, feature) {
  if (!process.env[name]) STARTUP_WARNINGS.push(`${name} missing; ${feature} disabled or degraded.`);
}

function validateRuntimeEnv() {
  if (IS_BETA_RUNTIME) {
    requireEnv("TELEGRAM_BETA_TOKEN");
    if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN === process.env.TELEGRAM_BETA_TOKEN) {
      STARTUP_WARNINGS.push("TELEGRAM_TOKEN and TELEGRAM_BETA_TOKEN are identical; beta should use a separate Telegram bot token.");
    }
  } else {
    requireEnv("TELEGRAM_TOKEN");
  }
  requireEnv("OPENAI_API_KEY");
  warnOptionalEnv("SUPABASE_URL", "vector retrieval");
  warnOptionalEnv("SUPABASE_ANON_KEY", "vector retrieval");
  warnOptionalEnv("FISH_AUDIO_API_KEY", "voice generation");
  warnOptionalEnv("FISH_AUDIO_VOICE_ID", "voice generation");
  warnOptionalEnv("FALAI_KEY", "photo/video generation");
  warnOptionalEnv("CLOUDINARY_CLOUD", "video audio hosting");
  warnOptionalEnv("CLOUDINARY_API_KEY", "video audio hosting");
  warnOptionalEnv("CLOUDINARY_API_SECRET", "video audio hosting");
  if (TELEGRAM_STARS_ENABLED && TELEGRAM_STARS_PROVIDER_TOKEN) {
    STARTUP_WARNINGS.push("TELEGRAM_STARS_PROVIDER_TOKEN is ignored for XTR payments; Telegram Stars invoices use an empty provider token.");
  }
}

validateRuntimeEnv();
await ensureRuntimeDirectory(RUNTIME_DATA_ROOT, "runtime data root");
await Promise.all([
  ensureRuntimeDirectory(join(RUNTIME_DATA_ROOT, "reports", "beta-telemetry"), "beta telemetry"),
  ensureRuntimeDirectory(join(RUNTIME_DATA_ROOT, "reports", "runtime-preview"), "runtime preview"),
  ensureRuntimeDirectory(join(RUNTIME_DATA_ROOT, "users"), "users root"),
  ensureRuntimeDirectory(join(RUNTIME_DATA_ROOT, "feedback_reports"), "feedback reports"),
]);
await ensureExpertRegistry();
await ensurePaidBetaStorage();

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let pollingActive = false;
let pollingConflictHandled = false;
let pollingRetryCount = 0;
let pollingRetryTimer = null;

bot.on("polling_error", (error) => {
  const message = error?.response?.body?.description || error?.message || String(error);
  if (message.includes("409")) {
    runtimeLog("polling conflict detected", { reason: "telegram_conflict_409" });
    if (!pollingConflictHandled) {
      pollingConflictHandled = true;
      bot.stopPolling()
        .catch(() => {})
        .finally(async () => {
          pollingActive = false;
          globalThis.__MVP_CONTENT_API_POLLING_ACTIVE__ = false;
          await releasePollingLock();
          runtimeLog("polling disabled", { reason: "telegram_conflict_409" });
          schedulePollingRetry("telegram_conflict_409");
        });
    }
    return;
  }
  console.error(`[${RUNTIME_NAME}] Telegram polling error:`, message);
});

async function initializeMainPolling() {
  if (!TELEGRAM_POLLING_ENABLED || !MAIN_BOT_ENABLED) {
    runtimeLog("polling disabled", {
      requested: TELEGRAM_POLLING_ENABLED,
      tokenPresent: Boolean(TELEGRAM_TOKEN),
    });
    return;
  }
  runtimeLog("polling enabled", { token: TELEGRAM_TOKEN_SOURCE, tokenFingerprint: safeLogValue(TELEGRAM_TOKEN) });
  if (globalThis.__MVP_CONTENT_API_POLLING_ACTIVE__) {
    runtimeLog("polling already active", { scope: "process" });
    return;
  }
  const acquired = await acquirePollingLock();
  if (!acquired) {
    runtimeLog("polling disabled", { reason: "lock_not_acquired" });
    schedulePollingRetry("lock_not_acquired");
    return;
  }
  globalThis.__MVP_CONTENT_API_POLLING_ACTIVE__ = true;
  try {
    await prepareTelegramPollingStartup();
    await bot.startPolling();
    pollingActive = true;
    pollingConflictHandled = false;
    pollingRetryCount = 0;
    runtimeLog("Polling initialized");
    runtimeLog("Polling active", { pid: process.pid });
  } catch (error) {
    globalThis.__MVP_CONTENT_API_POLLING_ACTIVE__ = false;
    pollingActive = false;
    await releasePollingLock();
    if (String(error?.message || error).includes("409")) {
      pollingConflictHandled = true;
      runtimeLog("polling conflict detected", { reason: "telegram_conflict_409" });
      runtimeLog("polling disabled", { reason: "telegram_conflict_409" });
      schedulePollingRetry("telegram_conflict_409");
      return;
    }
    throw error;
  }
}

async function prepareTelegramPollingStartup() {
  try {
    await bot.deleteWebHook({ drop_pending_updates: true });
    runtimeLog("telegram webhook cleanup complete", { dropPendingUpdates: true });
  } catch (error) {
    console.warn(`[${RUNTIME_NAME}] telegram webhook cleanup failed; continuing with polling startup: ${error?.message || error}`);
  }
  if (POLLING_STARTUP_DELAY_MS > 0) {
    runtimeLog("waiting before polling startup", { delayMs: POLLING_STARTUP_DELAY_MS });
    await sleep(POLLING_STARTUP_DELAY_MS);
  }
}

function schedulePollingRetry(reason) {
  if (!TELEGRAM_POLLING_ENABLED || !MAIN_BOT_ENABLED || pollingRetryTimer) return;
  if (pollingRetryCount >= POLLING_MAX_RETRIES) {
    runtimeLog("polling disabled", { reason, retriesExhausted: true });
    return;
  }
  pollingRetryCount += 1;
  const delayMs = reason === "telegram_conflict_409" ? POLLING_CONFLICT_RETRY_MS : POLLING_RETRY_MS;
  runtimeLog("waiting before retry", { reason, delayMs, attempt: pollingRetryCount });
  pollingRetryTimer = setTimeout(() => {
    pollingRetryTimer = null;
    runtimeLog("retry attempt", { reason, attempt: pollingRetryCount });
    initializeMainPolling().catch((error) => {
      console.error(`[${RUNTIME_NAME}] polling retry failed:`, error?.message || error);
    });
  }, delayMs);
  pollingRetryTimer.unref?.();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    if (pollingActive) await bot.stopPolling().catch(() => {});
    await releasePollingLock();
    process.exit(0);
  });
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

runtimeLog(`Bot started`, {
  nodeEnv: NODE_ENV,
  runtimeMode: RUNTIME_MODE,
  mainBotEnabled: MAIN_BOT_ENABLED,
  polling: TELEGRAM_POLLING_ENABLED,
  dataRoot: RUNTIME_DATA_ROOT,
  usersRoot: process.env.USERS_ROOT,
  expertsRegistry: EXPERTS_RUNTIME_PATH,
  telegramTokenPresent: Boolean(process.env.TELEGRAM_TOKEN),
  telegramBetaTokenPresent: Boolean(process.env.TELEGRAM_BETA_TOKEN),
  selectedTelegramToken: TELEGRAM_TOKEN_SOURCE,
  selectedTelegramTokenFingerprint: safeLogValue(TELEGRAM_TOKEN),
  tokenEnv: tokenPresenceReport(),
});
runtimeLog("Feature readiness:", {
  supabase: Boolean(supabase),
  leadsBotEnabled: LEADS_BOT_ENABLED,
  leadsBotRequested: LEADS_BOT_REQUESTED,
  leadsBotTokenPresent: Boolean(LEADS_BOT_TOKEN),
  publishChannel: Boolean(TG_CHANNEL),
  fishAudio: Boolean(FISH_AUDIO_API_KEY && FISH_AUDIO_VOICE_ID),
  ffmpeg: ffmpegAvailable,
  fal: Boolean(FAL_KEY),
  cloudinary: Boolean(CLOUDINARY_CLOUD && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET),
  telegramStars: TELEGRAM_STARS_ENABLED,
  starsCheckoutReady: TELEGRAM_STARS_CHECKOUT_READY,
  starsProviderTokenRequired: TELEGRAM_STARS_PROVIDER_TOKEN_REQUIRED,
  betaPackStarsPrice: BETA_PACK_STARS_PRICE,
  betaPackStarsPriceSource: BETA_PACK_STARS_PRICE_SOURCE,
});
for (const warning of STARTUP_WARNINGS) console.warn(`[startup] ${warning}`);

// ─── ДЕМО-ДОСТУП ─────────────────────────────────────────────────────────────

const DEMO_DB_PATH = process.env.DEMO_DB_PATH || join(RUNTIME_DATA_ROOT, "demo-users.json");
const BETA_TELEMETRY_DIR = process.env.BETA_TELEMETRY_DIR || join(RUNTIME_DATA_ROOT, "reports", "beta-telemetry");

const BETA_EVENT_NAMES = {
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
  FIRST_GENERATION: "first_generation",
  GENERATION_COMPLETED: "generation_completed",
  REGENERATION_USED: "regeneration_used",
  UPLOAD_RECEIVED: "upload_received",
  UPLOAD_REJECTED: "upload_rejected",
  DEMO_STARTED: "demo_started",
  DEMO_CONVERTED: "demo_conversion",
  SCENARIO_CREATED: "scenario_creation",
  GENERATION_EXHAUSTED: "generation_exhausted",
  UPGRADE_PROMPT_SHOWN: "upgrade_prompt_shown",
  STARS_UPGRADE_CLICKED: "stars_upgrade_clicked",
  PAID_GENERATION_PLACEHOLDER: "paid_generation_placeholder",
  COST_RECORDED: "cost_recorded",
};

const COST_ESTIMATES_USD = {
  text_short: 0.002,
  text_normal: 0.004,
  text_long: 0.007,
  image: 0.035,
  video: 1.47,
  audio_char: 0.000008,
  cloudinary_upload: 0,
  audio_mix: 0,
};

async function loadDemoDB() {
  try {
    const raw = await fs.readFile(DEMO_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch { return { users: {} }; }
}

async function saveDemoDB(db) {
  await fs.mkdir(dirname(DEMO_DB_PATH), { recursive: true });
  await fs.writeFile(DEMO_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

async function getDemoUserByTgId(tgId) {
  const db = await loadDemoDB();
  return Object.values(db.users).find(u => u.tg_id === tgId) || null;
}

async function checkDemoAccess(chatId) {
  if (chatId === ADMIN_TG_ID) return { allowed: true, user: null };
  if (await userHasCompletedExpert(chatId)) return { allowed: true, user: null };
  const user = await getDemoUserByTgId(chatId);
  if (!user) return { allowed: false, reason: "not_registered" };

  const now = new Date();

  if (!user.activated_at) {
    const db = await loadDemoDB();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    db.users[user.phone].activated_at = now.toISOString();
    db.users[user.phone].expires_at = expires.toISOString();
    await saveDemoDB(db);
    user.activated_at = now.toISOString();
    user.expires_at = expires.toISOString();
  }

  if (user.expires_at && new Date(user.expires_at) < now) {
    return { allowed: false, reason: "expired", user };
  }

  return { allowed: true, user };
}

async function checkLimit(chatId, limitType) {
  const access = await checkDemoAccess(chatId);
  if (!access.allowed) return { ok: false, reason: access.reason, user: access.user };

  // Админ — без лимитов
  const user = access.user;
  if (!user) return { ok: true, user: null };

  const limit = user.limits[limitType];
  if (!limit) return { ok: true, user };

  if (limit.used >= limit.max) {
    return { ok: false, reason: "limit_exhausted", limitType, user };
  }
  return { ok: true, user };
}

async function incrementLimit(chatId, limitType, scenario, lengthMode) {
  const db = await loadDemoDB();
  const user = Object.values(db.users).find(u => u.tg_id === chatId);
  if (!user) return;

  db.users[user.phone].limits[limitType].used += 1;
  if (!db.users[user.phone].events) db.users[user.phone].events = [];
  db.users[user.phone].events.push({
    ts: new Date().toISOString(),
    scenario: scenario || "unknown",
    action: `generate_${limitType}`,
    length: lengthMode || null,
  });
  if (db.users[user.phone].events.length > 50) {
    db.users[user.phone].events = db.users[user.phone].events.slice(-50);
  }
  await saveDemoDB(db);
}

const SOFT_FREE_LIMITS = {
  text: 12,
  photo: 3,
  video: 1,
  audio: 3,
  demo: 2,
};

const DEFAULT_RUNTIME_TUNING = {
  prompt_patch: "",
  style_lock_strength: "strong",
  worldview_injection: "normal",
  regeneration_strength: "normal",
  temperature: null,
  quality_rewrite_enabled: true,
  updated_at: null,
};

function normalizeExpertRuntime(runtime = {}) {
  return {
    mode: runtime.mode || "free_demo",
    counters: {
      text: runtime.counters?.text || 0,
      photo: runtime.counters?.photo || 0,
      video: runtime.counters?.video || 0,
      audio: runtime.counters?.audio || 0,
      demo: runtime.counters?.demo || 0,
      ...(runtime.counters || {}),
    },
    limits: {
      ...SOFT_FREE_LIMITS,
      ...(runtime.limits || {}),
    },
    monetization: {
      premium_ready: true,
      payments_enabled: false,
      telegram_stars_ready: false,
      premium_generation_enabled: false,
      premium_generations: 0,
      upgrade_prompt_count: runtime.monetization?.upgrade_prompt_count || 0,
      last_upgrade_prompt_at: runtime.monetization?.last_upgrade_prompt_at || null,
      paid_plan: null,
      upgrade_trigger_seen: false,
      ...(runtime.monetization || {}),
    },
    telemetry: {
      ...(runtime.telemetry || {}),
      first_generation_at: runtime.telemetry?.first_generation_at || null,
      onboarding_started_at: runtime.telemetry?.onboarding_started_at || null,
      onboarding_completed_at: runtime.telemetry?.onboarding_completed_at || null,
      uploads_total: runtime.telemetry?.uploads_total || 0,
      upload_counts: {
        knowledge: runtime.telemetry?.upload_counts?.knowledge || 0,
        style: runtime.telemetry?.upload_counts?.style || 0,
        avatar: runtime.telemetry?.upload_counts?.avatar || 0,
        voice: runtime.telemetry?.upload_counts?.voice || 0,
        ...(runtime.telemetry?.upload_counts || {}),
      },
      demo_started_at: runtime.telemetry?.demo_started_at || null,
      demo_converted_at: runtime.telemetry?.demo_converted_at || null,
      scenario_creations: runtime.telemetry?.scenario_creations || 0,
      regeneration_uses: runtime.telemetry?.regeneration_uses || 0,
      generations_completed: runtime.telemetry?.generations_completed || 0,
      generation_failures: runtime.telemetry?.generation_failures || 0,
      dropoffs: {
        onboarding_started_no_completion: runtime.telemetry?.dropoffs?.onboarding_started_no_completion || 0,
        generated_no_media: runtime.telemetry?.dropoffs?.generated_no_media || 0,
        demo_started_no_conversion: runtime.telemetry?.dropoffs?.demo_started_no_conversion || 0,
        ...(runtime.telemetry?.dropoffs || {}),
      },
    },
    cost_visibility: {
      total_estimated_usd: Number(runtime.cost_visibility?.total_estimated_usd || 0),
      categories: {
        text: Number(runtime.cost_visibility?.categories?.text || 0),
        audio: Number(runtime.cost_visibility?.categories?.audio || 0),
        image: Number(runtime.cost_visibility?.categories?.image || 0),
        video: Number(runtime.cost_visibility?.categories?.video || 0),
        upload: Number(runtime.cost_visibility?.categories?.upload || 0),
        other: Number(runtime.cost_visibility?.categories?.other || 0),
        ...(runtime.cost_visibility?.categories || {}),
      },
      expensive_operations: {
        text: Number(runtime.cost_visibility?.expensive_operations?.text || 0),
        audio: Number(runtime.cost_visibility?.expensive_operations?.audio || 0),
        image: Number(runtime.cost_visibility?.expensive_operations?.image || 0),
        video: Number(runtime.cost_visibility?.expensive_operations?.video || 0),
        uploads: Number(runtime.cost_visibility?.expensive_operations?.uploads || 0),
        ...(runtime.cost_visibility?.expensive_operations || {}),
      },
      last_operation: runtime.cost_visibility?.last_operation || null,
    },
    tuning: {
      ...DEFAULT_RUNTIME_TUNING,
      ...(runtime.tuning || {}),
    },
    events: Array.isArray(runtime.events) ? runtime.events : [],
    updated_at: runtime.updated_at || new Date().toISOString(),
  };
}

async function loadExpertRuntime(userId) {
  const root = getUserRoot(userId);
  const path = join(root, "profile", "runtime.json");
  await ensureRuntimeDirectory(dirname(path), "user runtime profile");
  try {
    const runtime = normalizeExpertRuntime(JSON.parse(await fs.readFile(path, "utf-8")));
    runtimeLog("runtime restored", { userId: String(userId), path });
    return runtime;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`[${RUNTIME_NAME}] runtime restore failed, initializing fresh: ${error.message}`);
    }
    const runtime = normalizeExpertRuntime();
    await fs.writeFile(path, JSON.stringify(runtime, null, 2), "utf-8");
    runtimeLog("runtime file created", { userId: String(userId), path });
    runtimeLog("runtime initialized fresh", { userId: String(userId), path });
    return runtime;
  }
}

async function saveExpertRuntime(userId, runtime) {
  const root = getUserRoot(userId);
  const path = join(root, "profile", "runtime.json");
  await ensureRuntimeDirectory(dirname(path), "user runtime profile");
  await fs.writeFile(path, JSON.stringify(runtime, null, 2), "utf-8");
  return runtime;
}

function nowIso() {
  return new Date().toISOString();
}

function entitlementUserId(userId) {
  return String(userId);
}

function buildEntitlement(userId, planKey, patch = {}) {
  const plan = PAID_BETA_PLANS[planKey] || PAID_BETA_PLANS.demo;
  const now = nowIso();
  const days = patch.days ?? plan.days;
  const validUntil = patch.validUntil !== undefined
    ? patch.validUntil
    : (days ? new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString() : null);
  return {
    userId: entitlementUserId(userId),
    plan: plan.plan,
    status: patch.status || "active",
    generationLimit: Number(patch.generationLimit ?? plan.generationLimit),
    generationUsed: Number(patch.generationUsed ?? 0),
    validUntil,
    updatedAt: now,
  };
}

async function loadEntitlementsStore() {
  const store = await readJsonFileSafe(ENTITLEMENTS_PATH, { users: {} });
  if (!store || typeof store !== "object") return { users: {} };
  if (!store.users || typeof store.users !== "object") store.users = {};
  return store;
}

async function saveEntitlementsStore(store) {
  await writeJsonFileSafe(ENTITLEMENTS_PATH, {
    users: store?.users && typeof store.users === "object" ? store.users : {},
  });
}

function isEntitlementExpired(entitlement, at = new Date()) {
  return Boolean(entitlement?.validUntil && new Date(entitlement.validUntil) < at);
}

async function getOrCreateEntitlement(userId) {
  const id = entitlementUserId(userId);
  const store = await loadEntitlementsStore();
  let entitlement = store.users[id];
  if (!entitlement) {
    entitlement = buildEntitlement(id, isAdminUser(id) ? "admin" : "demo");
    store.users[id] = entitlement;
    await saveEntitlementsStore(store);
    return entitlement;
  }
  if (isAdminUser(id) && entitlement.plan !== "admin") {
    entitlement = buildEntitlement(id, "admin", {
      generationUsed: entitlement.generationUsed || 0,
      validUntil: null,
    });
    store.users[id] = entitlement;
    await saveEntitlementsStore(store);
    return entitlement;
  }
  if (isEntitlementExpired(entitlement) && entitlement.status === "active") {
    entitlement.status = "expired";
    entitlement.updatedAt = nowIso();
    store.users[id] = entitlement;
    await saveEntitlementsStore(store);
  }
  return entitlement;
}

async function grantBetaEntitlement(userId, generationLimit, days, createdBy) {
  const limit = Number(generationLimit);
  const validDays = Number(days);
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("LIMIT must be a positive integer.");
  if (!Number.isInteger(validDays) || validDays <= 0) throw new Error("DAYS must be a positive integer.");
  const store = await loadEntitlementsStore();
  const entitlement = buildEntitlement(userId, "beta_paid", {
    generationLimit: limit,
    days: validDays,
  });
  store.users[entitlement.userId] = entitlement;
  await saveEntitlementsStore(store);
  await appendJsonlSafe(PAYMENT_EVENTS_PATH, {
    type: "manual_grant",
    userId: entitlement.userId,
    plan: "beta_paid",
    generationLimit: limit,
    days: validDays,
    createdAt: nowIso(),
    createdBy: entitlementUserId(createdBy),
  });
  return entitlement;
}

async function revokeBetaEntitlement(userId, createdBy) {
  const store = await loadEntitlementsStore();
  const id = entitlementUserId(userId);
  const current = store.users[id] || buildEntitlement(id, "demo");
  const revoked = {
    ...current,
    status: "revoked",
    updatedAt: nowIso(),
  };
  store.users[id] = revoked;
  await saveEntitlementsStore(store);
  await appendJsonlSafe(PAYMENT_EVENTS_PATH, {
    type: "manual_revoke",
    userId: id,
    createdAt: nowIso(),
    createdBy: entitlementUserId(createdBy),
  });
  return revoked;
}

async function checkPaidBetaAccess(userId) {
  const entitlement = await getOrCreateEntitlement(userId);
  if (entitlement.status !== "active") {
    return { ok: false, reason: `entitlement_${entitlement.status}`, entitlement };
  }
  if (isEntitlementExpired(entitlement)) {
    return { ok: false, reason: "entitlement_expired", entitlement };
  }
  const remaining = Number(entitlement.generationLimit) - Number(entitlement.generationUsed || 0);
  if (remaining <= 0) {
    return { ok: false, reason: "entitlement_limit_exhausted", entitlement, remaining: 0 };
  }
  return { ok: true, entitlement, remaining };
}

async function incrementEntitlementUsage(userId) {
  const store = await loadEntitlementsStore();
  const id = entitlementUserId(userId);
  const current = store.users[id] || buildEntitlement(id, isAdminUser(id) ? "admin" : "demo");
  current.generationUsed = Number(current.generationUsed || 0) + 1;
  current.updatedAt = nowIso();
  store.users[id] = current;
  await saveEntitlementsStore(store);
  return current;
}

function formatEntitlement(entitlement) {
  if (!entitlement) return "Entitlement not found.";
  const remaining = Math.max(0, Number(entitlement.generationLimit || 0) - Number(entitlement.generationUsed || 0));
  return [
    `User: ${entitlement.userId}`,
    `Plan: ${entitlement.plan}`,
    `Status: ${entitlement.status}`,
    `Generations: ${entitlement.generationUsed || 0}/${entitlement.generationLimit}`,
    `Remaining: ${remaining}`,
    `Valid until: ${entitlement.validUntil || "none"}`,
    `Updated: ${entitlement.updatedAt || "none"}`,
  ].join("\n");
}

function planLimitLabel(plan) {
  if (!plan) return "∞";
  return Number(plan.generationLimit) >= 1000000 ? "почти без лимита" : `${plan.generationLimit} генераций`;
}

function buildPaidBetaPlansText() {
  return [
    "Beta-планы",
    "",
    `demo — ${planLimitLabel(PAID_BETA_PLANS.demo)}. Стартовый доступ, чтобы быстро проверить качество AI-эксперта.`,
    `beta_paid — ${planLimitLabel(PAID_BETA_PLANS.beta_paid)} на ${PAID_BETA_PLANS.beta_paid.days} дней. Можно оплатить Telegram Stars или запросить вручную.`,
    `admin — ${planLimitLabel(PAID_BETA_PLANS.admin)}. Служебный доступ для тестов и поддержки.`,
    "",
    TELEGRAM_STARS_CHECKOUT_READY
      ? `Telegram Stars checkout включён. Пакет beta: 10 дополнительных генераций за ${BETA_PACK_STARS_PRICE} Stars.`
      : "Telegram Stars checkout отключён. Для подключения beta_paid используйте /upgrade.",
  ].join("\n");
}

async function getActiveExpertId(userId) {
  const inventory = await getOnboardingInventory(userId).catch(() => null);
  return inventory?.profile?.active_scenario_id || inventory?.scenarios?.[0]?.id || "none";
}

async function buildPremiumStatusText(userId) {
  const entitlement = await getOrCreateEntitlement(userId);
  const remaining = Math.max(0, Number(entitlement.generationLimit || 0) - Number(entitlement.generationUsed || 0));
  const activeExpertId = await getActiveExpertId(userId);
  return [
    "Premium status",
    "",
    `userId: ${entitlement.userId}`,
    `current plan: ${entitlement.plan}`,
    `status: ${entitlement.status}`,
    `generationUsed: ${entitlement.generationUsed || 0}`,
    `generationLimit: ${entitlement.generationLimit}`,
    `remaining: ${remaining}`,
    `validUntil: ${entitlement.validUntil || "none"}`,
    `active expertId: ${activeExpertId}`,
  ].join("\n");
}

function buildManualUpgradeText() {
  return [
    TELEGRAM_STARS_CHECKOUT_READY
      ? "Telegram Stars checkout включён. Можно оплатить beta-пакет или запросить beta_paid вручную."
      : "Платный доступ пока включается вручную.",
    TELEGRAM_STARS_CHECKOUT_READY
      ? `Stars-пакет: 10 дополнительных генераций за ${BETA_PACK_STARS_PRICE} Stars.`
      : "Напишите администратору для подключения beta_paid.",
    "",
    "Команда для просмотра планов: /plans",
    "Статус доступа: /premium_status",
  ].join("\n");
}

function betaTelemetryPath() {
  const day = new Date().toISOString().slice(0, 10);
  return join(BETA_TELEMETRY_DIR, `${day}.jsonl`);
}

function betaEventPatch(eventName, meta = {}) {
  const now = new Date().toISOString();
  if (eventName === BETA_EVENT_NAMES.ONBOARDING_STARTED) return { onboarding_started_at: now };
  if (eventName === BETA_EVENT_NAMES.ONBOARDING_COMPLETED) return { onboarding_completed_at: now };
  if (eventName === BETA_EVENT_NAMES.FIRST_GENERATION) return { first_generation_at: now };
  if (eventName === BETA_EVENT_NAMES.DEMO_STARTED) return { demo_started_at: now };
  if (eventName === BETA_EVENT_NAMES.DEMO_CONVERTED) return { demo_converted_at: now };
  if (eventName === BETA_EVENT_NAMES.SCENARIO_CREATED) return { scenario_creations_delta: 1 };
  if (eventName === BETA_EVENT_NAMES.REGENERATION_USED) return { regeneration_uses_delta: 1 };
  if (eventName === BETA_EVENT_NAMES.GENERATION_COMPLETED) return { generations_completed_delta: 1 };
  if (eventName === BETA_EVENT_NAMES.UPLOAD_RECEIVED) return { upload_category: meta.category || "unknown" };
  return {};
}

async function trackBetaEvent(userId, eventName, meta = {}) {
  const item = {
    ts: new Date().toISOString(),
    user_id: String(userId),
    event: eventName,
    ...meta,
  };
  try {
    await fs.mkdir(BETA_TELEMETRY_DIR, { recursive: true });
    await fs.appendFile(betaTelemetryPath(), `${JSON.stringify(item)}\n`, "utf-8");
  } catch (error) {
    console.warn(`[beta-telemetry] append failed: ${error.message}`);
  }

  try {
    const runtime = await loadExpertRuntime(userId);
    const patch = betaEventPatch(eventName, meta);
    runtime.telemetry = runtime.telemetry || {};
    if (patch.onboarding_started_at && !runtime.telemetry.onboarding_started_at) runtime.telemetry.onboarding_started_at = patch.onboarding_started_at;
    if (patch.onboarding_completed_at) runtime.telemetry.onboarding_completed_at = patch.onboarding_completed_at;
    if (patch.first_generation_at && !runtime.telemetry.first_generation_at) runtime.telemetry.first_generation_at = patch.first_generation_at;
    if (patch.demo_started_at && !runtime.telemetry.demo_started_at) runtime.telemetry.demo_started_at = patch.demo_started_at;
    if (patch.demo_converted_at) runtime.telemetry.demo_converted_at = patch.demo_converted_at;
    if (patch.scenario_creations_delta) runtime.telemetry.scenario_creations = (runtime.telemetry.scenario_creations || 0) + 1;
    if (patch.regeneration_uses_delta) runtime.telemetry.regeneration_uses = (runtime.telemetry.regeneration_uses || 0) + 1;
    if (patch.generations_completed_delta) runtime.telemetry.generations_completed = (runtime.telemetry.generations_completed || 0) + 1;
    if (patch.upload_category) {
      runtime.telemetry.uploads_total = (runtime.telemetry.uploads_total || 0) + 1;
      runtime.telemetry.upload_counts = runtime.telemetry.upload_counts || {};
      runtime.telemetry.upload_counts[patch.upload_category] = (runtime.telemetry.upload_counts[patch.upload_category] || 0) + 1;
    }
    runtime.events = runtime.events || [];
    runtime.events.push({
      ts: item.ts,
      action: eventName,
      scenario: meta.scenario || null,
      category: meta.category || null,
      mode: meta.mode || runtime.mode || "free_demo",
    });
    runtime.events = runtime.events.slice(-150);
    runtime.updated_at = item.ts;
    await saveExpertRuntime(userId, runtime);
  } catch (error) {
    console.warn(`[beta-telemetry] runtime update failed: ${error.message}`);
  }
}

async function incrementExpertRuntime(chatId, action, meta = {}) {
  const runtime = await loadExpertRuntime(chatId);
  const counterKey = meta.counter || action;
  runtime.counters[counterKey] = (runtime.counters[counterKey] || 0) + 1;
  if (meta.demoMode) runtime.counters.demo = (runtime.counters.demo || 0) + 1;
  if (meta.premium) runtime.monetization.premium_generations = (runtime.monetization.premium_generations || 0) + 1;
  runtime.events = runtime.events || [];
  runtime.events.push({
    ts: new Date().toISOString(),
    action,
    scenario: meta.scenario || null,
    expertId: meta.expertId || null,
    knowledgeBase: meta.knowledgeBase || null,
    styleProfile: meta.styleProfile || null,
    length: meta.lengthMode || null,
    mode: runtime.mode || "free_demo",
  });
  runtime.events = runtime.events.slice(-100);
  runtime.updated_at = new Date().toISOString();
  await saveExpertRuntime(chatId, runtime);
  return runtime;
}

function estimateTextCost(lengthMode = "normal") {
  return COST_ESTIMATES_USD[`text_${lengthMode}`] || COST_ESTIMATES_USD.text_normal;
}

async function recordRuntimeCost(chatId, category, operation, amountUsd = 0, meta = {}) {
  const runtime = await loadExpertRuntime(chatId);
  const amount = Number.isFinite(Number(amountUsd)) ? Math.max(0, Number(amountUsd)) : 0;
  const safeCategory = runtime.cost_visibility?.categories?.[category] !== undefined ? category : "other";
  runtime.cost_visibility = runtime.cost_visibility || normalizeExpertRuntime(runtime).cost_visibility;
  runtime.cost_visibility.categories[safeCategory] = Number((Number(runtime.cost_visibility.categories[safeCategory] || 0) + amount).toFixed(6));
  runtime.cost_visibility.total_estimated_usd = Number((Number(runtime.cost_visibility.total_estimated_usd || 0) + amount).toFixed(6));
  runtime.cost_visibility.expensive_operations = runtime.cost_visibility.expensive_operations || {};
  if (["text", "audio", "image", "video"].includes(safeCategory)) {
    runtime.cost_visibility.expensive_operations[safeCategory] = (runtime.cost_visibility.expensive_operations[safeCategory] || 0) + 1;
  }
  if (operation === "cloudinary_upload" || operation === "telegram_upload") {
    runtime.cost_visibility.expensive_operations.uploads = (runtime.cost_visibility.expensive_operations.uploads || 0) + 1;
  }
  runtime.cost_visibility.last_operation = {
    ts: new Date().toISOString(),
    category: safeCategory,
    operation,
    estimated_usd: amount,
    ...meta,
  };
  runtime.updated_at = runtime.cost_visibility.last_operation.ts;
  await saveExpertRuntime(chatId, runtime);
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.COST_RECORDED, {
    category: safeCategory,
    operation,
    estimated_usd: amount,
  });
  return runtime;
}

function buildRuntimeCostText(runtime) {
  const cost = runtime.cost_visibility || normalizeExpertRuntime(runtime).cost_visibility;
  return [
    `Estimated runtime cost: $${Number(cost.total_estimated_usd || 0).toFixed(3)}`,
    `Text: $${Number(cost.categories?.text || 0).toFixed(3)} · Audio: $${Number(cost.categories?.audio || 0).toFixed(3)}`,
    `Image: $${Number(cost.categories?.image || 0).toFixed(3)} · Video: $${Number(cost.categories?.video || 0).toFixed(3)}`,
    `Ops: text ${cost.expensive_operations?.text || 0}, audio ${cost.expensive_operations?.audio || 0}, image ${cost.expensive_operations?.image || 0}, video ${cost.expensive_operations?.video || 0}`,
  ].join("\n");
}

function runtimeRemaining(runtime, key = "text") {
  if (runtime?.monetization?.premium_generation_enabled || runtime?.monetization?.paid_plan) return null;
  const limit = runtime.limits?.[key];
  if (limit === null || limit === undefined) return null;
  return Math.max(0, Number(limit) - Number(runtime.counters?.[key] || 0));
}

function isStarsBetaTextPack(runtime) {
  return runtime?.monetization?.paid_plan === "stars_text10_beta";
}

function buildRuntimeCounterText(runtime) {
  const textLeft = runtimeRemaining(runtime, "text");
  const demoLeft = runtimeRemaining(runtime, "demo");
  const starsBetaPack = isStarsBetaTextPack(runtime);
  const premiumOn = runtime.monetization?.premium_generation_enabled || (runtime.monetization?.paid_plan && !starsBetaPack);
  const textUsed = Number(runtime.counters?.text || 0);
  const textLimit = runtime.limits?.text ?? "∞";
  const betaPackLeft = starsBetaPack && Number.isFinite(Number(textLimit))
    ? Math.max(0, Number(textLimit) - textUsed)
    : null;
  const bits = [
    `Режим: ${starsBetaPack ? "beta-pack" : (premiumOn ? "premium-ready" : (runtime.mode || "free_demo"))}`,
    starsBetaPack ? "Пакет: Beta text pack" : null,
    starsBetaPack ? "Куплено beta-генераций: 10" : null,
    `Тексты: ${textUsed}/${premiumOn ? "∞" : textLimit}`,
    `Фото: ${runtime.counters?.photo || 0}/${runtime.limits?.photo ?? "∞"}`,
    `Видео: ${runtime.counters?.video || 0}/${runtime.limits?.video ?? "∞"}`,
  ].filter(Boolean);
  if (demoLeft !== null) bits.push(`Демо: ${runtime.counters?.demo || 0}/${runtime.limits?.demo ?? "∞"}`);
  if (betaPackLeft !== null) bits.push(`Осталось текстовых генераций: ${betaPackLeft}/${textLimit}`);
  if (textLeft !== null) {
    bits.push(`Осталось бесплатных текстов: ${textLeft}`);
    if (textLeft <= 3) bits.push("Монетизация: готов Stars-upgrade hook, можно тестировать оплату/расширение вручную");
  }
  bits.push(`Cost visibility: $${Number(runtime.cost_visibility?.total_estimated_usd || 0).toFixed(3)} est.`);
  return bits.join("\n");
}

function buildRuntimeTuningText(runtime) {
  const tuning = runtime.tuning || DEFAULT_RUNTIME_TUNING;
  return [
    "Tuning hooks:",
    `Prompt patch: ${tuning.prompt_patch ? "on" : "off"}`,
    `Style lock: ${tuning.style_lock_strength || "strong"}`,
    `Worldview: ${tuning.worldview_injection || "normal"}`,
    `Regeneration: ${tuning.regeneration_strength || "normal"}`,
    `Temperature: ${tuning.temperature ?? "default"}`,
    `Quality rewrite: ${tuning.quality_rewrite_enabled === false ? "off" : "on"}`,
  ].join("\n");
}

function buildTuningPrompt(runtime) {
  const tuning = runtime?.tuning || DEFAULT_RUNTIME_TUNING;
  const parts = [];
  const styleStrength = tuning.style_lock_strength || "strong";
  if (styleStrength === "light") {
    parts.push("RUNTIME TUNING: style lock light. Сохраняй узнаваемость, но не жертвуй ясностью темы.");
  } else if (styleStrength === "strict") {
    parts.push("RUNTIME TUNING: style lock strict. При конфликте между общей полезностью и голосом автора выбирай голос, cadence, openings и CTA из persona/style guidance.");
  } else if (styleStrength === "strong") {
    parts.push("RUNTIME TUNING: style lock strong. Усиливай авторский ритм, конкретность и эмоциональное узнавание.");
  }

  const worldviewStrength = tuning.worldview_injection || "normal";
  if (worldviewStrength === "light") {
    parts.push("RUNTIME TUNING: worldview light. Используй worldview только как фон, без явного пересказа.");
  } else if (worldviewStrength === "strong") {
    parts.push("RUNTIME TUNING: worldview strong. Угол, финальный вывод и эмоциональная логика должны явно вытекать из worldview/persona.");
  }

  if (tuning.prompt_patch) {
    parts.push(`RUNTIME ADMIN PROMPT PATCH:\n${String(tuning.prompt_patch).slice(0, 1200)}`);
  }
  return parts.join("\n\n");
}

function normalizeTuningValue(key, value) {
  const raw = String(value || "").trim();
  if (key === "style_lock_strength") {
    return ["light", "normal", "strong", "strict"].includes(raw) ? raw : null;
  }
  if (key === "worldview_injection") {
    return ["off", "light", "normal", "strong"].includes(raw) ? raw : null;
  }
  if (key === "regeneration_strength") {
    return ["light", "normal", "high"].includes(raw) ? raw : null;
  }
  if (key === "temperature") {
    if (["default", "null", "off"].includes(raw)) return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0.1 && number <= 1.2 ? number : undefined;
  }
  if (key === "quality_rewrite_enabled") {
    return ["true", "on", "yes", "1"].includes(raw.toLowerCase());
  }
  if (key === "prompt_patch") {
    return raw.slice(0, 1200);
  }
  return undefined;
}

async function updateRuntimeSetting(userId, key, value) {
  const runtime = await loadExpertRuntime(userId);
  const now = new Date().toISOString();
  if (["text", "photo", "video", "audio", "demo"].includes(key)) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return { ok: false, error: "limit must be a positive number" };
    runtime.limits[key] = number;
  } else if (key === "premium") {
    runtime.monetization.premium_generation_enabled = ["true", "on", "yes", "1"].includes(String(value).toLowerCase());
  } else {
    const normalized = normalizeTuningValue(key, value);
    if (normalized === undefined || normalized === null) return { ok: false, error: `unsupported value for ${key}` };
    runtime.tuning = runtime.tuning || { ...DEFAULT_RUNTIME_TUNING };
    runtime.tuning[key] = normalized;
    runtime.tuning.updated_at = now;
  }
  runtime.updated_at = now;
  await saveExpertRuntime(userId, runtime);
  return { ok: true, runtime };
}

async function sendAdminTuningPanel(chatId, adminUserId, targetUserId = adminUserId) {
  if (!isAdminUser(adminUserId)) {
    await bot.sendMessage(chatId, "🔒 Admin tuning доступен только администратору.");
    return;
  }
  const runtime = await loadExpertRuntime(targetUserId);
  await bot.sendMessage(chatId, [
    `Admin tuning: ${targetUserId}`,
    "",
    buildRuntimeCounterText(runtime),
    "",
    buildRuntimeCostText(runtime),
    "",
    buildRuntimeTuningText(runtime),
    "",
    "Команды:",
    "/tune <user_id> style_lock_strength strict",
    "/tune <user_id> worldview_injection strong",
    "/tune <user_id> regeneration_strength high",
    "/tune <user_id> prompt_patch ваш текст",
    "/tune <user_id> text 20",
    "/tune <user_id> premium on",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [
        { text: "Style strong", callback_data: "admin_tune:style_lock_strength:strong" },
        { text: "Style strict", callback_data: "admin_tune:style_lock_strength:strict" },
      ],
      [
        { text: "Worldview light", callback_data: "admin_tune:worldview_injection:light" },
        { text: "Worldview strong", callback_data: "admin_tune:worldview_injection:strong" },
      ],
      [
        { text: "Regen normal", callback_data: "admin_tune:regeneration_strength:normal" },
        { text: "Regen high", callback_data: "admin_tune:regeneration_strength:high" },
      ],
      [
        { text: "Premium on", callback_data: "admin_tune:premium:on" },
        { text: "Premium off", callback_data: "admin_tune:premium:off" },
      ],
      [{ text: "← Admin tools", callback_data: "admin_tools" }],
    ]},
  });
}

async function notifyLeadsBot(text, keyboard = null) {
  if (!LEADS_BOT_TOKEN) return;
  try {
    const body = { chat_id: ADMIN_TG_ID, text, parse_mode: "Markdown" };
    if (keyboard) body.reply_markup = JSON.stringify(keyboard);
    await fetch(`https://api.telegram.org/bot${LEADS_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Leads bot notify error:", e.message);
  }
}

async function handleLimitExhausted(chatId, limitType, user) {
  const labelMap = { text: "📝 Тексты", photo: "🖼 Фото", video: "🎬 Видео" };
  const label = labelMap[limitType] || limitType;

  await bot.sendMessage(chatId,
    `🚫 *Лимит исчерпан*\n\n${label}: использовано ${user.limits[limitType].used}/${user.limits[limitType].max}\n\nДля увеличения лимита нажмите кнопку:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "📩 Запросить увеличение лимита", callback_data: `req_limit_${limitType}` },
      ]]},
    }
  );

  await notifyLeadsBot(
    `⚠️ *Лимит исчерпан*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n🚫 Исчерпан: *${label}*`,
    { inline_keyboard: [[{ text: "💬 Написать пользователю", url: `tg://user?id=${user.tg_id}` }]] }
  );
}

async function checkRuntimeGenerationQuota(chatId, state, limitType = "text") {
  const runtime = await loadExpertRuntime(chatId);
  let entitlementCheck = null;
  if (limitType === "text") {
    entitlementCheck = await checkPaidBetaAccess(chatId);
    if (!entitlementCheck.ok) {
      return {
        ok: false,
        reason: entitlementCheck.reason,
        entitlement: entitlementCheck.entitlement,
        runtime,
        remaining: entitlementCheck.remaining,
      };
    }

    if (["admin", "beta_paid"].includes(entitlementCheck.entitlement.plan)) {
      return {
        ok: true,
        runtime,
        premium: true,
        entitlement: entitlementCheck.entitlement,
        entitlementRemaining: entitlementCheck.remaining,
      };
    }
  }

  if (chatId === ADMIN_TG_ID) {
    return { ok: true, runtime, premium: true, entitlement: entitlementCheck?.entitlement, entitlementRemaining: entitlementCheck?.remaining };
  }

  const premium = runtime.monetization?.premium_generation_enabled || runtime.monetization?.paid_plan;
  if (premium) return { ok: true, runtime, premium: true, entitlement: entitlementCheck?.entitlement, entitlementRemaining: entitlementCheck?.remaining };

  const key = state?.demoMode ? "demo" : limitType;
  const remaining = runtimeRemaining(runtime, key);
  if (remaining !== null && remaining <= 0) {
    return {
      ok: false,
      reason: state?.demoMode ? "runtime_demo_exhausted" : "runtime_limit_exhausted",
      limitType: key,
      runtime,
      remaining,
      entitlement: entitlementCheck?.entitlement,
    };
  }
  return { ok: true, runtime, remaining, entitlement: entitlementCheck?.entitlement, entitlementRemaining: entitlementCheck?.remaining };
}

async function handlePaidBetaAccessDenied(chatId, entitlement, reason) {
  const remaining = entitlement
    ? Math.max(0, Number(entitlement.generationLimit || 0) - Number(entitlement.generationUsed || 0))
    : 0;
  await bot.sendMessage(chatId, [
    "Лимит генераций закончился.",
    "",
    entitlement
      ? `План: ${entitlement.plan}, статус: ${entitlement.status}.`
      : "План ещё не создан.",
    entitlement ? `Использовано: ${entitlement.generationUsed || 0}/${entitlement.generationLimit}.` : "",
    entitlement?.validUntil ? `Действует до: ${entitlement.validUntil}.` : "",
    `Осталось: ${remaining}.`,
    reason === "entitlement_expired"
      ? "Срок доступа истёк."
      : "",
    "",
    "Чтобы продолжить генерации, откройте /upgrade и запросите ручное подключение beta_paid.",
  ].filter(Boolean).join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: "Открыть /upgrade", callback_data: "manual_upgrade" }],
      [{ text: "Запросить beta-доступ", callback_data: "req_limit_text" }],
      [{ text: "Открыть dashboard", callback_data: "ob_dashboard" }],
    ]},
  });
}

async function handleRuntimeLimitExhausted(chatId, limitType, runtime, options = {}) {
  const isDemo = options.demoMode || limitType === "demo";
  runtime.monetization = runtime.monetization || {};
  runtime.monetization.upgrade_trigger_seen = true;
  runtime.monetization.upgrade_prompt_count = (runtime.monetization.upgrade_prompt_count || 0) + 1;
  runtime.monetization.last_upgrade_prompt_at = new Date().toISOString();
  runtime.updated_at = runtime.monetization.last_upgrade_prompt_at;
  await saveExpertRuntime(chatId, runtime);
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.GENERATION_EXHAUSTED, { limit_type: limitType, demo_mode: isDemo });
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.UPGRADE_PROMPT_SHOWN, { limit_type: limitType, demo_mode: isDemo });

  const quotaText = isDemo
    ? `Демо-лимит закончился: ${runtime.counters?.demo || 0}/${runtime.limits?.demo ?? "∞"}.`
    : `Бесплатные генерации закончились: ${runtime.counters?.text || 0}/${runtime.limits?.text ?? "∞"}.`;

  await bot.sendMessage(chatId, [
    "Лимит на этом этапе закончился.",
    "",
    quotaText,
    "",
    "Чтобы продолжить генерации, откройте /upgrade и запросите ручное подключение beta_paid.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: buildUpgradeKeyboard(isDemo ? "demo" : "text") },
  });
}

function buildUpgradeKeyboard(limitType = "text") {
  const rows = [
    [{ text: "Как подключить beta_paid", callback_data: "manual_upgrade" }],
    [{ text: "Запросить premium-доступ", callback_data: `req_limit_${limitType}` }],
    [{ text: "Создать/усилить AI-эксперта", callback_data: "ob_template_menu" }],
    [{ text: "Открыть dashboard", callback_data: "ob_dashboard" }],
  ];
  return rows;
}

async function sendStarsUpgradePlaceholder(chatId, limitType = "text", pack = "text10") {
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.STARS_UPGRADE_CLICKED, { limit_type: limitType, pack, enabled: TELEGRAM_STARS_ENABLED });
  const title = "Beta text pack";
  const description = "10 extra text generations for closed beta testing.";
  if (TELEGRAM_STARS_CHECKOUT_READY && bot.sendInvoice) {
    try {
      console.log("starsInvoiceAttempt", {
        amount: BETA_PACK_STARS_PRICE,
        currency: TELEGRAM_STARS_CURRENCY,
        hasPayButton: true,
      });
      await bot.sendInvoice(
        chatId,
        title,
        description,
        `beta_${limitType}_${pack}_${Date.now()}`,
        "",
        TELEGRAM_STARS_CURRENCY,
        [{ label: "10 text generations", amount: BETA_PACK_STARS_PRICE }],
        {
          start_parameter: "beta_text_pack",
          reply_markup: { inline_keyboard: [[{ text: `Оплатить ${BETA_PACK_STARS_PRICE} ⭐`, pay: true }]] },
        }
      );
      return;
    } catch (error) {
      console.warn("Stars invoice failed, falling back to placeholder:", error.message);
    }
  }
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.PAID_GENERATION_PLACEHOLDER, { limit_type: limitType, pack });
  await bot.sendMessage(chatId, [
    "Stars-оплата подготовлена как beta-hook.",
    "",
    `Пакет: 10 дополнительных текстовых генераций (${BETA_PACK_STARS_PRICE} Stars).`,
    "В этом окружении checkout ещё не включён, поэтому я отправлю запрос администратору.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: "Запросить premium вручную", callback_data: `req_limit_${limitType}` }],
      [{ text: "Dashboard", callback_data: "ob_dashboard" }],
    ]},
  });
}

async function handleNotRegistered(chatId) {
  await bot.sendMessage(chatId,
    [
      "Можно зайти двумя путями:",
      "",
      "1. Быстрое демо: готовый AI-эксперт покажет первый пост за минуту.",
      "2. Свой AI-эксперт: выбираете роль, загружаете материалы и получаете голос ближе к себе.",
      "",
      "Для закрытого beta-доступа напишите @tetss2.",
    ].join("\n"),
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: "Попробовать демо", callback_data: "demo_start" }],
        [{ text: "Создать AI-эксперта", callback_data: "ob_start" }],
        [{ text: "Написать @tetss2", url: "https://t.me/tetss2" }],
      ]},
    }
  );
}

async function handleExpired(chatId, user) {
  await bot.sendMessage(chatId,
    `⏰ *Срок демо-доступа истёк*\n\nВаш 7-дневный демо-период завершён.\n\n` +
    `📊 Итого использовано:\n` +
    `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
    `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
    `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}\n\n` +
    `Для продления обратитесь к администратору:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "📩 Запросить продление", callback_data: "req_extend" },
        { text: "💬 Написать @tetss2", url: "https://t.me/tetss2" },
      ]]},
    }
  );
}

// ─── ПУБЛИКАЦИЯ В КАНАЛ ───────────────────────────────────────────────────────

async function publishToChannel(type, state) {
  if (!TG_CHANNEL) {
    console.error("TG_CHANNEL не задан в переменных Railway");
    return { ok: false, error: "Канал не настроен" };
  }

  const text = state.lastFullAnswer || "";
  const cleanFull = text.replace(/[*_]/g, '');
  const trimCaption = (t) => {
    if (t.length <= 1024) return t;
    const cut = t.lastIndexOf('.', 1020);
    return cut > 500 ? t.substring(0, cut + 1) : t.substring(0, 1021) + "...";
  };

  try {
    if (type === "text_photo" && state.lastImageUrl) {
      await bot.sendPhoto(TG_CHANNEL, state.lastImageUrl, { caption: trimCaption(cleanFull) });
    } else if (type === "text_video" && state.lastVideoUrl) {
      await bot.sendVideo(TG_CHANNEL, state.lastVideoUrl, { caption: trimCaption(cleanFull) });
    } else {
      await bot.sendMessage(TG_CHANNEL, text.substring(0, 4096));
    }
    return { ok: true };
  } catch (err) {
    console.error("Publish to channel error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── СИСТЕМНЫЕ ПРОМПТЫ ───────────────────────────────────────────────────────

const AURORA_PROMPT = "4K studio interview, medium close-up. Solid light-grey seamless backdrop, uniform soft key-light. Presenter faces lens, steady eye-contact. Hands below frame, body still. Ultra-sharp.";

const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
absolutely no wrinkles, perfectly smooth skin, youthful appearance, 33 years old,
asian features, soft round face, small nose, almond eyes, upturned eye corners,
subtle gentle closed-mouth smile, calm serene expression`;

const TEST_VIDEO_SCENE_PROMPT = "sitting in a cozy therapist office, soft daylight, calm neutral background, professional talking-head setup";

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

const PSYCHOLOGIST_SYSTEM_PROMPT = `Ты — Динара Качаева, практикующий психолог. Пишешь как живой человек — тепло, лично, с внутренней глубиной.

КТО ТЫ:
Пишешь посты в Telegram-канал. Делишься живой мыслью, как будто она только что пришла. Признаёшься в личном: "я сама долго с этим работала", "не знаю как у вас, а я...".

СТИЛЬ:
— Тёплый разговорный язык, без академизма
— Короткие абзацы, разделённые пустой строкой
— Многоточия для паузы и раздумья…
— Длинное тире — вместо короткого
— Иногда начинаешь с "Дорогие," / "Друзья,"
— Риторические вопросы вовлекают читателя
— Метафоры: "мы едим и перевариваем эту жизнь", "смотримся в разные зеркала"

ЭМОДЗИ: Используй умеренно, только там, где они звучат живо. Не добивай норму эмодзи ради количества.
Доступные: 💙 🌿 🍀 🌟 💫 🧚‍♀️ 🙏 ❗️ 🟢 🤗 ✨ 🌞 🫶 💛 🌸 🦋 🌈 💝 🔥 👀 💭 🌻 🪴 💪 🎯

СТРУКТУРА:
1. Принятие темы / эмпатия
2. Главная мысль — инсайт, метафора, разворот
3. Личный угол или практическая деталь
4. Мягкое завершение или вопрос читателю

ЗАПРЕЩЕНО: нумерованные списки, заголовки, слова "безусловно/следует отметить/таким образом/данный", повторы, канцелярит, мотивационные лозунги.
ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы. Эмодзи умеренно, без россыпи.`;

const DINARA_REALISM_PROMPT = `ПРАВИЛА РЕАЛИЗМА ДИНАРЫ:
— Главный критерий: текст должен звучать как живой пост Динары в Telegram, а не как универсальная AI-статья.
— Начинай с конкретного внутреннего состояния, наблюдения из жизни или мягкого вопроса. Не начинай с общих фраз вроде "в современном мире", "важно понимать", "сегодня поговорим".
— Первый абзац должен сразу создавать человеческое присутствие: эмоция, напряжение, узнаваемая бытовая ситуация или мягкое "а у вас так бывает?".
— Выбирай один из живых входов: эмоциональный ("Иногда так устаёшь быть сильной..."), напряжённый ("Самое больное в отношениях часто не ссора..."), эмпатичный ("Если сейчас вы читаете это и сжимаетесь внутри..."), разговорный ("Знаете, я часто вижу одну вещь...").
— Не открывай текст определением темы. Не объясняй читателю, почему тема актуальна. Сразу входи в переживание.
— Двигайся так: чувство читателя → нормализация → психологический смысл → один маленький практический сдвиг → мягкое завершение.
— Пиши короткими, разными по длине абзацами. Иногда одно предложение может быть отдельным абзацем.
— Чередуй ритм: короткая фраза для паузы, затем более длинная мысль, затем снова короткое человеческое уточнение.
— Делай ритм немного неровным: допускай короткие фразы без полного объяснения, разговорные вставки, мягкие самоисправления.
— Иногда ставь одну эмоциональную строку отдельно: "И это больно.", "Вот здесь хочется выдохнуть.", "Не сразу. Но честнее."
— Используй фрагменты естественно: "Не потому что слабость.", "Не про каприз.", "Про очень усталую часть внутри."
— Один раз можно прервать себя разговорным поворотом: "хотя нет, точнее...", "и вот здесь важно не ускоряться", "знаете, я бы тут не спешила".
— Оставляй место тишине. Не закрывай каждую мысль выводом.
— Добавь одну живую авторскую интонацию: "я часто вижу", "мне хочется здесь замедлиться", "знаете, что здесь важно?", "иногда это не про слабость".
— Не превращай пост в инструкцию, лекцию, чек-лист или продающий текст.
— CTA только мягкий: вопрос к себе, приглашение заметить, бережное "можно начать с малого".
— Финал не должен звучать как вывод ассистента. Завершай эмоциональным послевкусием, тихим вопросом, маленьким разрешением или приглашением заметить одну вещь.
— Хороший финал Динары: не "сделайте шаг к лучшей версии себя", а "можно сегодня хотя бы не ругать себя за то, что внутри пока не получается иначе".
— CTA не обязателен в каждом тексте как отдельный призыв. Иногда достаточно вопроса, который остается внутри читателя.

МИНИ-ПРИМЕРЫ ИНТОНАЦИИ:
1) "Иногда тревога приходит не потому, что с вами что-то не так. А потому что внутри слишком долго не было места, где можно выдохнуть."
2) "Мне хочется здесь замедлиться. Потому что за раздражением часто прячется не злость, а очень усталая просьба о близости."
3) "Попробуйте сегодня не исправлять себя сразу. Сначала просто спросить: что я сейчас чувствую, если не ругать себя за это?"

АНТИ-ПАТТЕРНЫ:
Не используй: "важно понимать", "следует отметить", "таким образом", "в современном мире", "данная тема", "каждый из нас", "просто полюбите себя", "работайте над собой", "в заключение".
Не используй финалы: "поделитесь в комментариях", "сохраняйте пост", "помните, что вы достойны", "сделайте первый шаг к себе", "выберите себя", "начните путь к гармонии".
Не делай много эмодзи, заголовки, нумерованные списки, академический тон, одинаковые абзацы.`;

const STARTER_EXPERT_TEMPLATES = {
  psychologist: {
    label: "Психолог",
    expertName: "Психолог",
    roleKey: "psychologist",
    worldview: [
      "Человек не ломается просто так: симптомы часто защищают его от боли, стыда или перегруза.",
      "Важнее не быстро починить себя, а сначала понять, что внутри пытается быть услышанным.",
      "Терапевтичность звучит через бережную точность: не давить, не спасать, не обещать чудо.",
    ],
    openings: [
      "Иногда человек приходит не за советом. А за тем, чтобы рядом наконец не спорили с его болью.",
      "Есть состояния, в которых не хочется сильных слов. Хочется, чтобы кто-то сказал: с вами не что-то не так.",
      "Знаете, что часто прячется за усталостью?",
    ],
    cadence: "Короткие абзацы по 1-3 предложения. Ритм: узнаваемое чувство -> пауза -> психологический смысл -> маленький бережный шаг. Можно оставлять одну короткую фразу отдельной строкой.",
    emotionalStyle: "Тепло, интимно, наблюдательно. Меньше учительства, больше ощущения, что автора правда интересует внутренний мир читателя.",
    ctaPatterns: [
      "Можно сегодня просто заметить, где вы перестали быть на своей стороне.",
      "Попробуйте спросить себя не 'что со мной не так?', а 'что сейчас во мне просит бережности?'.",
      "Если откликнулось, сохраните это как маленькое разрешение не торопить себя.",
    ],
  },
  sexologist: {
    label: "Сексолог",
    expertName: "Сексолог",
    roleKey: "sexologist",
    worldview: [
      "Сексуальность не существует отдельно от тела, стыда, безопасности, отношений и права хотеть по-своему.",
      "Норма шире, чем кажется, но любые рекомендации должны оставаться этичными, взрослыми и без давления.",
      "Тема секса звучит сильнее, когда в ней есть спокойствие, ясность и уважение к границам.",
    ],
    openings: [
      "Иногда разговор о сексе начинается не с желания. А с напряжения: 'со мной вообще нормально?'.",
      "Есть вопросы, которые люди годами стесняются произнести вслух.",
      "Давайте без стыда: желание не обязано быть одинаковым всегда.",
    ],
    cadence: "Спокойные абзацы, без пошлости и кликбейта. Ритм: снятие стыда -> нормализация -> профессиональное объяснение -> один безопасный ориентир.",
    emotionalStyle: "Уверенно, деликатно, телесно, взрослым языком. Не сюсюкать, не шокировать, не превращать тему в медицинскую лекцию.",
    ctaPatterns: [
      "Можно начать с честного вопроса к себе: мне сейчас правда хочется или я пытаюсь соответствовать?",
      "Если эта тема про вас, не торопитесь обвинять тело. Сначала посмотрите, где ему небезопасно.",
      "Сохраните как напоминание: сексуальность не любит стыд и спешку.",
    ],
  },
  coach: {
    label: "Коуч",
    expertName: "Коуч",
    roleKey: "coach",
    worldview: [
      "Ясность появляется не от давления, а от честного выбора следующего маленького действия.",
      "Ответственность не должна звучать как самонаказание. Она может быть спокойной опорой.",
      "Рост держится на фокусе, энергии и уважении к реальному темпу человека.",
    ],
    openings: [
      "Иногда человек застревает не потому, что ленится. А потому что цель давно перестала быть его.",
      "Самый честный вопрос в развитии часто неприятный: а я правда этого хочу?",
      "Есть решения, которые не требуют больше мотивации. Им нужна ясность.",
    ],
    cadence: "Четко и энергично: короткий хук -> разворот мысли -> 1 практический фокус -> спокойный вызов. Абзацы компактные, без длинных лекций.",
    emotionalStyle: "Поддерживающе, собранно, без инфобизнес-нажима. Чувствуется взрослый партнер рядом, а не мотиватор со сцены.",
    ctaPatterns: [
      "Выберите один шаг, который можно сделать за 15 минут, и проверьте реальность, а не фантазию.",
      "Сегодня не обещайте себе новую жизнь. Просто верните себе один управляемый выбор.",
      "Запишите честно: что я делаю из желания, а что из страха отстать?",
    ],
  },
  blogger: {
    label: "Блогер",
    expertName: "Блогер",
    roleKey: "blogger",
    worldview: [
      "Личный бренд держится не на идеальности, а на узнаваемом взгляде и честной интонации.",
      "Люди возвращаются к автору, когда чувствуют характер, позицию и живое наблюдение.",
      "Контент должен звучать как человек, у которого есть вкус, опыт и своя оптика.",
    ],
    openings: [
      "Есть мысль, которую я долго не могла нормально сформулировать.",
      "Наблюдаю одну вещь, и она слишком часто повторяется, чтобы делать вид, что это случайность.",
      "Иногда самый сильный контент начинается не с пользы, а с честного 'я тоже так делала'.",
    ],
    cadence: "Живой блоговый ритм: цепкий первый абзац -> личное наблюдение -> конкретная деталь -> вывод с характером. Можно использовать разговорные повороты.",
    emotionalStyle: "Лично, современно, чуть смело, но без искусственной дерзости. Больше авторского взгляда, меньше универсальных советов.",
    ctaPatterns: [
      "Напишите себе одну фразу, которую вы обычно сглаживаете, и попробуйте сказать ее честнее.",
      "Если узнали себя, это хороший момент пересобрать не контент, а позицию.",
      "Сохраните как напоминание: узнаваемость начинается там, где вы перестаете звучать как все.",
    ],
  },
  fitness: {
    label: "Фитнес-эксперт",
    expertName: "Фитнес-эксперт",
    roleKey: "fitness",
    worldview: [
      "Тело меняется устойчиво не от наказания, а от понятной системы, восстановления и уважения к реальному уровню человека.",
      "Фитнес должен помогать человеку жить энергичнее, а не превращать каждый день в экзамен на силу воли.",
      "Хороший эксперт объясняет просто: что делать, зачем это работает и как не сорваться через неделю.",
    ],
    openings: [
      "Иногда человек бросает тренировки не потому, что слабый. А потому что план с самого начала был не для его жизни.",
      "Самая частая ошибка в фитнесе звучит почти красиво: начать идеально.",
      "Тело редко сопротивляется движению. Чаще оно сопротивляется перегрузу и стыду.",
    ],
    cadence: "Практично и спокойно: узнаваемая проблема -> объяснение без стыда -> один реалистичный шаг -> поддерживающий вывод. Без агрессивной мотивации.",
    emotionalStyle: "Уверенно, дружелюбно, телесно и конкретно. Автор звучит как тренер, который умеет адаптировать нагрузку, а не давить.",
    ctaPatterns: [
      "Выберите сегодня не идеальную тренировку, а минимальный шаг, который реально повторить завтра.",
      "Проверьте план простым вопросом: я смогу жить так месяц, не ненавидя процесс?",
      "Сохраните как напоминание: устойчивость важнее героизма.",
    ],
  },
  marketing: {
    label: "Маркетинг-эксперт",
    expertName: "Маркетинг-эксперт",
    roleKey: "marketing",
    worldview: [
      "Маркетинг начинается не с красивой упаковки, а с ясного понимания клиента, боли и причины поверить.",
      "Сильная коммуникация не кричит громче всех. Она точнее попадает в момент выбора.",
      "Продажи растут, когда эксперт перестает говорить обо всем и формулирует один понятный следующий шаг.",
    ],
    openings: [
      "Иногда контент не продает не потому, что он плохой. А потому что в нем не видно, зачем человеку действовать сейчас.",
      "Самая дорогая ошибка в маркетинге часто выглядит безобидно: говорить слишком общо.",
      "Клиент редко покупает 'экспертность'. Он покупает ясность: мне здесь помогут именно с моей задачей.",
    ],
    cadence: "Деловой, плотный ритм: точное наблюдение -> причина -> пример/контраст -> практический следующий шаг. Без инфобизнес-крика.",
    emotionalStyle: "Спокойная стратегическая уверенность. Меньше хайпа, больше ясности, конкретики и уважения к бизнес-контексту.",
    ctaPatterns: [
      "Проверьте последний пост: после него человеку понятно, что сделать дальше?",
      "Сформулируйте один оффер так, чтобы клиент узнал свою ситуацию в первой строке.",
      "Сохраните как быстрый чек: конкретика продает лучше, чем громкие обещания.",
    ],
  },
};

const STYLE_LOCK_FORBIDDEN_PATTERNS = [
  "в современном мире",
  "важно понимать",
  "следует отметить",
  "таким образом",
  "данная тема",
  "каждый из нас",
  "не бойтесь",
  "просто полюбите себя",
  "работайте над собой",
  "сделайте первый шаг",
  "путь к гармонии",
  "лучшая версия себя",
];

const GENERIC_QUALITY_PATTERNS = [
  ...STYLE_LOCK_FORBIDDEN_PATTERNS,
  "в заключение",
  "подводя итог",
  "помните, что",
  "это нормально",
  "вы достойны",
  "гармоничные отношения",
  "позитивное мышление",
  "саморазвитие",
  "раскрыть потенциал",
];

const DINARA_EXAMPLES_DIR = join(__dirname, "expert_profiles", "dinara", "examples");
const DINARA_WORLDVIEW_DIR = join(__dirname, "expert_profiles", "dinara", "worldview");
const DINARA_WORLDVIEW_FILES = [
  "beliefs.md",
  "recurring_ideas.md",
  "core_emotions.md",
  "relationship_philosophy.md",
  "sexuality_philosophy.md",
];
const DINARA_EXAMPLE_ROUTES = [
  {
    key: "relationships",
    file: "relationships.md",
    keywords: ["отнош", "партнер", "партнёр", "муж", "жена", "любов", "близост", "ссор", "конфликт", "ревност", "расстав"],
  },
  {
    key: "sexuality",
    file: "sexuality.md",
    keywords: ["секс", "сексуаль", "либидо", "желан", "оргазм", "возбужд", "интим", "тело", "стыдно хотеть"],
  },
  {
    key: "shame",
    file: "shame.md",
    keywords: ["стыд", "вина", "неловк", "позор", "осужд", "не такая", "не такой", "смущ"],
  },
  {
    key: "anxiety",
    file: "anxiety.md",
    keywords: ["тревог", "страх", "паник", "беспокой", "контрол", "напряж", "выдох", "неизвест"],
  },
  {
    key: "self-worth",
    file: "self-worth.md",
    keywords: ["самооцен", "ценност", "принят", "любить себя", "недостаточ", "обесцен", "сравнив", "уверен"],
  },
];

function pickDinaraExampleRoute(topic = "") {
  const normalizedTopic = String(topic || "").toLowerCase();
  return DINARA_EXAMPLE_ROUTES.find((route) =>
    route.keywords.some((keyword) => normalizedTopic.includes(keyword))
  ) || DINARA_EXAMPLE_ROUTES[3];
}

async function buildDinaraFewShotPrompt(topic) {
  const route = pickDinaraExampleRoute(topic);
  try {
    const content = await fs.readFile(join(DINARA_EXAMPLES_DIR, route.file), "utf-8");
    const example = content.trim();
    if (!example) return "";
    return [
      "ЖИВОЙ СТИЛЕВОЙ ПРИМЕР ДИНАРЫ:",
      `Тематический маршрут: ${route.key}.`,
      "Используй как интонационный ориентир: похожая живость, начало, паузы, эмоциональная честность. Не копируй формулировки дословно.",
      example,
    ].join("\n");
  } catch (error) {
    console.warn(`[dinara-examples] failed to load ${route.file}: ${error.message}`);
    return "";
  }
}

async function buildDinaraWorldviewPrompt() {
  const sections = [];
  for (const file of DINARA_WORLDVIEW_FILES) {
    try {
      const content = (await fs.readFile(join(DINARA_WORLDVIEW_DIR, file), "utf-8")).trim();
      if (content) sections.push(`Файл ${file}:\n${content}`);
    } catch (error) {
      console.warn(`[dinara-worldview] failed to load ${file}: ${error.message}`);
    }
  }
  if (!sections.length) return "";

  return [
    "МИРОВОЗЗРЕНИЕ ДИНАРЫ:",
    "Держи эти идеи как устойчивую внутреннюю опору автора. Не пересказывай их списком и не цитируй механически. Пусть они проявляются в выборе угла, эмоции, метафоры и финального вопроса.",
    sections.join("\n\n"),
  ].join("\n");
}

const REGENERATION_VARIANTS = {
  default: "",
  softer: "Сделай вариант мягче и интимнее: больше эмоционального признания, меньше советов, давления и категоричности.",
  stronger: "Сделай вариант сильнее: более уверенный тезис, плотнее смысл, меньше сглаживания. Не уходи в агрессию и кликбейт.",
  emotional: "Сделай вариант эмоциональнее: больше телесной и внутренней узнаваемости, живых пауз, ощущения «она правда меня поняла».",
  provocative: "Сделай вариант провокационнее: начни с этичного, но цепляющего тезиса, который ломает привычный миф. Без грубости и манипуляций.",
  expert: "Сделай вариант экспертнее: добавь терапевтическую рамку, причинно-следственную глубину и 1 точное профессиональное наблюдение без сухой лекции.",
  telegram: "Сделай вариант более Telegram-style: сильный первый экран, короткие живые абзацы, разговорные фрагменты, финал как мысль для сохранения.",
  shorter: "Сделай вариант короче: сохрани главную эмоцию и авторский голос, убери вторичные объяснения и повторы.",
  longer: "Сделай вариант длиннее: глубже раскрой переживание, добавь 1-2 смысловых поворота и более объемный терапевтический финал.",
  practical: "Сделай вариант практичнее: оставь тепло, но добавь один ясный маленький шаг, без чек-листа.",
  voice: "Сделай вариант сильнее похожим на автора: больше живой авторской интонации, меньше универсальных AI-формулировок.",
  feedback: "Исправь текст по конкретному комментарию пользователя, сохрани тему, длину и формат Telegram-поста.",
};

function buildFirstGenerationWowInstruction(isFirstGeneration = false) {
  if (!isFirstGeneration) return "";
  return [
    "FIRST POST WOW MODE — КРИТИЧНО:",
    "Это первый сгенерированный пост для пользователя. Нужен максимальный эффект «этот AI-эксперт меня понимает».",
    "- Style lock, worldview, examples и persona важнее универсальной полезности.",
    "- Первый абзац должен быть эмоционально точным и узнаваемым, без разгона и вводных.",
    "- Добавь больше живой психологической реалистичности: внутренний конфликт, маленькая честная деталь, человеческая пауза.",
    "- Не делай безопасный средний вариант. Лучше чуть смелее, теплее и конкретнее, чем гладко и обезличенно.",
    "- Финал должен звучать как авторская мысль, которую хочется сохранить или переслать.",
  ].join("\n");
}

// ─── СТИЛИ СЕКСОЛОГА ─────────────────────────────────────────────────────────

// ─── ПРЕСЕТЫ ─────────────────────────────────────────────────────────────────

const CONTENT_PRESETS = [
  {
    id: "emotional",
    label: "💔 Emotional post",
    lengthMode: "normal",
    instruction: "Формат: эмоциональный пост. Начни с узнаваемого внутреннего переживания, дай ощущение «меня поняли», затем мягко переведи к осознанию. Минимум объяснений, максимум живой человеческой правды.",
  },
  {
    id: "expert",
    label: "🧠 Expert post",
    lengthMode: "normal",
    instruction: "Формат: экспертный пост. Дай ясную профессиональную рамку, 1-2 точных наблюдения и практичный вывод. Без сухой лекции, без академического тона.",
  },
  {
    id: "reels",
    label: "🎬 Reels script",
    lengthMode: "short",
    instruction: "Формат: сценарий Reels. Короткий крючок, 3-5 реплик для голоса, финальная фраза. Пиши как устную речь, без длинных абзацев.",
  },
  {
    id: "storytelling",
    label: "📖 Storytelling",
    lengthMode: "long",
    instruction: "Формат: storytelling. Построй текст через маленькую сцену или узнаваемую ситуацию, затем раскрой смысл и заверши теплым вопросом.",
  },
  {
    id: "provocative",
    label: "⚡ Provocative post",
    lengthMode: "normal",
    instruction: "Формат: провокационный пост. Начни с сильного, но этичного тезиса, который ломает привычный миф. Не скатывайся в агрессию или кликбейт.",
  },
  {
    id: "warm",
    label: "🌿 Warm audience",
    lengthMode: "normal",
    instruction: "Формат: теплый пост для своей аудитории. Больше заботы, принятия и спокойного контакта. Финал должен звучать как приглашение, а не как инструкция.",
  },
  {
    id: "sales_soft",
    label: "🤝 Sales soft",
    lengthMode: "normal",
    instruction: "Формат: мягкая продажа. Сначала ценность и узнавание проблемы, затем естественный мост к консультации/продукту без давления, обещаний результата и манипуляций.",
  },
  {
    id: "longread",
    label: "📚 Longread",
    lengthMode: "long",
    instruction: "Формат: longread. Разверни тему глубже: проблема, почему она держится, что человек может заметить в себе, мягкий практический вывод. Без списков ради списков.",
  },
];

function getContentPreset(id) {
  return CONTENT_PRESETS.find((preset) => preset.id === id) || null;
}

function buildContentPresetInstruction(presetId) {
  const preset = getContentPreset(presetId);
  return preset ? `\n\nCONTENT PRESET:\n${preset.instruction}` : "";
}

function compactList(items = [], fallback = "") {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length ? list.map((item) => `- ${item}`).join("\n") : fallback;
}

function buildTemplateStyleLock(template) {
  if (!template) return "";
  return [
    "STARTER TEMPLATE STYLE LOCK:",
    `Role: ${template.label}`,
    "",
    "Worldview:",
    compactList(template.worldview),
    "",
    "Openings to imitate structurally, not copy:",
    compactList(template.openings),
    "",
    `Cadence: ${template.cadence}`,
    `Emotional style: ${template.emotionalStyle}`,
    "",
    "CTA patterns:",
    compactList(template.ctaPatterns),
  ].join("\n");
}

function buildStyleLockPrompt({ userScenarioContext, scenario, template, tuning = DEFAULT_RUNTIME_TUNING }) {
  const scenarioLabel = template?.label || userScenarioContext?.scenario?.label || getBuiltInScenarioLabel(scenario);
  const styleStrength = tuning.style_lock_strength || "strong";
  const styleStrengthLine = {
    light: "Runtime strength: light — держи стиль, но допускай больше ясности и простоты.",
    normal: "Runtime strength: normal — баланс узнаваемого голоса и понятной экспертности.",
    strong: "Runtime strength: strong — голос, cadence и openings важнее универсальной блоговой структуры.",
    strict: "Runtime strength: strict — если текст звучит generic, перепиши угол, первый экран и финал до узнаваемости.",
  }[styleStrength] || "Runtime strength: strong.";
  return [
    "STYLE LOCK — ОБЯЗАТЕЛЬНО ПЕРЕД ГЕНЕРАЦИЕЙ:",
    `Пиши не как универсальный ассистент, а как конкретный эксперт: ${scenarioLabel}.`,
    styleStrengthLine,
    "",
    "Зафиксируй 6 якорей голоса:",
    "1. Tone: один узнаваемый эмоциональный тон на весь текст; не смешивай лекцию, мотивацию и продающий стиль.",
    "2. Cadence: абзацы разной длины, живые паузы, 1-2 короткие строки отдельно; не делай ровную AI-структуру.",
    "3. Paragraph rhythm: сначала чувство/наблюдение, затем смысл, затем мягкий практический сдвиг. Не начинай с определения темы.",
    "4. Emotional framing: читатель должен почувствовать «меня поняли» до того, как получит совет.",
    "5. Openings: начинай с конкретного переживания, вопроса или наблюдения, а не с объяснения актуальности.",
    "6. CTA style: финал тихий, человеческий, без давления; вопрос к себе или маленькое разрешение лучше прямого призыва.",
    "",
    "Forbidden patterns:",
    compactList(STYLE_LOCK_FORBIDDEN_PATTERNS),
    "",
    "Если style guidance или template дают конкретные openings/cadence/CTA, они важнее общего блогового стиля.",
    buildTemplateStyleLock(template),
  ].filter(Boolean).join("\n");
}

function genericQualitySignals(text = "") {
  const normalized = String(text || "").toLowerCase();
  const paragraphs = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const firstParagraph = paragraphs[0] || "";
  const foundPatterns = GENERIC_QUALITY_PATTERNS.filter((pattern) => normalized.includes(pattern));
  const avgParagraphLength = paragraphs.length
    ? paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length
    : 0;
  const longEvenParagraphs = paragraphs.length >= 3 && paragraphs.filter((p) => p.length > 260).length >= Math.ceil(paragraphs.length * 0.7);
  const listLike = /^(\d+\.|[-•])\s/m.test(text);
  const genericOpening = /^(сегодня|в этом посте|важно|многие люди|каждый из нас|тема|давайте поговорим)/i.test(firstParagraph);
  const noPersonalPresence = !/(иногда|знаете|мне хочется|я часто вижу|внутри|тело|стыд|страх|устал|больно|можно|попробуйте)/i.test(text);
  const score =
    foundPatterns.length * 2 +
    (genericOpening ? 3 : 0) +
    (listLike ? 2 : 0) +
    (longEvenParagraphs ? 2 : 0) +
    (avgParagraphLength > 360 ? 1 : 0) +
    (noPersonalPresence ? 2 : 0);
  return {
    tooGeneric: score >= 4,
    score,
    foundPatterns,
    reasons: [
      ...(genericOpening ? ["generic opening"] : []),
      ...(listLike ? ["list-like structure"] : []),
      ...(longEvenParagraphs ? ["even long paragraphs"] : []),
      ...(noPersonalPresence ? ["weak emotional presence"] : []),
      ...foundPatterns.map((pattern) => `generic phrase: ${pattern}`),
    ].slice(0, 8),
  };
}

async function rewriteGenericPostOnce({ text, topic, context, lengthInstruction, systemPrompt, contentPresetInstruction, styleLockPrompt, maxTokens }) {
  const quality = genericQualitySignals(text);
  if (!quality.tooGeneric) return { text, quality, rewritten: false };

  let rewrite = null;
  try {
    rewrite = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: [systemPrompt, styleLockPrompt].filter(Boolean).join("\n\n") },
        {
          role: "user",
          content: [
            `Тема: "${topic}"`,
            "",
            `Контекст:\n${context}`,
            "",
            `${lengthInstruction} С одной жирной фразой (*жирный*).${contentPresetInstruction}`,
            "",
            "ANTI-GENERIC REWRITE PASS:",
            `Текущий текст слишком общий. Сигналы: ${quality.reasons.join("; ") || "generic drift"}.`,
            "Перепиши один раз целиком: больше авторского присутствия, конкретного переживания, неровного живого ритма и мягкого финала.",
            "Не добавляй списки, заголовки, канцелярит, мотивационные лозунги и универсальные выводы.",
            "",
            "Текст для переписывания:",
            text,
          ].join("\n"),
        },
      ],
      temperature: 0.74,
      max_tokens: maxTokens,
    });
  } catch (error) {
    console.warn("Anti-generic rewrite failed:", error.message);
    return { text, quality, rewritten: false, rewrite_failed: true };
  }

  const rewrittenText = humanizeGeneratedPostText(rewrite.choices[0].message.content);
  return {
    text: rewrittenText,
    quality: genericQualitySignals(rewrittenText),
    rewritten: true,
    firstPassQuality: quality,
  };
}

function getPresets(chatId) {
  return (userState.get(chatId) || {}).presets || [];
}

function savePreset(chatId, preset) {
  const state = userState.get(chatId) || {};
  const presets = state.presets || [];
  const exists = presets.findIndex(p =>
    p.scenario === preset.scenario && p.lengthMode === preset.lengthMode && p.styleKey === preset.styleKey
  );
  if (exists >= 0) presets.splice(exists, 1);
  presets.unshift(preset);
  if (presets.length > 3) presets.pop();
  state.presets = presets;
  userState.set(chatId, state);
}


// ─── ТЕМЫ ПО СЦЕНАРИЯМ ───────────────────────────────────────────────────────

const QUICK_TOPICS_PSYCH = [
  "тревога и страхи",
  "отношения и любовь",
  "выгорание и усталость",
  "принятие себя",
];

const QUICK_TOPICS_SEX = [
  "либидо и как на него влиять",
  "оргазм: мифы и реальность",
  "сексуальные фантазии — норма или нет",
  "боль во время секса — что делать",
];

const START_KEYBOARD = {
  keyboard: [[{ text: "\uD83D\uDE80 Старт" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVE_KEYBOARD = { remove_keyboard: true };

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const userState = new Map();

const ABUSE_LIMITS = {
  generationCooldownMs: 45_000,
  mediaCooldownMs: 20_000,
  uploadCooldownMs: 4_000,
  maxUploadBytes: Math.max(1, Number(process.env.MAX_UPLOAD_MB || 12)) * 1024 * 1024,
  maxTextUploadChars: 16_000,
  maxTopicChars: 500,
  maxUploadsPerHour: 20,
};

const ALLOWED_ONBOARDING_EXTENSIONS = {
  knowledge: [".txt", ".md", ".pdf", ".docx"],
  style: [".txt", ".md", ".pdf", ".docx"],
  avatar: [".jpg", ".jpeg", ".png", ".webp"],
  voice: [".ogg", ".oga", ".mp3", ".m4a", ".wav"],
};

function nowMs() {
  return Date.now();
}

function rememberStateEvent(state, key, ts = nowMs(), windowMs = 60 * 60 * 1000) {
  const values = Array.isArray(state[key]) ? state[key] : [];
  values.push(ts);
  state[key] = values.filter((value) => ts - value < windowMs).slice(-100);
  return state[key];
}

function checkCooldown(state, key, cooldownMs) {
  const last = Number(state[key] || 0);
  const remainingMs = cooldownMs - (nowMs() - last);
  if (remainingMs <= 0) return { ok: true, remainingSec: 0 };
  return { ok: false, remainingSec: Math.ceil(remainingMs / 1000) };
}

function canAcceptUploadEvent(state) {
  const events = rememberStateEvent(state, "uploadEvents");
  if (events.length > ABUSE_LIMITS.maxUploadsPerHour) {
    return { ok: false, reason: "hour_limit" };
  }
  const cooldown = checkCooldown(state, "lastUploadAt", ABUSE_LIMITS.uploadCooldownMs);
  if (!cooldown.ok) return { ok: false, reason: "cooldown", remainingSec: cooldown.remainingSec };
  state.lastUploadAt = nowMs();
  return { ok: true };
}

function validateOnboardingUpload(step, msg) {
  if (msg.text && ["knowledge", "style"].includes(step)) {
    const text = msg.text.trim();
    if (!text) return { ok: false, reason: "empty_text" };
    if (text.length > ABUSE_LIMITS.maxTextUploadChars) {
      return { ok: false, reason: "text_too_large", limit: ABUSE_LIMITS.maxTextUploadChars };
    }
    if (/^https?:\/\/\S+$/i.test(text) && text.length > 1800) {
      return { ok: false, reason: "broken_link" };
    }
    return { ok: true };
  }

  const file = msg.document || msg.audio || msg.voice || null;
  if (file) {
    const size = Number(file.file_size || 0);
    if (size > ABUSE_LIMITS.maxUploadBytes) {
      return { ok: false, reason: "file_too_large", size };
    }
    const name = msg.document?.file_name || msg.audio?.file_name || "";
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    if (msg.document && ALLOWED_ONBOARDING_EXTENSIONS[step] && !ALLOWED_ONBOARDING_EXTENSIONS[step].includes(ext)) {
      return { ok: false, reason: "bad_extension", ext };
    }
    if (["knowledge", "style"].includes(step) && !msg.document) {
      return { ok: false, reason: "bad_extension", ext: "media" };
    }
    if (step === "voice" && !(msg.voice || msg.audio || msg.document)) {
      return { ok: false, reason: "bad_extension", ext };
    }
  }
  if (msg.photo && step !== "avatar") return { ok: false, reason: "bad_extension", ext: "photo" };
  return { ok: true };
}

async function guardMediaAction(chatId, label = "медиа") {
  const state = userState.get(chatId) || {};
  const cooldown = checkCooldown(state, "lastMediaActionAt", ABUSE_LIMITS.mediaCooldownMs);
  if (!cooldown.ok) {
    await bot.sendMessage(chatId, `Подождите ${cooldown.remainingSec} сек. перед следующей ${label}-операцией.`);
    return false;
  }
  state.lastMediaActionAt = nowMs();
  userState.set(chatId, state);
  return true;
}

async function guardRuntimeQuotaForAction(chatId, limitType, label = "операция") {
  const quota = await checkRuntimeGenerationQuota(chatId, {}, limitType);
  if (!quota.ok) {
    await handleRuntimeLimitExhausted(chatId, limitType, quota.runtime, { demoMode: false });
    return false;
  }
  return true;
}

function uploadRejectionText(reason, details = {}) {
  if (reason === "hour_limit") return "Слишком много загрузок за короткое время. Давайте продолжим чуть позже, чтобы материалы не потерялись.";
  if (reason === "cooldown") return `Файл вижу. Подождите ${details.remainingSec || 3} сек. и отправьте ещё раз.`;
  if (reason === "file_too_large") return `Файл слишком большой для быстрого онбординга. Лучше отправьте TXT/DOCX/PDF до ${Math.round(ABUSE_LIMITS.maxUploadBytes / 1024 / 1024)} МБ или вставьте главный фрагмент текстом.`;
  if (reason === "text_too_large") return "Текст слишком длинный для одного сообщения. Разбейте его на 2-3 части или загрузите TXT/DOCX.";
  if (reason === "bad_extension") return "Этот формат сейчас не обрабатываю в онбординге. Подойдут TXT, DOCX, PDF, фото для аватара или аудио для голоса.";
  if (reason === "broken_link") return "Ссылка выглядит некорректно или слишком длинно. Пришлите обычную ссылку и, если можно, вставьте текст поста рядом.";
  return "Материал не получилось принять. Попробуйте отправить текстом, TXT, DOCX или PDF.";
}

function friendlyErrorMessage(error, area = "generation") {
  const raw = String(error?.message || error || "").toLowerCase();
  if (raw.includes("rate") || raw.includes("429")) {
    return "Сервис генерации сейчас просит паузу. Подождите минуту и попробуйте снова.";
  }
  if (raw.includes("timeout") || raw.includes("network") || raw.includes("fetch")) {
    return "Похоже, внешний сервис временно не ответил. Ваши материалы и тема сохранены, можно повторить запрос.";
  }
  if (raw.includes("api key") || raw.includes("401") || raw.includes("403")) {
    return "Не удалось обратиться к AI-сервису из-за настройки доступа. Я сохранил состояние, администратор сможет проверить ключи.";
  }
  if (area === "extraction") {
    return "Материал сохранён, но текст из него извлечь не удалось. Лучше отправьте тот же материал текстом или в DOCX/TXT.";
  }
  return "Генерация не дошла до конца. Тема сохранена, можно повторить или выбрать другой формат.";
}

function scoreToPoints(score) {
  return score === "good" ? 25 : score === "medium" ? 16 : score === "weak" ? 7 : 10;
}

function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => { if (text.includes(word)) score += 1; });
  return score;
}

async function vectorSearch(query, scenario, limit = 5) {
  if (!supabase) return null;
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.slice(0, 8000),
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_scenario: scenario,
      match_count: limit,
    });
    if (error) { console.error("Vector search error:", error.message); return null; }
    debugLog(`Vector search [${scenario}]: found ${data?.length || 0} chunks`);
    return data;
  } catch (err) {
    console.error("Vector search failed:", err.message);
    return null;
  }
}

function writeMsgpack(val) {
  if (typeof val === 'boolean') return Buffer.from([val ? 0xc3 : 0xc2]);
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 0 && val <= 127) return Buffer.from([val]);
    const b = Buffer.alloc(5); b[0] = 0xd2; b.writeInt32BE(val, 1); return b;
  }
  if (typeof val === 'string') {
    const strBuf = Buffer.from(val, 'utf8');
    const len = strBuf.length;
    if (len <= 31) return Buffer.concat([Buffer.from([0xa0 | len]), strBuf]);
    if (len <= 255) return Buffer.concat([Buffer.from([0xd9, len]), strBuf]);
    return Buffer.concat([Buffer.from([0xda, len >> 8, len & 0xff]), strBuf]);
  }
  if (val && typeof val === 'object') {
    const keys = Object.keys(val);
    const parts = [Buffer.from([0x80 | keys.length])];
    for (const key of keys) { parts.push(writeMsgpack(key)); parts.push(writeMsgpack(val[key])); }
    return Buffer.concat(parts);
  }
  return Buffer.from([0xc0]);
}

async function uploadAudioToCloudinary(audioBuffer, filename = "voice.mp3") {
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new Error("Cloudinary не настроен.");
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `audio_${timestamp}`;
  const crypto = await import('crypto');
  const signature = crypto.createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest('hex');
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  formData.append("public_id", publicId);
  formData.append("timestamp", timestamp.toString());
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: "POST", body: formData });
  const resText = await res.text();
  if (!res.ok) throw new Error(`Cloudinary error: ${resText}`);
  const url = JSON.parse(resText).secure_url;
  if (!url) throw new Error("Cloudinary: no URL");
  return url;
}

const MUSIC_LIBRARY = [
  { id:"473545", name:"Медитация 1", genre:"Ambient", mood:"спокойный", tags:["ambient","тревога","принятие"], url:"https://cdn.freesound.org/previews/473/473545_9497060-lq.mp3" },
  { id:"695879", name:"Медитация 2", genre:"Ambient", mood:"медитативный", tags:["ambient","усталость","страх"], url:"https://cdn.freesound.org/previews/695/695879_12516898-lq.mp3" },
  { id:"328368", name:"Природа", genre:"Ambient", mood:"расслабляющий", tags:["ambient","принятие","рост"], url:"https://cdn.freesound.org/previews/328/328368_2305278-lq.mp3" },
  { id:"197173", name:"Тишина", genre:"Ambient", mood:"тихий", tags:["ambient","одиночество","грусть"], url:"https://cdn.freesound.org/previews/197/197173_3664710-lq.mp3" },
  { id:"718704", name:"Мягкий эмбиент", genre:"Ambient", mood:"мягкий", tags:["ambient","отношения","принятие"], url:"https://cdn.freesound.org/previews/718/718704_15412548-lq.mp3" },
  { id:"740609", name:"Спокойствие", genre:"Ambient", mood:"безмятежный", tags:["ambient","тревога","усталость"], url:"https://cdn.freesound.org/previews/740/740609_5479102-lq.mp3" },
  { id:"42933", name:"Флейта", genre:"Медитация", mood:"нежный", tags:["piano","грусть","одиночество"], url:"https://cdn.freesound.org/previews/42/42933_50371-lq.mp3" },
  { id:"530217", name:"Атмосфера", genre:"Ambient", mood:"глубокий", tags:["ambient","рост","принятие"], url:"https://cdn.freesound.org/previews/530/530217_6628165-lq.mp3" },
  { id:"786272", name:"Дзен", genre:"Медитация", mood:"дзен", tags:["ambient","страх","тревога"], url:"https://cdn.freesound.org/previews/786/786272_5479102-lq.mp3" },
  { id:"789302", name:"Природа 2", genre:"Ambient", mood:"лесной", tags:["ambient","усталость","грусть"], url:"https://cdn.freesound.org/previews/789/789302_16936704-lq.mp3" },
];

async function selectMusicTracks(text, count = 3) {
  return shuffleArray(MUSIC_LIBRARY).slice(0, count);
}

async function downloadTrack(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg,audio/webm,audio/ogg,audio/*;q=0.9,*/*;q=0.5",
        "Referer": "https://freesound.org/",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function mixAudioWithMusic(voiceBuffer, musicUrl) {
  const tmp = await fs.mkdtemp(join(tmpdir(), "mvp-content-api-"));
  const voicePath = join(tmp, `voice_${Date.now()}.mp3`);
  const musicPath = join(tmp, `music_${Date.now()}.mp3`);
  const outputPath = join(tmp, `mixed_${Date.now()}_${randomUUID()}.mp3`);
  try {
    await fs.writeFile(voicePath, voiceBuffer);
    const musicBuffer = await downloadTrack(musicUrl).catch(e => { throw new Error(`Загрузка трека: ${e.message}`); });
    await fs.writeFile(musicPath, musicBuffer);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath).input(musicPath)
        .complexFilter([
          `[1:a]volume=0.35[music_vol]`,
          `[music_vol]apad[music_pad]`,
          `[0:a]volume=1.0[voice]`,
          `[voice][music_pad]amix=inputs=2:duration=first:dropout_transition=3[out]`,
        ], 'out')
        .audioCodec('libmp3lame').audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve).on('error', reject).run();
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.unlink(voicePath).catch(() => {});
    await fs.unlink(musicPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

const AUDIO_PRICE_PER_CHAR = 0.000008;

async function generateVoice(text, voiceProfileId = FISH_AUDIO_VOICE_ID) {
  if (!FISH_AUDIO_API_KEY || !voiceProfileId) {
    throw new Error("Voice generation is not configured yet.");
  }
  const payload = writeMsgpack({
    text, reference_id: voiceProfileId,
    format: "mp3", mp3_bitrate: 128, normalize: true, latency: "normal",
  });
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { "Authorization": `Bearer ${FISH_AUDIO_API_KEY}`, "Content-Type": "application/msgpack" },
    body: payload,
  });
  if (!response.ok) throw new Error(`Fish Audio error: ${await response.text()}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, cost: text.length * AUDIO_PRICE_PER_CHAR };
}

async function buildTopicScenePrompt(topic) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Topic: "${topic}".\nDescribe one short scene (English, 1-2 sentences) where a woman is in a place fitting this topic.\nOnly place/atmosphere, no person, realistic, cozy.\nExample: "sitting at outdoor cafe table, warm golden sunlight, bokeh background"\nAnswer:` }],
    temperature: 0.7, max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function translateScene(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Translate to English for image prompt. Location/atmosphere only, concise:\n\n${text}` }],
    temperature: 0.3, max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function generateImage(chatId, scenePrompt, imageProfile = {}) {
  await bot.sendMessage(chatId, "\u23F3 Генерирую фото ~60 сек...");
  const fullPrompt = `${BASE_PROMPT}, ${scenePrompt}`;
  const loraUrl = imageProfile.loraUrl || LORA_URL;
  const res = await fetch("https://fal.run/fal-ai/flux-lora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: fullPrompt, loras: [{ path: loraUrl, scale: 0.85 }], num_inference_steps: 28, image_size: "square_hd" }),
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error(`fal photo error ${res.status}: ${rawText}`);
  const data = JSON.parse(rawText);
  const imageUrl = data.images[0].url;
  const costHeader = res.headers.get('x-fal-cost') || res.headers.get('x-fal-billing-cost');
  const photoCost = costHeader ? parseFloat(costHeader) : 0.035;
  return { imageUrl, cost: photoCost, scenePrompt };
}

async function generateVideoAurora(chatId, imageUrl, audioUrl) {
  const statusMsg = await bot.sendMessage(chatId, "\uD83C\uDFAC Шаг 1/3 — Отправляю запрос...");
  const msgId = statusMsg.message_id;
  const submitRes = await fetch("https://queue.fal.run/fal-ai/creatify/aurora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, prompt: AURORA_PROMPT, resolution: "720p" }),
  });
  const submitText = await submitRes.text();
  if (!submitRes.ok) {
    await bot.editMessageText(friendlyErrorMessage(new Error(`Aurora submit error ${submitRes.status}`), "generation"), { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora submit error: ${submitText}`);
  }
  let submitData;
  try { submitData = JSON.parse(submitText); } catch(e) { throw new Error(`Aurora JSON error`); }
  const { request_id, status_url, response_url } = submitData;
  if (!request_id) throw new Error("Aurora: no request_id");
  await bot.editMessageText("\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает...\n\u23F1 Обычно 2-4 минуты", { chat_id: chatId, message_id: msgId });
  const pollUrl = status_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}/status`;
  const resultUrl = response_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`;
  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(pollUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const statusText = await statusRes.text();
    if (!statusText.trim()) continue;
    let status;
    try { status = JSON.parse(statusText); } catch(e) { continue; }
    if (i > 0 && i % 6 === 0) {
      const elapsed = Math.round((i + 1) * 5 / 60);
      await bot.editMessageText(`\u2699\uFE0F Шаг 2/3...\n\u23F1 Прошло ~${elapsed} мин`, { chat_id: chatId, message_id: msgId }).catch(() => {});
    }
    if (status.status === "COMPLETED") {
      await bot.editMessageText("\u2705 Шаг 3/3 — Видео готово!", { chat_id: chatId, message_id: msgId });
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const result = JSON.parse(await resultRes.text());
      const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video_url;
      if (!videoUrl) throw new Error(`Aurora: no video URL`);
      return { videoUrl, cost: result.cost ?? result.data?.cost ?? 1.47 };
    }
    if (status.status === "FAILED") throw new Error(`Aurora failed`);
  }
  throw new Error("Aurora timeout");
}

// ─── UI ФУНКЦИИ ──────────────────────────────────────────────────────────────

async function sendOnboarding(chatId, step = 1) {
  const skipRow = [
    { text: "⏭ Пропустить", callback_data: "skip_onboard" },
    { text: "🚫 Больше не показывать", callback_data: "dis_onboard" },
  ];
  if (step === 1) {
    await bot.sendMessage(chatId,
      `\u{1F331} *Привет! Я — контент-помощник Динары Качаевой*\n\nСоздаю профессиональные посты для Instagram и Telegram.\n\n*Что умею:*\n✨ Текст в стиле психолога\n🎙 Аудио голосом Динары\n🎵 Музыка по настроению\n🖼 Фото с ИИ\n🎬 Видео`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "➡️ Как это работает?", callback_data: "onboard_2" }],
          skipRow,
        ]},
      }
    );
  } else if (step === 2) {
    await bot.sendMessage(chatId,
      `💡 *Как это работает:*\n\n*1.* Выберите сценарий: Психолог или Сексолог\n*2.* Выберите тему из списка или напишите свою\n*3.* Выберите длину и стиль\n*4.* Получите готовый текст\n*5.* Добавьте аудио, фото, видео\n*6.* Опубликуйте в канал ✅`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "← Назад", callback_data: "onboard_1" }, { text: "➡️ Попробовать", callback_data: "onboard_3" }],
          skipRow,
        ]},
      }
    );
  } else {
    await sendTopicMenu(chatId);
  }
}

function getBuiltInScenarioLabel(scenario) {
  if (scenario === "sexologist") return "💜 Сексолог Динара";
  if (scenario === "psychologist") return "🧠 Психолог Динара";
  return ONBOARDING_ROLES[scenario]?.label || scenario || "Эксперт";
}

async function getScenarioLabel(chatId, scenario) {
  const userScenario = await loadUserScenario(chatId, scenario);
  if (userScenario) return `⭐ ${userScenario.label}`;
  return getBuiltInScenarioLabel(scenario);
}

function onboardingControls(category) {
  const rows = [];
  if (["knowledge", "style"].includes(category)) {
    rows.push([{ text: "💡 Что лучше загрузить?", callback_data: `ob_help_upload:${category}` }]);
  }
  rows.push([{ text: "✅ Готово, дальше", callback_data: `ob_done:${category}` }]);
  rows.push([{ text: "❌ Отменить", callback_data: "ob_cancel" }]);
  return {
    reply_markup: { inline_keyboard: rows },
  };
}

function onboardingCategoryLabel(category) {
  return {
    knowledge: "материалы",
    style: "примеры стиля",
    avatar: "аватар",
    voice: "голос",
  }[category] || category;
}

function buildUploadVisibilityText(category, stored, count) {
  const label = onboardingCategoryLabel(category);
  const lines = [
    `✅ Принято: ${stored.original_name}`,
    `Раздел: ${label}`,
    `Всего в разделе: ${count}`,
    "",
    "Статус обработки:",
    "• processed: файл сохранён",
  ];

  if (category === "knowledge") {
    lines.push("• queued: добавлен в базу материалов эксперта");
    lines.push("• worldview updated: обновится при сборке persona");
  } else if (category === "style") {
    lines.push("• queued: добавлен в примеры авторского голоса");
    lines.push("• examples updated: обновится при сборке persona");
  } else if (category === "avatar") {
    lines.push("• queued: фото доступно для будущей генерации визуала");
  } else if (category === "voice") {
    lines.push("• queued: sample доступен для будущей настройки голоса");
  }

  return lines.join("\n");
}

function qualityLabel(score) {
  return {
    good: "good",
    medium: "medium",
    weak: "weak",
  }[score] || "unknown";
}

function buildUploadRecoverySuggestions(category, quality = null) {
  const weakStyle = quality?.style_learning === "weak";
  const weakExpert = quality?.expert_learning === "weak";
  if (category === "knowledge") {
    const suggestions = [
      "Recovery suggestions:",
      "• Add 1-3 longer texts where you explain your approach, beliefs, cases, objections, or client situations.",
      "• If you pasted a link, also paste the article/post text. Telegram often cannot read the page content from a bare URL.",
      "• Add a short note: who your audience is, what you believe, what you never promise, and what topics you avoid.",
    ];
    if (weakExpert) suggestions.push("• Current material is thin for worldview. A 10-15 sentence expert note will help more than another short link.");
    return suggestions;
  }
  if (category === "style") {
    const suggestions = [
      "Recovery suggestions:",
      "• Add 3-5 real posts written by you. Best format: full text, not screenshots and not links only.",
      "• Include posts with different moods: expert, personal, selling softly, reflective, practical.",
      "• Add one post you especially like and one you do not want the AI to imitate.",
    ];
    if (weakStyle) suggestions.push("• Current sample is weak for rhythm. Longer paragraphs with your openings and endings will improve the first WOW-post.");
    return suggestions;
  }
  return [];
}

function buildMaterialQualityText(quality, category = "") {
  if (!quality) return "";
  const warnings = Array.isArray(quality.warnings) ? quality.warnings.filter(Boolean).slice(0, 3) : [];
  const useful = Array.isArray(quality.useful_signals) ? quality.useful_signals.filter(Boolean).slice(0, 2) : [];
  const lines = [
    "",
    "Material quality:",
    `• overall: ${qualityLabel(quality.score)}`,
    `• style learning: ${qualityLabel(quality.style_learning)}`,
    `• expert learning: ${qualityLabel(quality.expert_learning)}`,
  ];
  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`• ${warning}`);
  }
  if (useful.length > 0) {
    lines.push("Useful signals:");
    for (const signal of useful) lines.push(`• ${signal}`);
  }
  if (quality.score === "weak" || quality.style_learning === "weak" || quality.expert_learning === "weak") {
    lines.push(...buildUploadRecoverySuggestions(category || quality.category || "", quality));
  }
  return lines.join("\n");
}

async function readLatestMaterialQualities(userId, category) {
  const dir = join(getUserRoot(userId), category === "style" ? "style/pending" : "knowledge/pending");
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const qualities = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).slice(-12)) {
    try {
      const meta = JSON.parse(await fs.readFile(join(dir, entry.name), "utf-8"));
      if (meta?.quality) qualities.push(meta.quality);
    } catch {}
  }
  return qualities;
}

function bestQualityScore(qualities, field) {
  if (!qualities.length) return "unknown";
  const rank = { good: 3, medium: 2, weak: 1, unknown: 0 };
  return qualities
    .map((quality) => quality?.[field] || quality?.score || "unknown")
    .sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || "unknown";
}

async function buildReadinessScore(userId) {
  const inventory = await getOnboardingInventory(userId);
  const [knowledgeQualities, styleQualities, persona, worldview, styleGuidance] = await Promise.all([
    readLatestMaterialQualities(userId, "knowledge"),
    readLatestMaterialQualities(userId, "style"),
    readProfileDraft(userId, "persona.md", 2000),
    readProfileDraft(userId, "worldview.md", 2000),
    readProfileDraft(userId, "style_guidance.md", 2000),
  ]);
  const styleQuality = inventory.counts.style > 0 ? bestQualityScore(styleQualities, "style_learning") : (styleGuidance ? "medium" : "weak");
  const expertQuality = inventory.counts.knowledge > 0 ? bestQualityScore(knowledgeQualities, "expert_learning") : (worldview ? "medium" : "weak");
  const personalizationQuality = persona && (styleGuidance || inventory.counts.style > 0)
    ? (styleQuality === "good" ? "good" : "medium")
    : "weak";
  const onboardingCompleteness = inventory.profile?.status === "completed" && inventory.scenarios.length > 0
    ? (inventory.counts.knowledge + inventory.counts.style + inventory.counts.avatar + inventory.counts.voice >= 3 ? "good" : "medium")
    : "weak";
  const total = Math.min(100,
    scoreToPoints(styleQuality) +
    scoreToPoints(personalizationQuality) +
    scoreToPoints(expertQuality) +
    scoreToPoints(onboardingCompleteness)
  );
  const label = total >= 78 ? "уверенно готов" : total >= 55 ? "готов к тестам" : "нужны ещё материалы";
  const nextStep = total >= 78
    ? "Можно генерировать и собирать обратную связь."
    : inventory.counts.style === 0
      ? "Добавьте 3-5 реальных постов, чтобы голос стал заметно ближе."
      : inventory.counts.knowledge === 0
        ? "Добавьте экспертную заметку или разбор подхода, чтобы worldview стал точнее."
        : "Сделайте тестовый пост и отметьте, что звучит не как вы.";
  return {
    total,
    label,
    styleQuality,
    personalizationQuality,
    expertQuality,
    onboardingCompleteness,
    nextStep,
    inventory,
  };
}

function buildReadinessSummaryText(readiness) {
  return [
    `Готовность AI-эксперта: ${readiness.total}/100 — ${readiness.label}`,
    `Стиль: ${qualityLabel(readiness.styleQuality)}`,
    `Персонализация: ${qualityLabel(readiness.personalizationQuality)}`,
    `Экспертная база: ${qualityLabel(readiness.expertQuality)}`,
    `Онбординг: ${qualityLabel(readiness.onboardingCompleteness)}`,
    `Следующий шаг: ${readiness.nextStep}`,
  ].join("\n");
}

async function sendUploadRecoveryGuide(chatId, category) {
  const title = category === "style" ? "Как усилить стиль" : "Как усилить материалы";
  const lines = [
    `${title}:`,
    "",
    ...buildUploadRecoverySuggestions(category),
    "",
    category === "style"
      ? "Минимум для хорошего старта: 3 полноценных поста по 800-1500 знаков."
      : "Минимум для хорошего старта: 1 экспертная заметка на 15-25 предложений или 2-3 длинных поста.",
    "",
    "Можно продолжить прямо здесь: отправьте текст, TXT/DOCX/PDF или ссылку плюс скопированный текст."
  ];
  await bot.sendMessage(chatId, lines.join("\n"), onboardingControls(category));
}

async function sendBetaOnboardingGuide(chatId) {
  await bot.sendMessage(chatId, [
    "Beta onboarding guide",
    "",
    "Как обучить AI-эксперта быстро:",
    "1. Выберите роль: психолог, сексолог, коуч, блогер или другой сценарий.",
    "2. Добавьте материалы знаний: подход, заметки, разборы, вопросы клиентов, ограничения и темы, которые нельзя обещать.",
    "3. Добавьте стиль: 3-5 реальных постов автора целиком. Лучше текстом, TXT, DOCX или PDF.",
    "4. Сделайте первый тестовый пост и отметьте, что не похоже: мягче, экспертнее, личнее, короче.",
    "",
    "Лучшие материалы:",
    "• длинный пост с сильным мнением автора",
    "• разбор частой боли аудитории",
    "• текст, где видны любимые фразы, паузы и финалы",
    "• список «я так не пишу / я так не обещаю»",
    "",
    "Слабые материалы:",
    "• только ссылки без текста",
    "• рекламные короткие подписи",
    "• скриншоты вместо текста",
    "• случайные статьи без авторской позиции",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: "Загрузить материалы", callback_data: "ob_upload_more:knowledge" }],
      [{ text: "Загрузить стиль", callback_data: "ob_upload_more:style" }],
      [{ text: "Dashboard", callback_data: "ob_dashboard" }],
    ]},
  });
}

async function rebuildPersonaAndNotify(chatId, userId, intro = "Обновляю persona, worldview и examples из материалов...") {
  const status = await bot.sendMessage(chatId, intro);
  const setProgress = async (text) => {
    await bot.editMessageText(text, { chat_id: chatId, message_id: status.message_id }).catch(() => {});
  };
  try {
    await setProgress("✅ Материалы получены\n⏳ Анализирую стиль...");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await setProgress("✅ Материалы получены\n✅ Анализирую стиль\n⏳ Собираю persona...");
    await generatePersonaDrafts(openai, userId);
    await setProgress("✅ Материалы получены\n✅ Стиль проанализирован\n✅ Persona собрана\n⏳ Формирую worldview...");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await setProgress("✅ Материалы получены\n✅ Стиль проанализирован\n✅ Persona собрана\n✅ Worldview сформирован\n⏳ Обновляю AI-эксперта...");
    const readiness = await buildReadinessScore(userId);
    await bot.editMessageText(
      [
        "✅ AI-эксперт обновлён",
        "",
        buildReadinessSummaryText(readiness),
      ].join("\n"),
      { chat_id: chatId, message_id: status.message_id }
    ).catch(() => {});
    return true;
  } catch (error) {
    console.error("Persona draft error:", error.message);
    await bot.editMessageText([
      "Материалы сохранены, но обновление AI-эксперта не завершилось.",
      friendlyErrorMessage(error, "extraction"),
      "",
      "Можно продолжить с текущей версией или нажать «Regenerate persona» позже.",
    ].join("\n"), {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    return false;
  }
}

async function startExpertOnboarding(chatId, fromUserId) {
  await ensureUserExpertFolders(fromUserId || chatId);
  await trackBetaEvent(fromUserId || chatId, BETA_EVENT_NAMES.ONBOARDING_STARTED, { entry: "manual_or_cta" });
  const s = userState.get(chatId) || {};
  s.expertOnboarding = {
    userId: fromUserId || chatId,
    mode: "create_expert",
    step: "name",
    data: {},
  };
  userState.set(chatId, s);
  await bot.sendMessage(chatId,
    "Создадим AI-эксперта, который пишет не как пустой ассистент, а как конкретный автор.\n\nБыстрый путь: выберите шаблон и сразу получите первый пост. Точный путь: соберите с нуля и добавьте материалы, стиль, фото или голос.",
    { reply_markup: { inline_keyboard: [
      [{ text: "⚡ Start with template expert", callback_data: "ob_template_menu" }],
      [{ text: "📝 Собрать с нуля", callback_data: "ob_custom_name" }],
    ]}}
  );
}

function starterTemplateRows(prefix = "ob_template") {
  return [
    [
      { text: "🧠 Психолог", callback_data: `${prefix}:psychologist` },
      { text: "💜 Сексолог", callback_data: `${prefix}:sexologist` },
    ],
    [
      { text: "🎯 Коуч", callback_data: `${prefix}:coach` },
      { text: "✨ Блогер", callback_data: `${prefix}:blogger` },
    ],
    [
      { text: "💪 Фитнес", callback_data: `${prefix}:fitness` },
      { text: "📈 Маркетинг", callback_data: `${prefix}:marketing` },
    ],
  ];
}

async function sendStarterTemplateMenu(chatId, mode = "onboarding") {
  const prefix = mode === "demo" ? "demo_template" : "ob_template";
  const text = mode === "demo"
    ? "Выберите готового AI-эксперта. Я сразу покажу первый пост, чтобы вы почувствовали качество без настройки:"
    : "Выберите стартовый шаблон. Он уже даст первый рабочий пост, а настоящие материалы можно добавить после:";
  await bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: [
      ...starterTemplateRows(prefix),
      ...(mode === "onboarding" ? [[{ text: "← Назад", callback_data: "ob_start" }]] : []),
    ]},
  });
}

function buildStarterProfileMarkdown(templateKey, template) {
  return {
    persona: [
      `${template.label} с узнаваемым голосом для Telegram/Instagram.`,
      "",
      "Главное ощущение в тексте: читатель быстро думает «это про меня» и чувствует не generic advice, а живого эксперта рядом.",
      "Не придумывать биографию, дипломы, личные кейсы и факты. Держаться роли, темы и выбранной интонации.",
    ].join("\n"),
    worldview: [
      `Starter template: ${templateKey}`,
      "",
      ...template.worldview.map((item) => `- ${item}`),
    ].join("\n"),
    style_guidance: [
      "STYLE LOCK",
      "",
      `Tone: ${template.emotionalStyle}`,
      `Cadence: ${template.cadence}`,
      "",
      "Openings:",
      ...template.openings.map((item) => `- ${item}`),
      "",
      "CTA style:",
      ...template.ctaPatterns.map((item) => `- ${item}`),
      "",
      "Forbidden:",
      ...STYLE_LOCK_FORBIDDEN_PATTERNS.map((item) => `- ${item}`),
    ].join("\n"),
    style_examples: [
      "Use these as structural examples, not phrases to copy:",
      "",
      ...template.openings.map((opening, index) => `${index + 1}. ${opening}\n\n${template.worldview[index % template.worldview.length]}\n\n${template.ctaPatterns[index % template.ctaPatterns.length]}`),
    ].join("\n\n"),
    material_quality: [
      "Starter template expert.",
      "Knowledge uploads: weak yet.",
      "Style learning: template-based.",
      "Recommendation: add 3-5 real posts later to make the voice more personal.",
    ].join("\n"),
  };
}

async function createStarterExpertFromTemplate(userId, templateKey, expertName = null) {
  const template = STARTER_EXPERT_TEMPLATES[templateKey] || STARTER_EXPERT_TEMPLATES.blogger;
  const root = await ensureUserExpertFolders(userId);
  const name = expertName || template.expertName;
  const scenario = await createUserScenario(userId, template.roleKey, {
    expertName: name,
    title: template.label,
    scenarioId: templateKey,
    systemPrompt: [
      `Ты — ${name}, AI-эксперт в роли "${template.label}".`,
      "Пиши посты на русском для Telegram/Instagram.",
      "Главный критерий: текст должен звучать как конкретный живой эксперт, а не как универсальный GPT-пост.",
      "Не выдумывай биографию, дипломы, клиентов и личные факты.",
      "Опирайся на starter worldview, openings, cadence, emotional style и CTA patterns из profile drafts.",
    ].join("\n"),
  });
  const profile = {
    user_id: String(userId),
    expert_name: name,
    status: "completed",
    starter_template: templateKey,
    active_scenario_id: scenario.id,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  await saveUserProfile(userId, profile);
  const drafts = buildStarterProfileMarkdown(templateKey, template);
  await fs.writeFile(join(root, "profile", "persona.md"), drafts.persona, "utf-8");
  await fs.writeFile(join(root, "profile", "worldview.md"), drafts.worldview, "utf-8");
  await fs.writeFile(join(root, "profile", "style_guidance.md"), drafts.style_guidance, "utf-8");
  await fs.writeFile(join(root, "profile", "style_examples.md"), drafts.style_examples, "utf-8");
  await fs.writeFile(join(root, "profile", "material_quality.md"), drafts.material_quality, "utf-8");
  await trackBetaEvent(userId, BETA_EVENT_NAMES.SCENARIO_CREATED, { scenario: scenario.id, source: "starter_template", template: templateKey });
  await trackBetaEvent(userId, BETA_EVENT_NAMES.ONBOARDING_COMPLETED, { scenario: scenario.id, source: "starter_template", template: templateKey });
  return { profile, scenario, template };
}

async function startDemoMode(chatId, templateKey = "psychologist") {
  const template = STARTER_EXPERT_TEMPLATES[templateKey] || STARTER_EXPERT_TEMPLATES.psychologist;
  const s = userState.get(chatId) || {};
  s.demoMode = true;
  s.demoTemplateKey = templateKey;
  s.pendingScenario = ["sexologist", "psychologist"].includes(templateKey) ? templateKey : "psychologist";
  s.pendingTopic = templateKey === "sexologist"
    ? "как перестать стыдиться своего желания"
    : templateKey === "coach"
      ? "почему я много планирую и не начинаю"
      : templateKey === "blogger"
        ? "как перестать звучать как все"
        : templateKey === "fitness"
          ? "почему я начинаю тренироваться и бросаю через неделю"
          : templateKey === "marketing"
            ? "почему контент не приводит клиентов"
        : "почему я всё понимаю, но не могу перестать тревожиться";
  s.pendingLengthMode = "normal";
  s.pendingContentPreset = "emotional";
  userState.set(chatId, s);
  await trackBetaEvent(chatId, BETA_EVENT_NAMES.DEMO_STARTED, { template: templateKey, mode: "demo" });
  await bot.sendMessage(chatId,
    `Demo: ${template.label}\n\nСейчас будет готовый пост без онбординга. Если попадёт в ощущение, следующим шагом можно создать такого же эксперта под ваш голос.`
  );
  await runGeneration(chatId, s.pendingScenario, "normal", "auto", "demo");
}

async function startAddScenario(chatId, fromUserId) {
  const s = userState.get(chatId) || {};
  s.expertOnboarding = {
    userId: fromUserId || chatId,
    mode: "add_scenario",
    step: "role",
    data: {},
  };
  userState.set(chatId, s);
  await sendOnboardingRoleChoice(chatId, "Выберите новый сценарий. Это отдельный режим голоса и задач для того же AI-эксперта:");
}

async function setActiveUserScenario(userId, scenarioId) {
  const profile = await loadUserProfile(userId);
  if (!profile) return null;
  const updated = {
    ...profile,
    active_scenario_id: scenarioId,
    updated_at: new Date().toISOString(),
  };
  await saveUserProfile(userId, updated);
  return updated;
}

async function sendOnboardingRoleChoice(chatId, title = "Выберите роль/сценарий эксперта:") {
  await bot.sendMessage(chatId, title, {
    reply_markup: { inline_keyboard: [
      [
        { text: "Психолог", callback_data: "ob_role:psychologist" },
        { text: "Сексолог", callback_data: "ob_role:sexologist" },
      ],
      [
        { text: "Гештальт", callback_data: "ob_role:gestalt_therapist" },
        { text: "Коуч", callback_data: "ob_role:coach" },
      ],
      [
        { text: "Блогер", callback_data: "ob_role:blogger" },
        { text: "Фитнес", callback_data: "ob_role:fitness" },
      ],
      [{ text: "Маркетинг", callback_data: "ob_role:marketing" }],
    ]},
  });
}

async function sendOnboardingUploadStep(chatId, category) {
  const copy = {
    knowledge: "Материалы знаний: статьи, заметки, методички, разборы, PDF/DOCX/TXT или просто текст сообщением. Даже 1 хорошая заметка лучше десяти случайных ссылок.",
    style: "Источники стиля: 3-5 реальных постов, фрагменты рассылок, тексты от лица автора. По ним я ловлю ритм, открытия, паузы и финалы.",
    avatar: "Фото аватара: портрет или рабочее фото эксперта. Можно пропустить и добавить позже.",
    voice: "Голосовые samples: voice message/audio. Сейчас я их сохраняю для beta-профиля, генерацию голоса можно подключать позже.",
  };
  const s = userState.get(chatId) || {};
  if (s.expertOnboarding) s.expertOnboarding.step = category;
  userState.set(chatId, s);
  await bot.sendMessage(chatId, copy[category], onboardingControls(category));
}

async function handleExpertOnboardingMessage(msg, state) {
  const chatId = msg.chat.id;
  const onboarding = state.expertOnboarding;
  if (!onboarding) return false;
  const userId = onboarding.userId || msg.from?.id || chatId;
  const step = onboarding.step;

  if (step === "name") {
    const name = (msg.text || "").trim();
    if (!name) {
      await bot.sendMessage(chatId, "Напишите имя текстом.");
      return true;
    }
    onboarding.data.expertName = name;
    onboarding.step = "role";
    userState.set(chatId, state);
    await sendOnboardingRoleChoice(chatId);
    return true;
  }

  if (["knowledge", "style", "avatar", "voice"].includes(step)) {
    const uploadGate = canAcceptUploadEvent(state);
    userState.set(chatId, state);
    if (!uploadGate.ok) {
      await trackBetaEvent(userId, BETA_EVENT_NAMES.UPLOAD_REJECTED, { category: step, reason: uploadGate.reason });
      await bot.sendMessage(chatId, uploadRejectionText(uploadGate.reason, uploadGate), onboardingControls(step));
      return true;
    }

    const validation = validateOnboardingUpload(step, msg);
    if (!validation.ok) {
      await trackBetaEvent(userId, BETA_EVENT_NAMES.UPLOAD_REJECTED, { category: step, reason: validation.reason });
      await bot.sendMessage(chatId, uploadRejectionText(validation.reason, validation), onboardingControls(step));
      return true;
    }

    const before = await getOnboardingInventory(userId);
    let stored = null;
    try {
      if (msg.document) {
        const buffer = await downloadTelegramDocument(msg.document.file_id, msg.document.file_size);
        stored = await storeOnboardingFile(userId, step, msg.document.file_name || "telegram_document", buffer, {
          telegram_file_id: msg.document.file_id,
          mime_type: msg.document.mime_type,
        });
      } else if (msg.photo && step === "avatar") {
        const photo = msg.photo[msg.photo.length - 1];
        const buffer = await downloadTelegramDocument(photo.file_id, photo.file_size);
        stored = await storeOnboardingFile(userId, "avatar", `${photo.file_unique_id || photo.file_id}.jpg`, buffer, {
          telegram_file_id: photo.file_id,
        });
      } else if ((msg.voice || msg.audio) && step === "voice") {
        const media = msg.voice || msg.audio;
        const buffer = await downloadTelegramDocument(media.file_id, media.file_size);
        stored = await storeOnboardingFile(userId, "voice", `${media.file_unique_id || media.file_id}.ogg`, buffer, {
          telegram_file_id: media.file_id,
          duration: media.duration,
        });
      } else if (msg.text && ["knowledge", "style"].includes(step)) {
        stored = await storeOnboardingText(userId, step, msg.text.trim(), { source: "telegram_text_or_link" });
      }
    } catch (error) {
      console.warn("Onboarding upload failed:", error.message);
      await bot.sendMessage(chatId, [
        "Материал не удалось скачать из Telegram.",
        friendlyErrorMessage(error, "extraction"),
        "Попробуйте отправить файл ещё раз или вставьте текст сообщением.",
      ].join("\n"), onboardingControls(step));
      return true;
    }

    if (!stored) {
      await bot.sendMessage(chatId, "Этот тип файла здесь пока не принимаю. Отправьте подходящий файл/ссылку или нажмите «Готово, дальше».", onboardingControls(step));
      return true;
    }

    const after = await getOnboardingInventory(userId);
    const count = after.counts[step] ?? before.counts[step] ?? 0;
    let quality = null;
    if (["knowledge", "style"].includes(step)) {
      const progress = await bot.sendMessage(chatId, "✅ Материалы получены\n⏳ Анализирую качество и полезные сигналы...");
      quality = await analyzeOnboardingMaterial(openai, userId, stored, step).catch((error) => {
        console.warn("Material quality analysis failed:", error.message);
        return null;
      });
      await bot.deleteMessage(chatId, progress.message_id).catch(() => {});
    }
    await bot.sendMessage(chatId, `${buildUploadVisibilityText(step, stored, count)}${buildMaterialQualityText(quality, step)}`, onboardingControls(step));
    await trackBetaEvent(userId, BETA_EVENT_NAMES.UPLOAD_RECEIVED, {
      category: step,
      count,
      source: msg.document ? "document" : msg.photo ? "photo" : (msg.voice || msg.audio) ? "voice_or_audio" : "text",
      quality_score: quality?.score || null,
    });
    return true;
  }

  return true;
}

async function finishExpertOnboarding(chatId, fromUserId) {
  const state = userState.get(chatId) || {};
  const onboarding = state.expertOnboarding;
  if (!onboarding) return;
  const userId = onboarding.userId || fromUserId || chatId;
  const data = onboarding.data || {};
  const existingProfile = await loadUserProfile(userId);
  const expertName = data.expertName || existingProfile?.expert_name || "Новый эксперт";
  const scenario = await createUserScenario(userId, data.roleKey || "blogger", {
    expertName,
    title: ONBOARDING_ROLES[data.roleKey]?.label || data.roleKey || "Эксперт",
  });
  const profile = {
    ...(existingProfile || {}),
    user_id: String(userId),
    expert_name: expertName,
    status: "completed",
    active_scenario_id: scenario.id,
    updated_at: new Date().toISOString(),
    created_at: existingProfile?.created_at || new Date().toISOString(),
  };
  await saveUserProfile(userId, profile);
  await trackBetaEvent(userId, BETA_EVENT_NAMES.SCENARIO_CREATED, { scenario: scenario.id, source: "custom_onboarding" });

  await rebuildPersonaAndNotify(chatId, userId, "Собираю persona draft, worldview и style examples из загруженных материалов...");

  state.expertOnboarding = null;
  userState.set(chatId, state);
  await trackBetaEvent(userId, BETA_EVENT_NAMES.ONBOARDING_COMPLETED, { scenario: scenario.id, source: "custom_onboarding" });
  await bot.sendMessage(chatId, [
    "AI-эксперт собран.",
    "",
    "Сейчас главное не идеальность профиля, а первый живой результат. Я открою dashboard: там видно готовность, материалы и кнопка тестовой генерации.",
  ].join("\n"));
  await sendExpertDashboard(chatId, userId);
}

async function sendExpertDashboard(chatId, userId = chatId) {
  const inventory = await getOnboardingInventory(userId);
  const name = inventory.profile?.expert_name || "эксперт";
  const activeScenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id || null;
  const activeScenario = inventory.scenarios.find((s) => s.id === activeScenarioId);
  const statusLabel = inventory.profile?.status === "completed" ? "готов к генерации" : "онбординг не завершён";
  const runtime = await loadExpertRuntime(userId);
  const runtimeText = buildRuntimeCounterText(runtime);
  const readiness = await buildReadinessScore(userId);
  await bot.sendMessage(chatId,
    `AI-эксперт: ${name}\n` +
    `Статус: ${statusLabel}\n` +
    `Активный сценарий: ${activeScenario?.label || "не выбран"}\n\n` +
    `${buildReadinessSummaryText(readiness)}\n\n` +
    `Что уже есть:\n` +
    `Сценарии: ${inventory.scenarios.length}\n` +
    `Материалы знаний: ${inventory.counts.knowledge}\n` +
    `Примеры стиля: ${inventory.counts.style}\n` +
    `Фото: ${inventory.counts.avatar}\n` +
    `Голос: ${inventory.counts.voice}\n\n` +
    `Beta usage:\n${runtimeText}`,
    {
      reply_markup: { inline_keyboard: [
        [{ text: "✨ Первый/тестовый пост", callback_data: "ob_test_generation" }],
        [
          { text: "🧩 List scenarios", callback_data: "ob_list_scenarios" },
          { text: "🔄 Switch scenario", callback_data: "ob_select_scenario" },
        ],
        [
          { text: "🧠 Regenerate persona", callback_data: "ob_regen_persona" },
          { text: "📣 My AI expert", callback_data: "ob_share_identity" },
        ],
        [{ text: "➕ Add scenario", callback_data: "ob_add_scenario" }],
        [
          { text: "📚 Add materials", callback_data: "ob_upload_more:knowledge" },
          { text: "✍️ Add style", callback_data: "ob_upload_more:style" },
        ],
        [{ text: "📘 Onboarding guide", callback_data: "ob_guide" }],
        [
          { text: "🖼 Upload avatar", callback_data: "ob_upload_more:avatar" },
          { text: "🎙 Upload voice", callback_data: "ob_upload_more:voice" },
        ],
        [{ text: "Создать новый контент", callback_data: "back_to_topics" }],
      ]},
    }
  );
}

async function readProfileDraft(userId, fileName, maxChars = 700) {
  try {
    const text = await fs.readFile(join(getUserRoot(userId), "profile", fileName), "utf-8");
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  } catch {
    return "";
  }
}

async function buildShareableExpertIdentity(userId) {
  const inventory = await getOnboardingInventory(userId);
  const runtime = await loadExpertRuntime(userId);
  const profile = inventory.profile || {};
  const activeScenarioId = profile.active_scenario_id || inventory.scenarios[0]?.id;
  const activeScenario = inventory.scenarios.find((scenario) => scenario.id === activeScenarioId);
  const persona = await readProfileDraft(userId, "persona.md", 420);
  const worldview = await readProfileDraft(userId, "worldview.md", 420);
  const style = await readProfileDraft(userId, "style_guidance.md", 420);
  const materialsReady = [
    inventory.counts.knowledge > 0 ? `${inventory.counts.knowledge} материалов` : "материалы можно усилить",
    inventory.counts.style > 0 ? `${inventory.counts.style} примеров стиля` : "стиль пока template-based",
  ].join(" · ");
  const textUsed = Number(runtime.counters?.text || 0);
  const textLimit = runtime.limits?.text ?? "∞";
  const starsBetaPack = isStarsBetaTextPack(runtime);
  const betaPackLeft = starsBetaPack && Number.isFinite(Number(textLimit))
    ? Math.max(0, Number(textLimit) - textUsed)
    : null;
  const generationLines = starsBetaPack && betaPackLeft !== null
    ? [
        "Пакет: Beta text pack",
        "Куплено beta-генераций: 10",
        `Осталось текстовых генераций: ${betaPackLeft}/${textLimit}`,
      ]
    : [`Генерации: ${textUsed}/${textLimit} текстов`];
  return [
    "Мой AI-эксперт",
    "",
    `Имя: ${profile.expert_name || "эксперт"}`,
    `Роль: ${activeScenario?.label || "не выбрана"}`,
    `Статус: ${profile.status === "completed" ? "готов к генерации" : "собирается"}`,
    `Основа: ${materialsReady}`,
    ...generationLines,
    "",
    "Persona:",
    persona || "Будет точнее после загрузки материалов.",
    "",
    "Worldview:",
    worldview || "Будет точнее после загрузки экспертных заметок.",
    "",
    "Style lock:",
    style || "Будет точнее после загрузки 3-5 реальных постов.",
    "",
    "Можно показать этот блок как краткую карточку эксперта: кто он, на чём обучен и почему звучит узнаваемо.",
  ].join("\n");
}

async function sendShareableExpertIdentity(chatId, userId = chatId) {
  const text = await buildShareableExpertIdentity(userId);
  await sendLongPlainText(chatId, text, {
    inline_keyboard: [
      [{ text: "📣 Текст для пересылки", callback_data: "share_friend" }],
      [{ text: "← Dashboard", callback_data: "ob_dashboard" }],
    ],
  });
}

function isAdminUser(userId) {
  return Number(userId) === ADMIN_TG_ID;
}

async function canManagePaidBeta(userId) {
  if (isAdminUser(userId)) return true;
  return canUseKnowledgeIntake(userId).catch(() => false);
}

async function listUploadNames(userId, folder) {
  const dir = join(getUserRoot(userId), folder);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .slice(0, 12);
}

async function inspectUploadsText(userId) {
  const [inventory, knowledge, style, avatar, voice] = await Promise.all([
    getOnboardingInventory(userId),
    listUploadNames(userId, "knowledge/pending"),
    listUploadNames(userId, "style/pending"),
    listUploadNames(userId, "avatar"),
    listUploadNames(userId, "voice"),
  ]);
  const line = (label, count, items) => [
    `${label}: ${count}`,
    ...(items.length ? items.map((item) => `• ${basename(item)}`) : ["• empty"]),
  ].join("\n");
  return [
    `Admin upload inspect: ${userId}`,
    "",
    `Expert: ${inventory.profile?.expert_name || "none"}`,
    `Status: ${inventory.profile?.status || "none"}`,
    "",
    line("Knowledge", inventory.counts.knowledge, knowledge),
    "",
    line("Style", inventory.counts.style, style),
    "",
    line("Avatar", inventory.counts.avatar, avatar),
    "",
    line("Voice", inventory.counts.voice, voice),
  ].join("\n");
}

async function resetOnboardingState(userId) {
  const profile = await loadUserProfile(userId);
  if (!profile) return null;
  const updated = {
    ...profile,
    status: "onboarding_reset",
    updated_at: new Date().toISOString(),
  };
  await saveUserProfile(userId, updated);
  return updated;
}

async function sendAdminTools(chatId, adminUserId, targetUserId = adminUserId) {
  if (!isAdminUser(adminUserId)) {
    await bot.sendMessage(chatId, "🔒 Admin shortcuts доступны только администратору.");
    return;
  }
  const s = userState.get(chatId) || {};
  s.adminTargetUserId = String(targetUserId || adminUserId);
  userState.set(chatId, s);
  const inventory = await getOnboardingInventory(s.adminTargetUserId);
  await bot.sendMessage(chatId,
    `Admin tools\n\nTarget user: ${s.adminTargetUserId}\nExpert: ${inventory.profile?.expert_name || "none"}\nScenarios: ${inventory.scenarios.length}\nMaterials: ${inventory.counts.knowledge}, style: ${inventory.counts.style}`,
    {
      reply_markup: { inline_keyboard: [
        [
          { text: "Rebuild persona", callback_data: "admin_rebuild:persona" },
          { text: "Rebuild worldview", callback_data: "admin_rebuild:worldview" },
        ],
        [
          { text: "Rebuild examples", callback_data: "admin_rebuild:examples" },
          { text: "Inspect uploads", callback_data: "admin_inspect_uploads" },
        ],
        [
          { text: "Reset onboarding", callback_data: "admin_reset_onboarding" },
          { text: "Clone template", callback_data: "admin_clone_template_menu" },
        ],
        [{ text: "Runtime tuning", callback_data: "admin_tuning" }],
        [{ text: "Dashboard as target", callback_data: "admin_target_dashboard" }],
      ]},
    }
  );
}

async function sendAdminCloneTemplateMenu(chatId) {
  await bot.sendMessage(chatId, "Clone template expert to admin target:", {
    reply_markup: { inline_keyboard: [
      ...starterTemplateRows("admin_clone_template"),
      [{ text: "← Admin tools", callback_data: "admin_tools" }],
    ]},
  });
}

async function sendScenarioList(chatId, userId = chatId, mode = "list") {
  const inventory = await getOnboardingInventory(userId);
  const activeScenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id || null;
  if (inventory.scenarios.length === 0) {
    await bot.sendMessage(chatId, "Сценариев пока нет.", {
      reply_markup: { inline_keyboard: [[{ text: "Добавить сценарий", callback_data: "ob_add_scenario" }]] },
    });
    return;
  }

  const text = inventory.scenarios.map((scenario, index) => {
    const activeMark = scenario.id === activeScenarioId ? " ← active" : "";
    return `${index + 1}. ${scenario.label} (${scenario.id})${activeMark}`;
  }).join("\n");

  const rows = mode === "select"
    ? inventory.scenarios.map((scenario, index) => ([{
        text: `${scenario.id === activeScenarioId ? "✅ " : ""}${scenario.label}`,
        callback_data: `ob_set_active:${index}`,
      }]))
    : [];

  rows.push([{ text: "← Dashboard", callback_data: "ob_dashboard" }]);
  const state = userState.get(chatId) || {};
  state.userScenarioMenu = inventory.scenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);

  await bot.sendMessage(chatId, `Сценарии эксперта:\n\n${text}`, {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendTopicMenu(chatId) {
  const state = userState.get(chatId) || {};
  const presets = state.presets || [];
  const userScenarios = await listUserScenarios(chatId).catch(() => []);
  const profile = await loadUserProfile(chatId).catch(() => null);
  const activeScenarioId = profile?.active_scenario_id;
  state.userScenarioMenu = userScenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);
  const keyboard = [
    [{ text: "⚡ Демо за 1 минуту", callback_data: "demo_start" }],
    [
      { text: "🧠 Психолог Динара", callback_data: "sc_psych" },
      { text: "💜 Сексолог Динара", callback_data: "sc_sex" },
    ],
    [{ text: "✏️ Своя тема", callback_data: "prompt_topic" }],
  ];
  if (presets.length > 0) {
    keyboard.push([{ text: "⭐ Мои пресеты", callback_data: "show_presets" }]);
  }
  if (userScenarios.length > 0) {
    const activeScenario = userScenarios.find((scenario) => scenario.id === activeScenarioId);
    if (activeScenario) {
      keyboard.push([{ text: `✅ Active: ${activeScenario.label}`, callback_data: `prompt_topic_sc:${activeScenario.id}` }]);
    }
    for (let i = 0; i < userScenarios.length; i += 2) {
      keyboard.push(userScenarios.slice(i, i + 2).map((scenario, offset) => ({
        text: `${scenario.id === activeScenarioId ? "✅" : "⭐"} ${scenario.label}`,
        callback_data: `usc:${i + offset}`,
      })));
    }
    keyboard.push([{ text: "👤 Expert dashboard", callback_data: "ob_dashboard" }]);
  }
  keyboard.push([{ text: "🚀 Start with template expert", callback_data: "ob_template_menu" }]);
  keyboard.push([{ text: "➕ Создать AI-эксперта с нуля", callback_data: "ob_start" }]);
  keyboard.push([{ text: "💌 Beta invite copy", callback_data: "demo_invite_copy" }]);
  await bot.sendMessage(chatId, `С чего начнём?\n\nДемо покажет ценность быстро. Свой AI-эксперт даст лучший голос после материалов.`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendTopicsForScenario(chatId, scenario) {
  const userScenario = await loadUserScenario(chatId, scenario);
  if (userScenario) {
    await bot.sendMessage(chatId, `⭐ ${userScenario.label}\n\nНапишите тему поста:`, {
      reply_markup: { inline_keyboard: [[{ text: "← Назад", callback_data: "back_to_topics" }]] },
    });
    return;
  }
  const topics = scenario === "sexologist" ? QUICK_TOPICS_SEX : QUICK_TOPICS_PSYCH;
  const prefix = scenario === "sexologist" ? "qs" : "qp";
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог Динара" : "🧠 Психолог Динара";

  const keyboard = [
    [{ text: topics[0], callback_data: `${prefix}:0` }, { text: topics[1], callback_data: `${prefix}:1` }],
    [{ text: topics[2], callback_data: `${prefix}:2` }, { text: topics[3], callback_data: `${prefix}:3` }],
    [{ text: "✏️ Своя тема", callback_data: `prompt_topic_sc:${scenario}` }],
    [{ text: "← Назад", callback_data: "back_to_topics" }],
  ];

  await bot.sendMessage(chatId, `${scenarioLabel}\n\nВыберите тему или напишите свою:`, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendPresetsMenu(chatId) {
  const presets = getPresets(chatId);
  if (presets.length === 0) {
    await bot.sendMessage(chatId, "Пресетов пока нет. Создайте после генерации текста.");
    return;
  }
  const rows = presets.map((p, i) => ([{ text: p.label, callback_data: `use_preset:${i}` }]));
  rows.push([{ text: "← Назад", callback_data: "back_to_topics" }]);
  await bot.sendMessage(chatId, "⭐ *Мои пресеты:*\n\nНажми — и сразу к генерации!", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `ℹ️ *Справка*\n\n*Флоу генерации:* сценарий → тема → длина → стиль → текст → аудио → фото → видео → публикация в канал\n\n*Онбординг эксперта:*\n/onboard — создать AI-эксперта\n/my_expert — посмотреть профиль и материалы\n/add_scenario — добавить сценарий\n\n*Вопросы?* @tetss2`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "🔄 Начать заново", callback_data: "back_to_topics" },
      ]]},
    }
  );
}

const KNOWLEDGE_INTAKE_ACTIONS = {
  reply_markup: { inline_keyboard: [
    [{ text: "➕ Добавить еще", callback_data: "ki_more" }],
    [{ text: "✅ Загрузка закончена", callback_data: "ki_done" }],
    [{ text: "❌ Отменить", callback_data: "ki_cancel" }],
  ]},
};

async function sendKnowledgeIntakeMenu(chatId, userId) {
  if (!(await canUseKnowledgeIntake(userId))) {
    await bot.sendMessage(chatId, "🔒 Режим пополнения базы знаний доступен только для admin/full_access.");
    return;
  }
  await bot.sendMessage(chatId, "📚 Выберите базу знаний для пополнения:", {
    reply_markup: { inline_keyboard: [[
      { text: "Психолог Динара", callback_data: "ki_kb:psychologist" },
      { text: "Сексолог Динара", callback_data: "ki_kb:sexologist" },
    ]]},
  });
}

function intakeItemTypeLabel(type) {
  return { file: "файл", url: "ссылка", text: "заметка" }[type] || type;
}

function buildIntakeSummary(session) {
  const summary = summarizeSession(session);
  const itemsText = summary.items.length
    ? summary.items.map((item, index) =>
        `${index + 1}. ${intakeItemTypeLabel(item.type)} — ${item.original_name || item.item_id}`
      ).join("\n")
    : "нет материалов";
  return (
    `📦 Сводка загрузки\n\n` +
    `База знаний: ${summary.targetLabel}\n` +
    `Файлы: ${summary.fileCount}\n` +
    `Ссылки: ${summary.urlCount}\n` +
    `Текстовые заметки: ${summary.textCount}\n\n` +
    `Items:\n${itemsText}\n\n` +
    `Статус: ожидает подтверждения`
  );
}

async function sendIntakeSummary(chatId, session) {
  await bot.sendMessage(chatId, buildIntakeSummary(session), {
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Подтвердить добавление в базу", callback_data: "ki_approve" }],
      [{ text: "❌ Отклонить", callback_data: "ki_reject" }],
    ]},
  });
}

async function downloadTelegramDocument(fileId, expectedBytes = 0) {
  if (Number(expectedBytes || 0) > ABUSE_LIMITS.maxUploadBytes) {
    throw new Error("Telegram file too large");
  }
  const fileInfo = await bot.getFile(fileId);
  if (Number(fileInfo.file_size || 0) > ABUSE_LIMITS.maxUploadBytes) {
    throw new Error("Telegram file too large");
  }
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(fileUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > ABUSE_LIMITS.maxUploadBytes) throw new Error("Telegram file too large");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function handleKnowledgeIntakeMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  const session = await getActiveIntakeSession(userId);
  if (!session) return false;
  if (session.status !== "collecting") {
    await bot.sendMessage(chatId, "Сессия загрузки ожидает подтверждения. Используйте кнопки: подтвердить добавление или отклонить.");
    return true;
  }

  if (msg.document) {
    if (Number(msg.document.file_size || 0) > ABUSE_LIMITS.maxUploadBytes) {
      await bot.sendMessage(chatId, uploadRejectionText("file_too_large"), KNOWLEDGE_INTAKE_ACTIONS);
      return true;
    }
    const buffer = await downloadTelegramDocument(msg.document.file_id, msg.document.file_size);
    const updated = await addFileItem(session, msg.document.file_name || "telegram_document", buffer);
    await bot.sendMessage(
      chatId,
      `✅ Файл принят: ${msg.document.file_name || "telegram_document"}\nВсего items: ${updated.items.length}`,
      KNOWLEDGE_INTAKE_ACTIONS
    );
    return true;
  }

  if (msg.text) {
    const text = msg.text.trim();
    if (text.length > ABUSE_LIMITS.maxTextUploadChars) {
      await bot.sendMessage(chatId, uploadRejectionText("text_too_large"), KNOWLEDGE_INTAKE_ACTIONS);
      return true;
    }
    const updated = isUrlText(text)
      ? await addUrlItem(session, text)
      : await addTextItem(session, text);
    const kind = isUrlText(text) ? "Ссылка" : "Текстовая заметка";
    await bot.sendMessage(chatId, `✅ ${kind} принята.\nВсего items: ${updated.items.length}`, KNOWLEDGE_INTAKE_ACTIONS);
    return true;
  }

  await bot.sendMessage(chatId, "Пока в этом режиме принимаю document/file, ссылку или текстовую заметку.", KNOWLEDGE_INTAKE_ACTIONS);
  return true;
}

async function sendScenarioChoice(chatId, topic) {
  const state = userState.get(chatId) || {};
  state.pendingTopic = topic;
  state.pendingContentPreset = null;
  const userScenarios = await listUserScenarios(chatId).catch(() => []);
  state.userScenarioMenu = userScenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);
  const rows = [[
    { text: "🧠 Психолог Динара", callback_data: "sc_psych_t" },
    { text: "💜 Сексолог Динара", callback_data: "sc_sex_t" },
  ]];
  for (let i = 0; i < userScenarios.length; i += 2) {
    rows.push(userScenarios.slice(i, i + 2).map((scenario, offset) => ({
      text: `⭐ ${scenario.label}`,
      callback_data: `usc_t:${i + offset}`,
    })));
  }
  await bot.sendMessage(chatId, `📝 Тема: *${topic}*\n\nКто будет отвечать?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendLengthChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);
  const label = await getScenarioLabel(chatId, scenario);
  await bot.sendMessage(chatId, `${label}\n\nВыберите длину поста:`, {
    reply_markup: { inline_keyboard: [[
      { text: "✂️ Короткий", callback_data: "len_short" },
      { text: "📄 Обычный", callback_data: "len_normal" },
      { text: "📖 Длинный", callback_data: "len_long" },
    ]]},
  });
}

async function sendContentPresetChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);
  const label = await getScenarioLabel(chatId, scenario);
  const rows = [];
  for (let i = 0; i < CONTENT_PRESETS.length; i += 2) {
    rows.push(CONTENT_PRESETS.slice(i, i + 2).map((preset) => ({
      text: preset.label,
      callback_data: `cp:${preset.id}`,
    })));
  }
  rows.push([{ text: "⚙️ Выбрать длину вручную", callback_data: "cp:manual" }]);
  await bot.sendMessage(chatId, `${label}\n\nВыберите формат. Так первый текст получится ближе к задаче:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendStyleChoice(chatId) {
  const entries = Object.entries(SEXOLOGIST_STYLE_META);
  const pairedRows = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const [k1, m1] = entries[i];
    const [k2, m2] = entries[i + 1];
    pairedRows.push([
      { text: m1.label, callback_data: `sty_${k1}` },
      { text: m2.label, callback_data: `sty_${k2}` },
    ]);
  }
  if (entries.length % 2 !== 0) {
    const [k, m] = entries[entries.length - 1];
    pairedRows.push([{ text: m.label, callback_data: `sty_${k}` }]);
  }
  const hintsText = entries.map(([, m]) => `${m.label} — _${m.hint}_`).join("\n");
  await bot.sendMessage(chatId, `🎨 *Стиль подачи текста:*\n\n${hintsText}`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: pairedRows },
  });
}

async function sendAudioLengthChoice(chatId) {
  await bot.sendMessage(chatId,
    "🎙 *Выберите длину аудио:*\n\n✂️ *Короткое* — ~8-10 сек, одна ключевая мысль\n📻 *Длинное* — ~13-15 сек, развёрнутая мысль",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "✂️ Короткое ~8-10 сек", callback_data: "audlen_short" },
        { text: "📻 Длинное ~13-15 сек", callback_data: "audlen_long" },
      ]]},
    }
  );
}

async function sendAudioChoiceButtons(chatId) {
  return bot.sendMessage(chatId, "🎙 Выберите аудио:", {
    reply_markup: { inline_keyboard: [[
      { text: "🤖 ИИ-аудио", callback_data: "audio_gen" },
      { text: "🎙 Своё голосовое", callback_data: "audio_rec" },
    ]]},
  });
}

async function sendTrackPreview(chatId, tracks, currentIndex = 0) {
  const track = tracks[currentIndex];
  if (!track || !track.url) {
    await bot.sendMessage(chatId, "🎵 Музыка недоступна. Продолжаем без неё.");
    await sendPhotoButtons(chatId);
    return;
  }
  const total = tracks.length;
  const loadMsg = await bot.sendMessage(chatId, `🎵 Загружаю трек ${currentIndex + 1} из ${total}...`);
  try {
    const trackBuffer = await downloadTrack(track.url);
    await bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});
    await bot.sendAudio(chatId, trackBuffer, {
      caption: `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}`,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [
          { text: "⏭ Без музыки", callback_data: "music_skip" },
          { text: "✅ Выбрать", callback_data: `mc:${track.id}` },
          ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `mn:${currentIndex + 1}` }] : []),
        ],
      ]},
    }, { filename: `${track.id}.mp3`, contentType: "audio/mpeg" });
  } catch(err) {
    console.error("Track preview error:", err.message);
    await bot.editMessageText(
      `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\nТрек ${currentIndex + 1} из ${total}\n_(превью недоступно)_`,
      {
        chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [
            { text: "⏭ Без музыки", callback_data: "music_skip" },
            { text: "✅ Выбрать", callback_data: `mc:${track.id}` },
            ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `mn:${currentIndex + 1}` }] : []),
          ],
        ]},
      }
    ).catch(() => {});
  }
}

async function sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt) {
  const photoKey = `p${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = { imageUrl, scenePrompt };
  state.lastImageUrl = imageUrl;
  state.lastScenePrompt = scenePrompt;
  userState.set(chatId, state);
  await bot.sendPhoto(chatId, imageUrl, {
    caption: `✅ 🖼 Фото сгенерировано\n💰 $${photoCost.toFixed(3)}`,
    reply_markup: { inline_keyboard: [
      [{ text: "🔄 Ещё вариант", callback_data: `rp:${photoKey}` }, { text: "🎬 Видео", callback_data: `mv:${photoKey}` }],
      [{ text: "📤 Опубликовать в канал", callback_data: "pub_menu" }],
    ]},
  });
}

async function sendVideoWithButtons(chatId, videoUrl, videoCost) {
  const videoKey = `v${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  state.lastVideoUrl = videoUrl;
  userState.set(chatId, state);
  await bot.sendVideo(chatId, videoUrl, {
    caption: `✅ 🎬 Видео сгенерировано\n💰 $${videoCost.toFixed(2)}`,
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Выбрать", callback_data: `cv:${videoKey}` }, { text: "🔄 Ещё вариант", callback_data: "vid_again" }],
      [{ text: "📢 Опубликовать видео+текст в канал", callback_data: "pub:text_video" }],
    ]},
  });
}

async function sendVoiceSelectionMenu(chatId) {
  const state = userState.get(chatId) || {};
  const voices = state.pendingVoices || [];
  if (voices.length === 0) { await bot.sendMessage(chatId, "Нет записанных голосовых."); return; }
  const rows = [];
  for (let i = 0; i < voices.length; i += 2) {
    const row = [{ text: `✅ Голосовое ${i + 1}`, callback_data: `vc:${i}` }];
    if (voices[i + 1]) row.push({ text: `✅ Голосовое ${i + 2}`, callback_data: `vc:${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: "➕ Записать ещё", callback_data: "voice_more" }]);
  await bot.sendMessage(chatId, `🎙 Голосовых: ${voices.length}. Выберите:`, { reply_markup: { inline_keyboard: rows } });
}

function sendPhotoButtons(chatId) {
  return bot.sendMessage(chatId, "📸 Сгенерировать фото:", {
    reply_markup: { inline_keyboard: [
      [{ text: "🎯 По теме", callback_data: "photo_topic" }, { text: "🏠 Кабинет", callback_data: "photo_office" }],
      [{ text: "✏️ Свой вариант", callback_data: "photo_custom" }, { text: "📤 Опубликовать в канал", callback_data: "pub_menu" }],
    ]},
  });
}

function getPublishButtons(state) {
  const buttons = [];
  const row1 = [];
  if (state.lastImageUrl && state.lastFullAnswer) row1.push({ text: "🖼 Текст+Фото → в канал", callback_data: "pub:text_photo" });
  if (state.lastVideoUrl && state.lastFullAnswer) row1.push({ text: "🎬 Текст+Видео → в канал", callback_data: "pub:text_video" });
  if (row1.length > 0) buttons.push(row1);
  if (state.lastFullAnswer) buttons.push([{ text: "📝 Только текст → в канал", callback_data: "pub:text_only" }]);
  return buttons;
}

async function sendPublishMenu(chatId) {
  const state = userState.get(chatId) || {};
  const buttons = getPublishButtons(state);
  if (buttons.length === 0) { await bot.sendMessage(chatId, "Нечего публиковать."); return; }
  await bot.sendMessage(chatId, "📤 Выберите формат публикации в канал:", { reply_markup: { inline_keyboard: buttons } });
}

// ─── ADMIN-ONLY RUNTIME PREVIEW (LOCAL DRY RUN) ──────────────────────────────

async function canUseRuntimePreview(userId) {
  if (Number(userId) === ADMIN_TG_ID) return true;
  return false;
}

function truncatePreview(value, limit = 900) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 20)}\n... [truncated]`;
}

function compactJson(value, limit = 900) {
  return truncatePreview(JSON.stringify(value || {}, null, 2), limit);
}

function runtimePreviewReportDir() {
  return join(RUNTIME_DATA_ROOT, "reports", "runtime-preview");
}

function runtimePreviewFileStem() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function storeRuntimePreviewRun({ chatId, topic, result, previewMode = "dry" }) {
  const dir = runtimePreviewReportDir();
  await fs.mkdir(dir, { recursive: true });
  const stem = `${runtimePreviewFileStem()}_runtime_preview`;
  const jsonPath = join(dir, `${stem}.json`);
  const mdPath = join(dir, `${stem}.md`);
  const promptPackage = result.generation_pipeline?.prompt_package || {};
  const identityRuntime = result.identity_runtime || {};
  const campaignMemory = result.campaign_memory || {};
  const strategicBrain = result.strategic_brain || {};
  const editorialDirector = result.editorial_director || {};
  const payload = {
    timestamp: new Date().toISOString(),
    chat_id: chatId,
    preview_mode: previewMode,
    expert_id: result.expert_id,
    topic,
    llmExecutionMode: result.generation_pipeline?.llm_execution_mode,
    real_local_prompt_assembly_used: result.generation_pipeline?.real_local_prompt_assembly_used,
    mock_content_generation_used: result.generation_pipeline?.mock_content_generation_used,
    runtime_decisions: result.runtime?.selected_generation_decisions,
    selected_context_count: result.generation_pipeline?.assembled_context_summary?.selected_count,
    quality_score: result.integrated_validation?.combined_quality_score,
    stabilization: result.integrated_validation?.stabilization,
    stabilization_improvement: result.integrated_validation?.stabilization_improvement,
    identity_runtime: identityRuntime,
    identity_preview_metrics: identityRuntime.preview_metrics,
    campaign_memory: campaignMemory,
    campaign_memory_signals: campaignMemory.adapter_signals,
    strategic_brain: strategicBrain,
    strategic_brain_signals: strategicBrain.adapter_signals,
    editorial_director: editorialDirector,
    editorial_director_signals: editorialDirector.adapter_signals,
    sandbox_execution_enabled: result.generation_pipeline?.sandbox_execution_enabled,
    content_execution_status: result.final_generation_result?.content_execution_status,
    output_validation: result.final_generation_result?.output_validation,
    output_sanitization: result.final_generation_result?.output_sanitization,
    runtime_execution_diagnostics: result.final_generation_result?.runtime_execution_diagnostics,
    generated_text_preview: result.final_generation_result?.content?.slice(0, 2200) || "",
    warnings: result.integrated_validation?.warnings || [],
    prompt_preview: promptPackage.assembledPrompt?.final_prompt?.slice(0, 2200) || "",
    config_payload: promptPackage.configPayload,
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(mdPath, [
    "# Runtime Preview",
    "",
    `Generated: ${payload.timestamp}`,
    `Expert: ${payload.expert_id}`,
    `Topic: ${topic}`,
    `Preview mode: ${payload.preview_mode}`,
    `LLM execution mode: ${payload.llmExecutionMode}`,
    `Sandbox execution enabled: ${payload.sandbox_execution_enabled}`,
    `Content execution status: ${payload.content_execution_status || "n/a"}`,
    `Quality score: ${payload.quality_score}`,
    `Stabilization score: ${payload.stabilization?.stabilization_score ?? "n/a"}`,
    `Author voice confidence: ${payload.stabilization?.author_voice_confidence ?? "n/a"}`,
    `CTA pressure score: ${payload.stabilization?.cta_pressure_score ?? "n/a"}`,
    `Generic AI risk score: ${payload.stabilization?.generic_ai_risk_score ?? "n/a"}`,
    `Identity confidence: ${payload.identity_preview_metrics?.identity_confidence ?? "n/a"}`,
    `Persona drift level: ${payload.identity_preview_metrics?.persona_drift_level ?? "n/a"}`,
    `Worldview stability: ${payload.identity_preview_metrics?.worldview_stability ?? "n/a"}`,
    `Emotional continuity: ${payload.identity_preview_metrics?.emotional_continuity ?? "n/a"}`,
    `Rhetorical continuity: ${payload.identity_preview_metrics?.rhetorical_continuity ?? "n/a"}`,
    `Generic AI divergence: ${payload.identity_preview_metrics?.generic_ai_divergence ?? "n/a"}`,
    `Narrative persistence: ${payload.identity_preview_metrics?.narrative_persistence ?? "n/a"}`,
    `Campaign memory score: ${payload.campaign_memory_signals?.campaign_memory_score ?? "n/a"}`,
    `Recent topic overlap: ${payload.campaign_memory_signals?.recent_topic_overlap ?? "n/a"}`,
    `CTA fatigue level: ${payload.campaign_memory_signals?.cta_fatigue_level ?? "n/a"}`,
    `Narrative arc status: ${payload.campaign_memory_signals?.narrative_arc_status ?? "n/a"}`,
    `Suggested next move: ${payload.campaign_memory_signals?.suggested_next_move ?? "n/a"}`,
    `Format variety: ${payload.campaign_memory_signals?.format_variety ?? "n/a"}`,
    `Audience fatigue risk: ${payload.campaign_memory_signals?.audience_fatigue_risk ?? "n/a"}`,
    `Strategic brain score: ${payload.strategic_brain_signals?.strategic_brain_score ?? "n/a"}`,
    `Trust level: ${payload.strategic_brain_signals?.trust_level ?? "n/a"}`,
    `Authority level: ${payload.strategic_brain_signals?.authority_level ?? "n/a"}`,
    `Emotional warmth: ${payload.strategic_brain_signals?.emotional_warmth_level ?? "n/a"}`,
    `Conversion pressure: ${payload.strategic_brain_signals?.conversion_pressure ?? "n/a"}`,
    `Intimacy pacing: ${payload.strategic_brain_signals?.intimacy_pacing ?? "n/a"}`,
    `Overselling risk: ${payload.strategic_brain_signals?.overselling_risk ?? "n/a"}`,
    `Current narrative loop: ${payload.strategic_brain_signals?.current_narrative_loop ?? "n/a"}`,
    `Strategic next move: ${payload.strategic_brain_signals?.strategic_next_move ?? "n/a"}`,
    `Editorial director score: ${payload.editorial_director_signals?.editorial_director_score ?? "n/a"}`,
    `Audience temperature: ${payload.editorial_director_signals?.current_audience_temperature ?? "n/a"}`,
    `Authority saturation: ${payload.editorial_director_signals?.authority_saturation ?? "n/a"}`,
    `Emotional saturation: ${payload.editorial_director_signals?.emotional_saturation ?? "n/a"}`,
    `Freshness score: ${payload.editorial_director_signals?.editorial_freshness ?? "n/a"}`,
    `Narrative progression stage: ${payload.editorial_director?.storytelling?.narrative_progression_stage ?? "n/a"}`,
    `Current content arc: ${payload.editorial_director?.storytelling?.current_content_arc ?? "n/a"}`,
    `Recommended next format: ${payload.editorial_director_signals?.recommended_content_format ?? "n/a"}`,
    `Recommended next narrative move: ${payload.editorial_director_signals?.recommended_next_narrative_move ?? "n/a"}`,
    `Attention stability: ${payload.editorial_director?.attention_loop?.attention_loop_stability ?? "n/a"}`,
    `Fatigue risk: ${payload.editorial_director_signals?.fatigue_risk ?? "n/a"}`,
    `Storytelling continuity: ${payload.editorial_director?.storytelling?.storytelling_continuity ?? "n/a"}`,
    `Warnings: ${payload.warnings.length ? payload.warnings.join(", ") : "none"}`,
    "",
    "## Stabilization",
    "```json",
    JSON.stringify({
      stabilization: payload.stabilization,
      improvement: payload.stabilization_improvement,
    }, null, 2),
    "```",
    "",
    "## Identity Runtime",
    "```json",
    JSON.stringify(payload.identity_runtime, null, 2),
    "```",
    "",
    "## Campaign Memory",
    "```json",
    JSON.stringify(payload.campaign_memory, null, 2),
    "```",
    "",
    "## Strategic Brain",
    "```json",
    JSON.stringify(payload.strategic_brain, null, 2),
    "```",
    "",
    "## Editorial Director",
    "```json",
    JSON.stringify(payload.editorial_director, null, 2),
    "```",
    "",
    "## Runtime Decisions",
    "```json",
    JSON.stringify(payload.runtime_decisions, null, 2),
    "```",
    "",
    "## Config Payload",
    "```json",
    JSON.stringify(payload.config_payload, null, 2),
    "```",
    "",
    "## Prompt Preview",
    "```text",
    payload.prompt_preview,
    "```",
    "",
    "## Generated Text Preview",
    "```text",
    payload.generated_text_preview || "No generated text in dry-run mode.",
    "```",
    "",
    "## Output Validation",
    "```json",
    JSON.stringify(payload.output_validation, null, 2),
    "```",
    "",
    "## Output Sanitization",
    "```json",
    JSON.stringify(payload.output_sanitization, null, 2),
    "```",
  ].join("\n"), "utf-8");
  return { jsonPath, mdPath };
}

function formatRuntimePreviewMessage(result, topic, previewMode = "dry") {
  const runtimeState = result.runtime?.runtime_state || {};
  const promptPackage = result.generation_pipeline?.prompt_package || {};
  const promptStructure = result.generation_pipeline?.prompt_structure || {};
  const contextSummary = result.generation_pipeline?.assembled_context_summary || {};
  const validation = result.integrated_validation || {};
  const stabilization = validation.stabilization || {};
  const identityRuntime = result.identity_runtime || {};
  const identityMetrics = identityRuntime.preview_metrics || {};
  const campaignMemory = result.campaign_memory || {};
  const campaignSignals = campaignMemory.adapter_signals || {};
  const strategicBrain = result.strategic_brain || {};
  const strategicSignals = strategicBrain.adapter_signals || {};
  const editorialDirector = result.editorial_director || {};
  const editorialSignals = editorialDirector.adapter_signals || {};
  const cognition = promptPackage.runtimeCognitionState || {};
  const promptPreview = promptPackage.assembledPrompt?.final_prompt || "";
  const configSummary = {
    llmExecutionMode: result.generation_pipeline?.llm_execution_mode,
    intended_model: promptPackage.configPayload?.intended_model,
    max_tokens: promptPackage.configPayload?.max_tokens,
    temperature: promptPackage.configPayload?.temperature,
    platform: promptPackage.configPayload?.platform,
    format: promptPackage.configPayload?.format,
    production_execution_allowed: promptPackage.configPayload?.production_execution_allowed,
    external_api_calls_allowed: promptPackage.configPayload?.external_api_calls_allowed,
    telegram_delivery_allowed: promptPackage.configPayload?.telegram_delivery_allowed,
  };
  const sandbox = result.generation_pipeline?.runtime_execution_sandbox || {};
  const outputValidation = result.final_generation_result?.output_validation || {};
  const generatedText = result.final_generation_result?.content || "";

  return [
    `🧪 Runtime preview (admin-only, ${previewMode === "sandbox" ? "sandbox execution" : "dry run"})`,
    "",
    `Expert: ${result.expert_id}`,
    `Topic: ${topic}`,
    `Mode: ${result.generation_pipeline?.llm_execution_mode}`,
    `Sandbox executed: ${sandbox.execution?.executed === true}`,
    `Content status: ${result.final_generation_result?.content_execution_status}`,
    `Context selected: ${contextSummary.selected_count || 0}`,
    `Quality: ${validation.combined_quality_score}`,
    `Stabilization: ${stabilization.stabilization_score ?? "n/a"}`,
    `Author voice confidence: ${stabilization.author_voice_confidence ?? "n/a"}`,
    `Emotional pacing: ${stabilization.emotional_pacing_score ?? "n/a"}`,
    `CTA pressure: ${stabilization.cta_pressure_score ?? "n/a"}`,
    `Generic AI risk: ${stabilization.generic_ai_risk_score ?? "n/a"}`,
    `Continuity: ${stabilization.continuity_score ?? "n/a"}`,
    `Identity confidence: ${identityMetrics.identity_confidence ?? "n/a"}`,
    `Persona drift: ${identityMetrics.persona_drift_level ?? "n/a"}`,
    `Worldview stability: ${identityMetrics.worldview_stability ?? "n/a"}`,
    `Emotional continuity: ${identityMetrics.emotional_continuity ?? "n/a"}`,
    `Rhetorical continuity: ${identityMetrics.rhetorical_continuity ?? "n/a"}`,
    `Generic AI divergence: ${identityMetrics.generic_ai_divergence ?? "n/a"}`,
    `Narrative persistence: ${identityMetrics.narrative_persistence ?? "n/a"}`,
    `Identity memory persisted: ${identityRuntime.persona_memory_persisted_after_run === true}`,
    `Campaign memory score: ${campaignSignals.campaign_memory_score ?? "n/a"}`,
    `Recent topic overlap: ${campaignSignals.recent_topic_overlap ?? "n/a"}`,
    `CTA fatigue: ${campaignSignals.cta_fatigue_level ?? "n/a"}`,
    `Narrative arc: ${campaignSignals.narrative_arc_status ?? "n/a"}`,
    `Suggested next move: ${campaignSignals.suggested_next_move ?? "n/a"}`,
    `Format variety: ${campaignSignals.format_variety ?? "n/a"}`,
    `Audience fatigue: ${campaignSignals.audience_fatigue_risk ?? "n/a"}`,
    `Strategic brain score: ${strategicSignals.strategic_brain_score ?? "n/a"}`,
    `Trust level: ${strategicSignals.trust_level ?? "n/a"}`,
    `Authority level: ${strategicSignals.authority_level ?? "n/a"}`,
    `Emotional warmth: ${strategicSignals.emotional_warmth_level ?? "n/a"}`,
    `Audience trust fatigue: ${strategicSignals.audience_fatigue ?? "n/a"}`,
    `Conversion pressure: ${strategicSignals.conversion_pressure ?? "n/a"}`,
    `Intimacy pacing: ${strategicSignals.intimacy_pacing ?? "n/a"}`,
    `Overselling risk: ${strategicSignals.overselling_risk ?? "n/a"}`,
    `Current narrative loop: ${strategicSignals.current_narrative_loop ?? "n/a"}`,
    `Strategic next move: ${strategicSignals.strategic_next_move ?? "n/a"}`,
    `Editorial director score: ${editorialSignals.editorial_director_score ?? "n/a"}`,
    `Audience temperature: ${editorialSignals.current_audience_temperature ?? "n/a"}`,
    `Authority saturation: ${editorialSignals.authority_saturation ?? "n/a"}`,
    `Emotional saturation: ${editorialSignals.emotional_saturation ?? "n/a"}`,
    `Freshness score: ${editorialSignals.editorial_freshness ?? "n/a"}`,
    `Narrative progression: ${editorialDirector.storytelling?.narrative_progression_stage ?? "n/a"}`,
    `Current content arc: ${editorialDirector.storytelling?.current_content_arc ?? "n/a"}`,
    `Recommended next format: ${editorialSignals.recommended_content_format ?? "n/a"}`,
    `Recommended next narrative move: ${editorialSignals.recommended_next_narrative_move ?? "n/a"}`,
    `Attention stability: ${editorialDirector.attention_loop?.attention_loop_stability ?? "n/a"}`,
    `Fatigue risk: ${editorialSignals.fatigue_risk ?? "n/a"}`,
    `Storytelling continuity: ${editorialDirector.storytelling?.storytelling_continuity ?? "n/a"}`,
    "",
    "Runtime decisions:",
    compactJson(result.runtime?.selected_generation_decisions, 700),
    "",
    "Cognition summary:",
    compactJson({
      trust_score: runtimeState.trust_progression?.trust_score,
      audience_stage: runtimeState.audience_state?.stage,
      recent_topics: runtimeState.narrative_continuity?.recent_topics,
      recent_ctas: runtimeState.cta_pacing?.recent_ctas,
      persisted_after_run: result.cognition_loading?.persisted_after_run,
      cognition_loaded_from_disk: result.cognition_loading?.loaded_from_disk,
      runtime_cognition_keys: Object.keys(cognition),
    }, 700),
    "",
    "CTA pacing:",
    compactJson(validation.trust_cta_pacing, 650),
    "",
    "Repetition risk:",
    compactJson(validation.repetition_risk, 650),
    "",
    "Author voice:",
    compactJson(validation.author_voice_status, 700),
    "",
    "Identity runtime:",
    compactJson({
      identity_confidence: identityMetrics.identity_confidence,
      persona_drift_level: identityMetrics.persona_drift_level,
      worldview_stability: identityMetrics.worldview_stability,
      emotional_continuity: identityMetrics.emotional_continuity,
      rhetorical_continuity: identityMetrics.rhetorical_continuity,
      generic_ai_divergence: identityMetrics.generic_ai_divergence,
      narrative_persistence: identityMetrics.narrative_persistence,
      memory_path: identityRuntime.persona_memory_path,
      memory_run_count: identityRuntime.persona_memory_run_count,
      warnings: identityRuntime.warnings,
    }, 900),
    "",
    "Campaign memory:",
    compactJson({
      recent_topic_overlap: campaignSignals.recent_topic_overlap,
      cta_fatigue_level: campaignSignals.cta_fatigue_level,
      narrative_arc_status: campaignSignals.narrative_arc_status,
      suggested_next_move: campaignSignals.suggested_next_move,
      format_variety: campaignSignals.format_variety,
      audience_fatigue_risk: campaignSignals.audience_fatigue_risk,
      topic_repetition_risk: campaignSignals.topic_repetition_risk,
      cta_pacing_recommendation: campaignSignals.cta_pacing_recommendation,
      campaign_memory_score: campaignSignals.campaign_memory_score,
      memory_path: campaignMemory.campaign_state_path,
      memory_run_count: campaignMemory.campaign_state_run_count,
      warnings: campaignMemory.warnings,
    }, 900),
    "",
    "Strategic brain:",
    compactJson({
      trust_level: strategicSignals.trust_level,
      authority_level: strategicSignals.authority_level,
      emotional_warmth_level: strategicSignals.emotional_warmth_level,
      audience_fatigue: strategicSignals.audience_fatigue,
      conversion_pressure: strategicSignals.conversion_pressure,
      intimacy_pacing: strategicSignals.intimacy_pacing,
      overselling_risk: strategicSignals.overselling_risk,
      current_narrative_loop: strategicSignals.current_narrative_loop,
      strategic_next_move: strategicSignals.strategic_next_move,
      authority_pacing_recommendation: strategicSignals.authority_pacing_recommendation,
      next_soft_conversion_opportunity: strategicSignals.next_soft_conversion_opportunity,
      overselling_prevention_signal: strategicSignals.overselling_prevention_signal,
      positioning_reinforcement_suggestion: strategicSignals.positioning_reinforcement_suggestion,
      memory_path: strategicBrain.strategic_state_path,
      memory_run_count: strategicBrain.strategic_state_run_count,
      warnings: strategicBrain.warnings,
    }, 900),
    "",
    "Editorial director:",
    compactJson({
      editorial_state: editorialDirector.editorial_state_summary,
      audience_temperature: editorialSignals.current_audience_temperature,
      audience_temperature_score: editorialSignals.audience_temperature_score,
      saturation_warning: editorialSignals.saturation_warning,
      authority_saturation: editorialSignals.authority_saturation,
      emotional_saturation: editorialSignals.emotional_saturation,
      freshness_score: editorialSignals.editorial_freshness,
      narrative_progression_stage: editorialDirector.storytelling?.narrative_progression_stage,
      current_content_arc: editorialDirector.storytelling?.current_content_arc,
      recommended_next_format: editorialSignals.recommended_content_format,
      recommended_next_narrative_move: editorialSignals.recommended_next_narrative_move,
      attention_stability: editorialDirector.attention_loop?.attention_loop_stability,
      attention_loop_status: editorialSignals.attention_loop_status,
      fatigue_risk: editorialSignals.fatigue_risk,
      storytelling_continuity: editorialDirector.storytelling?.storytelling_continuity,
      category_balance: editorialSignals.content_category_balancing_signals,
      freshness_recommendations: editorialSignals.freshness_recommendations,
      memory_path: editorialDirector.editorial_state_path,
      memory_run_count: editorialDirector.editorial_state_run_count,
      warnings: editorialDirector.warnings,
    }, 1000),
    "",
    `Warnings: ${validation.warnings?.length ? validation.warnings.join(", ") : "none"}`,
    "",
    "Sandbox diagnostics:",
    compactJson({
      sandbox_execution_enabled: sandbox.sandbox_execution_enabled,
      output_validation_enabled: sandbox.output_validation_enabled,
      output_sanitization_enabled: sandbox.output_sanitization_enabled,
      provider: sandbox.execution?.provider,
      external_api_calls: sandbox.diagnostics?.external_api_calls,
      validation_status: outputValidation.status,
      sanitization_changed: result.final_generation_result?.output_sanitization?.changed,
      validation_warnings: outputValidation.warnings,
    }, 900),
    generatedText ? [
      "",
      "Generated text preview:",
      truncatePreview(generatedText, 1200),
    ].join("\n") : "",
    "",
    "Config summary:",
    compactJson(configSummary, 750),
    "",
    `Prompt chars: ${promptStructure.total_prompt_chars || 0}`,
    "Prompt preview:",
    truncatePreview(promptPreview, 900),
  ].join("\n");
}

async function sendLongPlainText(chatId, text, replyMarkup = null) {
  const chunks = [];
  let rest = text;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 3900));
    rest = rest.slice(3900);
  }
  for (let i = 0; i < chunks.length; i++) {
    const options = replyMarkup && i === chunks.length - 1 ? { reply_markup: replyMarkup } : undefined;
    await bot.sendMessage(chatId, chunks[i], options);
  }
}

// ПРАВКА 3+4: публикация всегда идёт в TG_CHANNEL
async function showFinalPost(chatId, type) {
  const state = userState.get(chatId) || {};

  if (!TG_CHANNEL) {
    await bot.sendMessage(chatId, "⚠️ Канал не настроен. Добавьте переменную TG_CHANNEL в Railway.\n\nПоложительный числовой chat_id канала, например: -1001234567890");
    return;
  }

  const publishMsg = await bot.sendMessage(chatId, "📤 Публикую в канал...");

  const result = await publishToChannel(type, state);

  await bot.deleteMessage(chatId, publishMsg.message_id).catch(() => {});

  if (result.ok) {
    const typeLabels = { text_photo: "Текст + Фото", text_video: "Текст + Видео", text_only: "Текст" };
    await bot.sendMessage(chatId,
      `✅ *Пост опубликован в канал!*\n\nФормат: ${typeLabels[type] || type}\n\n🔄 Создать новый пост?`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "✏️ Новый пост", callback_data: "new_topic" },
          { text: "♻️ Другой формат", callback_data: "pub_menu" },
        ]]},
      }
    );
  } else {
    await bot.sendMessage(chatId,
      "Публикация не прошла. Проверьте, что бот добавлен в канал администратором и TG_CHANNEL настроен корректно."
    );
  }
}

async function processAudioWithTrack(chatId, trackId) {
  const state = userState.get(chatId) || {};
  const track = (state.previewTracks || []).find(t => t.id === trackId);
  const voiceB64 = state.pendingVoiceBuffer;
  if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса."); return; }
  const voiceBuffer = Buffer.from(voiceB64, 'base64');
  const statusMsg = await bot.sendMessage(chatId, `🎵 Микширую с "${track?.name || trackId}"...`);
  let finalBuffer;
  try {
    finalBuffer = await mixAudioWithMusic(voiceBuffer, track.url);
    await bot.editMessageText("✅ Аудио с музыкой готово!", { chat_id: chatId, message_id: statusMsg.message_id });
  } catch(err) {
    console.error("Ошибка микширования:", err.message);
    finalBuffer = voiceBuffer;
    await bot.editMessageText("Музыку не удалось добавить, отправляю голос без музыки.", { chat_id: chatId, message_id: statusMsg.message_id });
  }
  await bot.sendVoice(chatId, finalBuffer, {}, { filename: "voice_music.mp3", contentType: "audio/mpeg" });
  const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
  let audioUrl = null;
  try {
    audioUrl = await uploadAudioToCloudinary(finalBuffer);
    await recordRuntimeCost(chatId, "upload", "cloudinary_upload", COST_ESTIMATES_USD.cloudinary_upload).catch(() => {});
    await bot.editMessageText("✅ Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
  } catch(err) {
    await bot.editMessageText("Аудио готово, но загрузка для видео сейчас недоступна.", { chat_id: chatId, message_id: uploadMsg.message_id });
  }
  const s = userState.get(chatId) || {};
  s.lastAudioUrl = audioUrl;
  s.pendingVoiceBuffer = null;
  userState.set(chatId, s);
  await bot.sendMessage(chatId, `✅ Аудио готово\n💰 $${(state.pendingAudioCost || 0).toFixed(4)}`);
  await sendPhotoButtons(chatId);
}

// ─── ГЕНЕРАЦИЯ ТЕКСТА ─────────────────────────────────────────────────────────

async function generatePostText(topic, scenario, lengthMode = "normal", styleKey = "auto", chatId = null) {
  const result = await generatePostTextResult(topic, scenario, lengthMode, styleKey, "default", "", chatId);
  return result.text;
}

function createAnswerId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function feedbackLogPath(authorId = process.env.AUTHOR_PROFILE_ID || "dinara") {
  const day = new Date().toISOString().slice(0, 10);
  return join(RUNTIME_DATA_ROOT, "feedback_reports", `${authorId}_feedback_${day}.jsonl`);
}

async function appendFeedbackItem(item) {
  const filePath = feedbackLogPath();
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(item)}\n`, "utf-8");
}

function buildFeedbackPayload(query, answerId, feedbackType) {
  const state = userState.get(query.message.chat.id) || {};
  const retrievedSources = state.lastRetrievalMeta?.sources || [];
  return {
    timestamp: new Date().toISOString(),
    telegram_user_id: query.from?.id || query.message.chat.id,
    scenario: state.lastScenario || null,
    topic: state.lastTopic || state.pendingTopic || null,
    selected_length: state.lastLengthMode || state.pendingLengthMode || null,
    selected_style: state.lastStyleKey || "auto",
    generated_answer_id: answerId,
    feedback_type: feedbackType,
    retrieved_sources: retrievedSources,
    production_version: state.lastRetrievalMeta?.productionVersion || null,
  };
}

function feedbackKeyboard(answerId) {
  return [
    [
      { text: "👍 Похоже на меня", callback_data: `feedback:like:${answerId}` },
      { text: "👎 Не похоже", callback_data: `feedback:not_voice:${answerId}` },
    ],
    [
      { text: "🔁 Перегенерировать", callback_data: "regen:telegram" },
      { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
    ],
    [
      { text: "🧠 Экспертнее", callback_data: "regen:expert" },
      { text: "💬 Личнее", callback_data: "regen:voice" },
    ],
    [{ text: "✏️ Дать правку словами", callback_data: `feedback:edit:${answerId}` }],
  ];
}

function directedRegenerationKeyboard() {
  return [
    [
      { text: "🌿 Мягче", callback_data: "regen:softer" },
      { text: "⚡ Сильнее", callback_data: "regen:stronger" },
    ],
    [
      { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
      { text: "🧲 Провокационнее", callback_data: "regen:provocative" },
    ],
    [
      { text: "🧠 Экспертнее", callback_data: "regen:expert" },
      { text: "💬 Telegram-style", callback_data: "regen:telegram" },
    ],
    [
      { text: "✂️ Короче", callback_data: "regen:shorter" },
      { text: "📚 Длиннее", callback_data: "regen:longer" },
    ],
  ];
}

function buildWhyThisFeelsLikeYou(state = {}) {
  const signals = [];
  const text = String(state.lastFullAnswer || "");
  const quality = state.lastQualityPass || {};
  const retrieval = state.lastRetrievalMeta || {};
  const variant = state.lastGenerationVariant || "default";

  if (state.firstGenerationBoostApplied) {
    signals.push("усиленный style lock для первого WOW-поста");
  }
  if (state.lastAuthorVoiceMeta?.profileLoaded) {
    signals.push("авторский voice profile");
  }
  if (retrieval.sources?.length) {
    signals.push("смыслы из ваших материалов");
  }
  if (quality.rewritten) {
    signals.push("anti-generic pass после черновика");
  }
  if (variant !== "default") {
    signals.push(`направление правки: ${variant}`);
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const shortFragments = paragraphs.filter((p) => p.length <= 90).length;
  if (shortFragments) signals.push("короткие разговорные фрагменты");
  if (/[?？]\s*$/m.test(text) || /спросить себя|заметить|прислушаться/i.test(text)) {
    signals.push("рефлексивный финал");
  }
  if (/терап|внутри|границ|стыд|тревог|контакт|чувств|тело|опор/i.test(text)) {
    signals.push("терапевтическая рамка");
  }

  const picked = signals.slice(0, 4);
  if (!picked.length) picked.push("эмоциональная каденция", "живые паузы", "мягкий авторский вывод");

  return `Почему это похоже на вас:\n${picked.map((item) => `• ${item}`).join("\n")}`;
}

function shareExpertKeyboard() {
  const shareText = encodeURIComponent("Посмотри, как мой AI-эксперт пишет в моём стиле. Можно показать свой первый пост и собрать такого же под себя.");
  return [[
    { text: "📣 Показать AI-эксперта другу", url: `https://t.me/share/url?text=${shareText}` },
    { text: "💌 Текст для пересылки", callback_data: "share_friend" },
  ]];
}

async function sendBetaInviteCopy(chatId) {
  await bot.sendMessage(chatId, [
    "Текст для закрытого beta-инвайта:",
    "",
    "Я тестирую AI-эксперта для контента: он собирает роль, стиль и материалы, а потом пишет посты так, будто у автора уже есть свой живой голос.",
    "",
    "Можно начать с демо за минуту или создать своего эксперта из шаблона. Первые генерации бесплатные, дальше будем тестировать premium-доступ через Telegram Stars.",
    "",
    "Старт: отправьте /start этому боту.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: "Попробовать демо", callback_data: "demo_start" }],
      [{ text: "Создать AI-эксперта", callback_data: "ob_template_menu" }],
    ]},
  });
}

async function sendCreateExpertCta(chatId) {
  await bot.sendMessage(chatId, [
    "Создайте своего AI-эксперта.",
    "",
    "Быстро: шаблон даст первый пост сразу.",
    "Точнее: добавьте материалы и примеры стиля, чтобы посты звучали ближе к вам.",
  ].join("\n"), {
    reply_markup: { inline_keyboard: [
      [{ text: "Быстрый старт с шаблоном", callback_data: "ob_template_menu" }],
      [{ text: "Собрать с нуля", callback_data: "ob_start" }],
      [{ text: "Сначала демо", callback_data: "demo_start" }],
    ]},
  });
}

function buildRegenerationInstruction(variant = "default", feedbackNote = "", tuning = DEFAULT_RUNTIME_TUNING) {
  const instruction = REGENERATION_VARIANTS[variant] || "";
  if (!instruction && !feedbackNote) return "";
  const note = feedbackNote ? `\nКомментарий пользователя: "${feedbackNote}"` : "";
  const strength = tuning.regeneration_strength || "normal";
  const strengthLine = strength === "high"
    ? "\nRuntime tuning: делай изменение заметным, чтобы пользователь явно увидел разницу, но не ломай тему и голос."
    : strength === "light"
      ? "\nRuntime tuning: меняй мягко, сохраняя большую часть удачного текста."
      : "";
  return `\n\nВАРИАНТ ПЕРЕГЕНЕРАЦИИ:\n${instruction}${note}${strengthLine}`;
}

function humanizeGeneratedPostText(text) {
  let result = String(text || "").trim();
  const replacements = [
    [/важно помнить,?\s*/giu, ""],
    [/важно понимать,?\s*/giu, ""],
    [/важно отметить,?\s*/giu, ""],
    [/следует отметить,?\s*/giu, ""],
    [/следует понимать,?\s*/giu, ""],
    [/необходимо понимать,?\s*/giu, ""],
    [/необходимо помнить,?\s*/giu, ""],
    [/таким образом,?\s*/giu, ""],
    [/подводя итог,?\s*/giu, ""],
    [/в заключение,?\s*/giu, ""],
    [/в современном мире\s*/giu, ""],
    [/в наше время\s*/giu, ""],
    [/данная тема/giu, "эта тема"],
    [/данная проблема/giu, "эта сложность"],
    [/данный вопрос/giu, "этот вопрос"],
    [/каждый человек уникален\.?/giu, ""],
    [/каждый из нас/giu, "многие из нас"],
    [/в этой статье мы рассмотрим,?\s*/giu, ""],
    [/сегодня мы поговорим о том,?\s*/giu, ""],
    [/существует множество факторов,?\s*/giu, "часто здесь много слоёв, "],
    [/это является важным аспектом/giu, "это правда может многое менять"],
    [/нужно работать над собой/giu, "можно бережно смотреть на себя"],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result
    .replace(/^\s*\d+[\).]\s+/gm, "")
    .replace(/^\s*(#{1,6}\s*)/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/([.!?])\s+(А ещё важно[^.!?]*[.!?])/giu, "$1")
    .replace(/\s+,/g, ",")
    .replace(/(^|\n)([а-яё])/giu, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function generatePostTextResult(topic, scenario, lengthMode = "normal", styleKey = "auto", variant = "default", feedbackNote = "", chatId = null) {
  let context = "";
  let retrievalMeta = null;
  const normalizedStyleKey = scenario === "sexologist" ? normalizeSexologistStyleKey(styleKey) : styleKey;
  const userScenarioContext = chatId ? await buildUserScenarioContext(chatId, scenario, topic) : null;
  const runtimeState = chatId ? (userState.get(chatId) || {}) : {};
  const runtimeConfig = chatId ? await loadExpertRuntime(chatId).catch(() => normalizeExpertRuntime()) : normalizeExpertRuntime();
  const runtimeTuning = runtimeConfig.tuning || DEFAULT_RUNTIME_TUNING;
  const starterTemplateKey = userScenarioContext?.profile?.starter_template || runtimeState.demoTemplateKey || null;
  const starterTemplate = starterTemplateKey ? STARTER_EXPERT_TEMPLATES[starterTemplateKey] : null;
  let generationOwnership = await resolveGenerationOwnership(chatId, scenario, normalizedStyleKey);
  if (userScenarioContext?.scenario) {
    generationOwnership = {
      ...generationOwnership,
      expertId: userScenarioContext.scenario.id || generationOwnership.expertId,
      displayName: userScenarioContext.profile?.expert_name || userScenarioContext.scenario.expert_name || generationOwnership.displayName,
      knowledgeBase: `user-filesystem:${userScenarioContext.scenario.id || scenario}`,
      styleProfile: userScenarioContext.profile?.starter_template || userScenarioContext.scenario.id || generationOwnership.styleProfile,
      isolation: {
        ...generationOwnership.isolation,
        expertId: userScenarioContext.scenario.id || generationOwnership.expertId,
        embeddingNamespace: userScenarioContext.scenario.id || generationOwnership.expertId,
        retrievalConfigId: `user-filesystem:${userScenarioContext.scenario.id || scenario}`,
        authorProfileId: userScenarioContext.profile?.starter_template || userScenarioContext.scenario.id || generationOwnership.styleProfile,
        authorProfilePath: join("users", String(chatId), "experts", userScenarioContext.scenario.id || scenario),
      },
    };
  } else if (starterTemplate && runtimeState.demoMode) {
    generationOwnership = {
      ...generationOwnership,
      expertId: `starter:${starterTemplateKey}`,
      displayName: starterTemplate.expertName || starterTemplate.label,
      knowledgeBase: `starter-template:${starterTemplateKey}`,
      styleProfile: `starter-template:${starterTemplateKey}`,
      isolation: {
        ...generationOwnership.isolation,
        expertId: `starter:${starterTemplateKey}`,
        embeddingNamespace: `starter:${starterTemplateKey}`,
        retrievalConfigId: `starter-template:${starterTemplateKey}`,
        authorProfileId: `starter-template:${starterTemplateKey}`,
        authorProfilePath: join("templates", "starter-experts", starterTemplateKey),
      },
    };
  }

  if (userScenarioContext?.scenario) {
    context = userScenarioContext.context;
    retrievalMeta = {
      sources: ["user-filesystem-onboarding"],
      chunksCount: 0,
      estimatedTokens: Math.ceil(context.length / 3.5),
      productionVersion: null,
      knowledgeBase: generationOwnership.knowledgeBase,
    };
  } else if (starterTemplate && runtimeState.demoMode) {
    context = [
      `Demo starter template: ${starterTemplate.label}`,
      `Topic: ${topic}`,
      "Worldview:",
      ...starterTemplate.worldview.map((item) => `- ${item}`),
      "",
      `Cadence: ${starterTemplate.cadence}`,
      `Emotional style: ${starterTemplate.emotionalStyle}`,
      "Openings:",
      ...starterTemplate.openings.map((item) => `- ${item}`),
      "CTA patterns:",
      ...starterTemplate.ctaPatterns.map((item) => `- ${item}`),
    ].join("\n");
    retrievalMeta = {
      sources: [`starter-template:${starterTemplateKey}`],
      chunksCount: 0,
      estimatedTokens: Math.ceil(context.length / 3.5),
      productionVersion: null,
      knowledgeBase: generationOwnership.knowledgeBase,
    };
  } else if (scenario === "sexologist") {
    const retrieval = await retrieveGroundingContext(topic, generationOwnership.knowledgeBase).catch((error) => {
      console.warn("Production retrieval failed:", error.message);
      return null;
    });
    if (retrieval?.context) {
      context = retrieval.context;
      retrievalMeta = {
        sources: retrieval.sources || [],
        chunksCount: retrieval.chunks?.length || 0,
        estimatedTokens: retrieval.estimatedTokens || 0,
        productionVersion: retrieval.productionVersion || null,
        knowledgeBase: generationOwnership.knowledgeBase,
      };
    } else {
      const fallbackChunks = await vectorSearch(topic, generationOwnership.knowledgeBase, 3);
      if (fallbackChunks && fallbackChunks.length > 0) {
        context = fallbackChunks.map(c => c.chunk_text).join("\n\n");
        retrievalMeta = {
          sources: fallbackChunks.map((chunk) => chunk.source || chunk.filename || "legacy-vector-source"),
          chunksCount: fallbackChunks.length,
          estimatedTokens: Math.ceil(context.length / 3.5),
          productionVersion: null,
          knowledgeBase: generationOwnership.knowledgeBase,
          warning: "Production retrieval unavailable; used legacy vector fallback.",
        };
      } else {
        context = `Тема запроса: "${topic}". Отвечай на основе общих знаний психолога-сексолога, строго в рамках профессиональной этики. Не выдумывай исследования и статистику.`;
        retrievalMeta = {
          sources: [],
          chunksCount: 0,
          estimatedTokens: Math.ceil(context.length / 3.5),
          productionVersion: null,
          knowledgeBase: generationOwnership.knowledgeBase,
          warning: "Retrieval unavailable; used generic professional fallback.",
        };
      }
    }
  } else {
    const chunks = await vectorSearch(topic, generationOwnership.knowledgeBase, 5);
    if (chunks && chunks.length > 0) {
      context = chunks.map(c => c.chunk_text).join("\n\n");
    } else if (scenario === "psychologist") {
      const topArticles = articles
        .map(a => ({ ...a, score: scoreArticle(a, topic) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      context = topArticles.map(a => `Статья: ${a.title}\n${a.content}`).join("\n\n");
    }
    retrievalMeta = retrievalMeta || {
      sources: chunks?.length ? chunks.map((chunk) => chunk.source || chunk.filename || "legacy-vector-source") : [],
      chunksCount: chunks?.length || 0,
      estimatedTokens: Math.ceil(context.length / 3.5),
      productionVersion: null,
      knowledgeBase: generationOwnership.knowledgeBase,
      warning: chunks?.length ? null : "Used article fallback or generic scenario context.",
    };
  }

  const effectiveLengthMode = variant === "shorter" ? "short" : variant === "longer" ? "long" : lengthMode;
  const lengthConfig = getLengthConfig(["psychologist", "sexologist"].includes(scenario) ? scenario : "psychologist", effectiveLengthMode);
  const maxTokens = lengthConfig.maxTokens;
  const lengthInstruction = lengthConfig.instruction;

  const baseSystemPrompt = userScenarioContext?.scenario
    ? [
        `Ты — ${userScenarioContext.profile?.expert_name || userScenarioContext.scenario.expert_name || "эксперт"}.`,
        userScenarioContext.scenario.system_prompt,
        "Пишешь посты для Telegram/Instagram от первого лица или от лица экспертного бренда, если это естественно.",
        "Не выдумывай биографические факты. Опирайся на загруженные материалы, persona draft, worldview draft и style examples.",
        "Стиль: живой, конкретный, без канцелярита, без нумерованных списков, с мягким полезным финалом.",
        "Для нового эксперта особенно важно звучать узнаваемо: повторяй его ритм абзацев, типичные открытия, CTA и эмоциональную температуру из style guidance.",
        "Если материалов мало или они слабые, не становись универсальным блогером: честно держись роли, темы и тех немногих речевых сигналов, которые есть.",
      ].filter(Boolean).join("\n")
    : starterTemplate && runtimeState.demoMode
    ? [
        `Ты — ${starterTemplate.expertName}, AI-эксперт в роли "${starterTemplate.label}".`,
        "Пишешь живой русский пост для Telegram/Instagram.",
        "Не выдумывай биографию, дипломы, клиентов, медицинские результаты или бизнес-гарантии.",
        "Главный критерий: текст должен звучать как конкретный эксперт из выбранного starter template, а не как универсальный психологический пост.",
        "Держи worldview, cadence, emotional style, openings и CTA patterns из контекста сильнее, чем встроенные сценарии Динары.",
      ].join("\n")
    : scenario === "sexologist"
    ? buildSexologistPrompt(normalizedStyleKey)
    : PSYCHOLOGIST_SYSTEM_PROMPT;
  const authorVoice = scenario === "sexologist"
    ? await loadAuthorVoiceProfile()
    : { enabled: false, profileLoaded: false, content: "" };
  if (scenario === "sexologist") logAuthorVoiceStatus(authorVoice);
  const authorVoicePrompt = buildAuthorVoicePrompt(authorVoice);
  const useDinaraFallbackPrompts = !userScenarioContext?.scenario && !(starterTemplate && runtimeState.demoMode);
  const fewShotPrompt = useDinaraFallbackPrompts ? await buildDinaraFewShotPrompt(topic) : "";
  const worldviewPrompt = useDinaraFallbackPrompts && runtimeTuning.worldview_injection !== "off" ? await buildDinaraWorldviewPrompt() : "";
  const realismPrompt = useDinaraFallbackPrompts ? DINARA_REALISM_PROMPT : "";
  const styleLockPrompt = buildStyleLockPrompt({ userScenarioContext, scenario, template: starterTemplate, tuning: runtimeTuning });
  const firstGenerationWowPrompt = buildFirstGenerationWowInstruction(runtimeState.firstGenerationBoost);
  const runtimeTuningPrompt = buildTuningPrompt(runtimeConfig);
  const systemPrompt = [baseSystemPrompt, worldviewPrompt, realismPrompt, fewShotPrompt, authorVoicePrompt, styleLockPrompt, firstGenerationWowPrompt, runtimeTuningPrompt].filter(Boolean).join("\n\n");
  const contentPresetInstruction = buildContentPresetInstruction(runtimeState.pendingContentPreset || runtimeState.lastContentPreset);
  const firstGenerationLine = runtimeState.firstGenerationBoost
    ? "\n- Это первая генерация: поставь эмоциональное узнавание выше аккуратной нейтральности."
    : "";

  const tunedTemperature = runtimeTuning.temperature === null || runtimeTuning.temperature === undefined
    ? 0.82
    : Number(runtimeTuning.temperature);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Тема: "${topic}"\n\nКонтекст:\n${context}\n\n${lengthInstruction} С одной жирной фразой (*жирный*).${contentPresetInstruction}\n\nSTABILIZATION:\n- Сделай первый экран сильным: конкретное узнаваемое переживание или тезис, без общих вступлений.\n- Не используй универсальные AI-фразы, канцелярит и безопасные пустые выводы.\n- Удерживай авторскую идентичность из persona/worldview/style guidance сильнее, чем общую экспертность.\n- Добавь 1-2 конкретные детали из контекста, если они есть, но не выдумывай факты.${firstGenerationLine}${buildRegenerationInstruction(variant, feedbackNote, runtimeTuning)}` }
    ],
    temperature: tunedTemperature,
    max_tokens: maxTokens,
  });

  const firstPassText = humanizeGeneratedPostText(completion.choices[0].message.content);
  const qualityPass = runtimeTuning.quality_rewrite_enabled === false
    ? {
        text: firstPassText,
        rewritten: false,
        quality: genericQualitySignals(firstPassText),
        firstPassQuality: genericQualitySignals(firstPassText),
      }
    : await rewriteGenericPostOnce({
        text: firstPassText,
        topic,
        context,
        lengthInstruction,
        systemPrompt,
        contentPresetInstruction,
        styleLockPrompt,
        maxTokens,
      });

  return {
    text: qualityPass.text,
    retrieval: retrievalMeta,
    ownership: generationOwnership,
    authorVoice: {
      enabled: authorVoice.enabled,
      author: authorVoice.author,
      profileLoaded: authorVoice.profileLoaded,
      profilePath: authorVoice.profilePath,
    },
    styleKey: normalizedStyleKey,
    lengthMode,
    firstGenerationBoost: Boolean(runtimeState.firstGenerationBoost),
    variant,
    qualityPass: {
      rewritten: qualityPass.rewritten,
      score: qualityPass.quality?.score,
      reasons: qualityPass.quality?.reasons || [],
      firstPassScore: qualityPass.firstPassQuality?.score,
    },
  };
}

// ПРАВКА 2: длина аудио — уменьшены лимиты для точного попадания в 13-15 сек
// Скорость речи ~14-16 символов/сек → 13-15 сек = 182-240 символов
// Ставим 200 симв для длинного (гарантированно 13-14 сек)
// Для короткого — 120 симв (~8 сек)
async function generateAudioText(fullAnswer, audioLength = "short") {
  const maxChars = audioLength === "long" ? 190 : 125;
  const maxTokens = audioLength === "long" ? 90 : 55;

  const wordLimit = audioLength === "long" ? "30-35 слов" : "18-20 слов";

  const instruction = audioLength === "long"
    ? `Возьми главную мысль из текста и перефразируй ровно в 2 ЗАКОНЧЕННЫХ предложения.
Требования:
- Ровно 2 предложения, каждое заканчивается точкой
- Строго ${wordLimit} суммарно (не больше!)
- Спокойный тон, без вопросов
- Без эмодзи, без markdown (* _)
- НЕЛЬЗЯ обрывать на полуслове`
    : `Возьми главную мысль из текста и перефразируй в ОДНО ЗАКОНЧЕННОЕ предложение.
Требования:
- Ровно 1 предложение, заканчивается точкой
- Строго ${wordLimit} (не больше!)
- Спокойный тон, без вопросов
- Без эмодзи, без markdown (* _)`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `${instruction}\n\nТекст:\n${fullAnswer}\n\nРезультат (только текст, без пояснений):` }],
    temperature: 0.3,
    max_tokens: maxTokens,
  });

  let result = completion.choices[0].message.content.trim().replace(/[*_]/g, '');

  // Жёсткая обрезка по последней точке если превысили лимит
  if (result.length > maxChars) {
    const lastDot = result.lastIndexOf('.', maxChars);
    if (lastDot > maxChars * 0.4) {
      result = result.substring(0, lastDot + 1);
    } else {
      // Обрезаем по последнему пробелу перед лимитом
      const lastSpace = result.lastIndexOf(' ', maxChars - 1);
      result = result.substring(0, lastSpace > 0 ? lastSpace : maxChars) + ".";
    }
  }

  return result;
}

async function sendGeneratedText(chatId, text, scenario) {
  const state = userState.get(chatId) || {};
  const scenarioLabel = state.demoMode && state.demoTemplateKey
    ? `⚡ Demo: ${STARTER_EXPERT_TEMPLATES[state.demoTemplateKey]?.label || "AI-эксперт"}`
    : await getScenarioLabel(chatId, scenario);
  const runtime = await loadExpertRuntime(chatId).catch(() => normalizeExpertRuntime());
  const remaining = runtimeRemaining(runtime, "text");
  const progressLine = remaining !== null
    ? `\n\nОсталось бесплатных генераций: ${remaining}/${runtime.limits?.text ?? "∞"}`
    : "";
  const answerId = state.lastAnswerId || createAnswerId();
  state.lastAnswerId = answerId;
  userState.set(chatId, state);

  await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(async () => {
    await bot.sendMessage(chatId, text);
  });

  if (state.firstGenerationBoostApplied) {
    await bot.sendMessage(chatId, [
      "Первый пост готов.",
      "",
      "Сейчас важный момент beta-теста: посмотрите не только на пользу текста, а на ощущение голоса. Если стало «да, это похоже на меня/моего эксперта», значит профиль уже можно развивать дальше.",
    ].join("\n"));
  }

  await bot.sendMessage(chatId, buildWhyThisFeelsLikeYou(state));

  const demoRows = state.demoMode
    ? [[{ text: "⚡ Создать такого эксперта себе", callback_data: `ob_template:${state.demoTemplateKey || "psychologist"}` }]]
    : [];

  await bot.sendMessage(chatId, `Сгенерировано: *${scenarioLabel}*${progressLine}\n\nЧто дальше?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [
      ...demoRows,
      ...feedbackKeyboard(answerId),
      ...directedRegenerationKeyboard(),
      ...shareExpertKeyboard(),
      [{ text: "💎 Запросить premium", callback_data: "req_limit_text" }],
      [{ text: "⭐ Сохранить этот сценарий", callback_data: "save_preset" }, { text: "🔄 Новый запрос", callback_data: "new_topic" }],
      [{ text: "✏️ Редактировать", callback_data: "txt_edit" }, { text: "♻️ Другой текст", callback_data: "regen_txt" }],
      [{ text: "👤 Улучшить AI-эксперта", callback_data: "ob_dashboard" }],
      [{ text: "✅ Текст готов", callback_data: "txt_ready" }],
    ]},
  });
}

// ─── КОМАНДЫ ─────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const inviteCode = text.replace("/start", "").trim();

  if (inviteCode) {
    const db = await loadDemoDB();
    const user = Object.values(db.users).find(u => u.invite_code === inviteCode);
    if (user) {
      if (user.tg_id !== chatId) {
        await bot.sendMessage(chatId, "🔐 Этот инвайт-код уже использован. Обратитесь к @tetss2 для получения нового доступа.");
        return;
      }
    }
  }

  userState.set(chatId, {});

  if (chatId === ADMIN_TG_ID) {
    userState.set(chatId, {});
    await bot.sendMessage(chatId, `👋 Добро пожаловать, *Дмитрий*! 🔑 Полный доступ.\n\nНажмите кнопку чтобы начать 👇`, { parse_mode: "Markdown", reply_markup: START_KEYBOARD });
    return;
  }

  if (await userHasCompletedExpert(chatId)) {
    const profile = await loadUserProfile(chatId);
    await bot.sendMessage(chatId,
      `👋 Добро пожаловать, *${profile?.expert_name || "эксперт"}*!\n\nВаш AI-эксперт уже создан. Открыл dashboard, чтобы сразу протестировать результат.`,
      { parse_mode: "Markdown", reply_markup: START_KEYBOARD }
    );
    await sendExpertDashboard(chatId, chatId);
    return;
  }

  const demoUser = await getDemoUserByTgId(chatId);
  if (demoUser) {
    const access = await checkDemoAccess(chatId);
    if (!access.allowed) {
      if (access.reason === "expired") {
        await handleExpired(chatId, access.user);
      } else {
        await handleNotRegistered(chatId);
      }
      return;
    }
    await bot.sendMessage(chatId,
      `👋 Добро пожаловать, *${demoUser.name}*!\n\n` +
      `📊 Ваш демо-доступ:\n` +
      `📝 Текст: ${demoUser.limits.text.used}/${demoUser.limits.text.max}\n` +
      `🖼 Фото: ${demoUser.limits.photo.used}/${demoUser.limits.photo.max}\n` +
      `🎬 Видео: ${demoUser.limits.video.used}/${demoUser.limits.video.max}\n\n` +
      `Нажмите кнопку чтобы начать 👇`,
      { parse_mode: "Markdown", reply_markup: START_KEYBOARD }
    );
  } else {
    await bot.sendMessage(chatId,
      "Добро пожаловать в закрытую beta.\n\nЦель простая: за пару минут увидеть, может ли AI-эксперт звучать как живой автор, а не как шаблонный GPT-пост.",
      { reply_markup: { inline_keyboard: [
        [{ text: "⚡ Попробовать демо сейчас", callback_data: "demo_start" }],
        [{ text: "🚀 Start with template expert", callback_data: "ob_template_menu" }],
        [{ text: "Создать AI-эксперта", callback_data: "ob_start" }],
        [{ text: "💌 Текст инвайта", callback_data: "demo_invite_copy" }],
        [{ text: "У меня уже есть доступ", callback_data: "show_help" }],
      ]}}
    );
  }
});

bot.onText(/\/help/, async (msg) => { await sendHelp(msg.chat.id); });

bot.onText(/\/onboard/, async (msg) => {
  await startExpertOnboarding(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/onboarding_guide/, async (msg) => {
  await sendBetaOnboardingGuide(msg.chat.id);
});

bot.onText(/\/demo/, async (msg) => {
  await sendStarterTemplateMenu(msg.chat.id, "demo");
});

bot.onText(/\/invite/, async (msg) => {
  await sendBetaInviteCopy(msg.chat.id);
});

bot.onText(/\/premium_status/, async (msg) => {
  await bot.sendMessage(msg.chat.id, await buildPremiumStatusText(msg.from?.id || msg.chat.id));
});

bot.onText(/\/plans/, async (msg) => {
  await bot.sendMessage(msg.chat.id, buildPaidBetaPlansText(), {
    reply_markup: { inline_keyboard: [
      [{ text: `Оплатить ${BETA_PACK_STARS_PRICE} Stars`, callback_data: "stars_pack:text10" }],
      [{ text: "Запросить beta_paid вручную", callback_data: "req_limit_text" }],
    ]},
  });
});

bot.onText(/\/upgrade/, async (msg) => {
  await bot.sendMessage(msg.chat.id, buildManualUpgradeText(), {
    reply_markup: { inline_keyboard: [
      [{ text: `Оплатить ${BETA_PACK_STARS_PRICE} Stars`, callback_data: "stars_pack:text10" }],
      [{ text: "Запросить beta_paid вручную", callback_data: "req_limit_text" }],
      [{ text: "Посмотреть планы", callback_data: "show_plans" }],
    ]},
  });
});

bot.onText(/\/create_expert/, async (msg) => {
  await sendCreateExpertCta(msg.chat.id);
});

bot.onText(/\/my_expert/, async (msg) => {
  await sendExpertDashboard(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/add_scenario/, async (msg) => {
  await startAddScenario(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/admin_expert(?:\s+(\S+))?/, async (msg, match) => {
  const adminUserId = msg.from?.id || msg.chat.id;
  const targetUserId = match?.[1] || adminUserId;
  await sendAdminTools(msg.chat.id, adminUserId, targetUserId);
});

bot.onText(/\/tune(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+([\s\S]+))?/, async (msg, match) => {
  const adminUserId = msg.from?.id || msg.chat.id;
  if (!isAdminUser(adminUserId)) {
    await bot.sendMessage(msg.chat.id, "🔒 Tuning доступен только администратору.");
    return;
  }
  const targetUserId = match?.[1] || adminUserId;
  const key = match?.[2];
  const value = match?.[3];
  if (!key) {
    await sendAdminTuningPanel(msg.chat.id, adminUserId, targetUserId);
    return;
  }
  const result = await updateRuntimeSetting(targetUserId, key, value);
  if (!result.ok) {
    await bot.sendMessage(msg.chat.id, `Не удалось обновить ${key}: ${result.error}`);
    return;
  }
  await bot.sendMessage(msg.chat.id, `✅ Updated ${key} for ${targetUserId}.`);
  await sendAdminTuningPanel(msg.chat.id, adminUserId, targetUserId);
});

bot.onText(/\/grant_beta(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminUserId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(adminUserId))) {
    await bot.sendMessage(chatId, "🔒 Paid beta grants доступны только admin/full_access.");
    return;
  }
  const targetUserId = match?.[1];
  const limit = match?.[2];
  const days = match?.[3];
  if (!targetUserId || !limit || !days) {
    await bot.sendMessage(chatId, "Usage: /grant_beta USER_ID LIMIT DAYS");
    return;
  }
  try {
    const entitlement = await grantBetaEntitlement(targetUserId, Number(limit), Number(days), adminUserId);
    await bot.sendMessage(chatId, ["✅ Beta paid access granted.", "", formatEntitlement(entitlement)].join("\n"));
  } catch (error) {
    await bot.sendMessage(chatId, `Grant failed: ${error.message}\nUsage: /grant_beta USER_ID LIMIT DAYS`);
  }
});

bot.onText(/\/revoke_beta(?:\s+(\S+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminUserId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(adminUserId))) {
    await bot.sendMessage(chatId, "🔒 Paid beta revoke доступен только admin/full_access.");
    return;
  }
  const targetUserId = match?.[1];
  if (!targetUserId) {
    await bot.sendMessage(chatId, "Usage: /revoke_beta USER_ID");
    return;
  }
  const entitlement = await revokeBetaEntitlement(targetUserId, adminUserId);
  await bot.sendMessage(chatId, ["✅ Beta access revoked.", "", formatEntitlement(entitlement)].join("\n"));
});

bot.onText(/\/usage(?:\s+(\S+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminUserId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(adminUserId))) {
    await bot.sendMessage(chatId, "🔒 Usage доступен только admin/full_access.");
    return;
  }
  const targetUserId = match?.[1];
  if (!targetUserId) {
    await bot.sendMessage(chatId, "Usage: /usage USER_ID");
    return;
  }
  const entitlement = await getOrCreateEntitlement(targetUserId);
  await bot.sendMessage(chatId, formatEntitlement(entitlement));
});

bot.onText(/\/voice_status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(userId))) {
    await bot.sendMessage(chatId, "🔒 Voice status доступен только admin/full_access.");
    return;
  }
  const readiness = await getVoiceReadiness(chatId);
  const yesNo = (value) => value ? "yes" : "no";
  await bot.sendMessage(chatId, [
    "Voice generation beta readiness",
    "",
    `voice enabled: ${yesNo(readiness.enabled)}`,
    `Fish Audio key present: ${yesNo(readiness.fishAudioKeyPresent)}`,
    `voiceProfileId present: ${yesNo(readiness.voiceProfileIdPresent)}`,
    `voiceProfileId source: ${readiness.voiceProfileSource}`,
    `Cloudinary present: ${yesNo(readiness.cloudinaryPresent)}`,
    `ffmpeg required for mixing: ${yesNo(readiness.ffmpegRequired)}`,
    `ffmpeg present: ${yesNo(readiness.ffmpegPresent)}`,
    `active expertId: ${readiness.expertId}`,
    "",
    "For /test_voice required: Fish Audio key + voiceProfileId.",
    "Cloudinary is only needed for video audio hosting; ffmpeg is only needed for music mixing.",
  ].join("\n"));
});

bot.onText(/\/test_voice(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  let status = null;
  console.log("[/test_voice] command received", { chatId, userId: msg.from?.id || chatId });
  try {
    status = await bot.sendMessage(chatId, "Генерирую тестовый голос...");

    const userId = msg.from?.id || chatId;
    if (!(await canManagePaidBeta(userId))) {
      await bot.sendMessage(chatId, "🔒 Test voice доступен только admin/full_access.");
      return;
    }

    const text = (match?.[1] || "").trim();
    if (!text) {
      await bot.sendMessage(chatId, [
        "Usage:",
        "/test_voice Привет, это тест голоса Динары",
      ].join("\n"));
      return;
    }

    const voiceText = text.length > 600 ? text.slice(0, 600).trim() : text;
    const readiness = await getVoiceReadiness(chatId);
    console.log("[/test_voice] expertId", readiness.expertId);
    console.log("[/test_voice] voiceProfileId source", readiness.voiceProfileSource);

    const missingText = buildVoiceReadinessMissingText(readiness);
    if (missingText) {
      await bot.sendMessage(chatId, missingText);
      return;
    }

    let buffer;
    try {
      console.log("[/test_voice] Fish request start");
      ({ buffer } = await generateVoice(voiceText, readiness.voiceProfileId));
      console.log("[/test_voice] Fish request success", { bytes: buffer.length });
    } catch (error) {
      console.log("[/test_voice] Fish request fail", error);
      await bot.sendMessage(chatId, formatVoiceGenerationError(error));
      return;
    }

    try {
      console.log("[/test_voice] Telegram sendAudio start");
      await bot.sendAudio(chatId, buffer, {
        caption: [
          "Тест голоса готов.",
          `expertId: ${readiness.expertId}`,
          `voiceProfileId source: ${readiness.voiceProfileSource}`,
        ].join("\n"),
      }, { filename: `${readiness.expertId || "expert"}-test-voice.mp3`, contentType: "audio/mpeg" });
      console.log("[/test_voice] Telegram sendAudio success");
    } catch (error) {
      console.log("[/test_voice] Telegram sendAudio fail", error);
      await bot.sendMessage(chatId, [
        "Голос сгенерирован, но Telegram не смог отправить аудио.",
        `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
      ].join("\n"));
      return;
    }

    await bot.editMessageText("Готово: тестовый mp3 отправлен.", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
  } catch (error) {
    console.log("[/test_voice] handler fail", error);
    const message = [
      "Не удалось выполнить /test_voice.",
      `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
    ].join("\n");
    if (status?.message_id) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: status.message_id,
      }).catch(async () => {
        await bot.sendMessage(chatId, message).catch(() => {});
      });
    } else {
      await bot.sendMessage(chatId, message).catch(() => {});
    }
  }
});

bot.onText(/\/image_status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(userId))) {
    await bot.sendMessage(chatId, "🔒 Image status доступен только admin/full_access.");
    return;
  }
  const readiness = await getImageReadiness(chatId);
  const yesNo = (value) => value ? "yes" : "no";
  await bot.sendMessage(chatId, [
    "Image/avatar generation beta readiness",
    "",
    `image enabled: ${yesNo(readiness.enabled)}`,
    `FALAI_KEY present: ${yesNo(readiness.falKeyPresent)}`,
    `active expertId: ${readiness.expertId}`,
    `media profile status: ${readiness.mediaProfileStatus}`,
    `imageAvatarProfileId present: ${yesNo(readiness.imageAvatarProfileIdPresent)}`,
    `image avatar source: ${readiness.imageAvatarProfileSource}`,
    `Dinara LoRA URL present: ${yesNo(readiness.loraUrlPresent)}`,
    `model endpoint: ${readiness.modelEndpoint}`,
    `image size: ${readiness.imageSize}`,
    "",
    "For /test_image required: FALAI_KEY + existing Dinara LoRA/profile.",
    "This diagnostic command does not spend generation limits.",
  ].join("\n"));
});

bot.onText(/\/test_image(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  let status = null;
  console.log("[/test_image] command received", { chatId, userId: msg.from?.id || chatId });
  try {
    status = await bot.sendMessage(chatId, "Генерирую тестовое изображение...");

    const userId = msg.from?.id || chatId;
    if (!(await canManagePaidBeta(userId))) {
      await bot.sendMessage(chatId, "🔒 Test image доступен только admin/full_access.");
      return;
    }

    const prompt = (match?.[1] || "").trim();
    if (!prompt) {
      await bot.sendMessage(chatId, [
        "Usage:",
        "/test_image sitting in cozy therapist office, warm soft light, bookshelf background",
      ].join("\n"));
      return;
    }

    const scenePrompt = prompt.length > 700 ? prompt.slice(0, 700).trim() : prompt;
    const readiness = await getImageReadiness(chatId);
    console.log("[/test_image] expertId", readiness.expertId);
    console.log("[/test_image] image source", readiness.imageAvatarProfileSource);
    console.log("[/test_image] model endpoint", readiness.modelEndpoint);

    const missingText = buildImageReadinessMissingText(readiness);
    if (missingText) {
      await bot.sendMessage(chatId, missingText);
      return;
    }

    let imageResult;
    try {
      console.log("[/test_image] FAL image request start", { endpoint: readiness.modelEndpoint });
      imageResult = await generateImage(chatId, scenePrompt, { loraUrl: readiness.loraUrl });
      console.log("[/test_image] FAL image request success", {
        imageUrlPresent: Boolean(imageResult?.imageUrl),
        cost: imageResult?.cost,
      });
    } catch (error) {
      console.log("[/test_image] FAL image request fail", error);
      await bot.sendMessage(chatId, formatImageGenerationError(error));
      return;
    }

    try {
      console.log("[/test_image] Telegram sendPhoto start");
      await bot.sendPhoto(chatId, imageResult.imageUrl, {
        caption: [
          "Тестовое изображение готово.",
          `expertId: ${readiness.expertId}`,
          `image source: ${readiness.imageAvatarProfileSource}`,
          `cost reported by FAL: $${Number(imageResult.cost || 0).toFixed(3)}`,
          "Generation limits were not incremented.",
        ].join("\n"),
      });
      console.log("[/test_image] Telegram sendPhoto success");
    } catch (error) {
      console.log("[/test_image] Telegram sendPhoto fail", error);
      await bot.sendMessage(chatId, [
        "Изображение сгенерировано, но Telegram не смог отправить фото.",
        `URL: ${imageResult.imageUrl}`,
        `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
      ].join("\n"));
      return;
    }

    await bot.editMessageText("Готово: тестовое изображение отправлено.", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
  } catch (error) {
    console.log("[/test_image] handler fail", error);
    const message = [
      "Не удалось выполнить /test_image.",
      `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
    ].join("\n");
    if (status?.message_id) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: status.message_id,
      }).catch(async () => {
        await bot.sendMessage(chatId, message).catch(() => {});
      });
    } else {
      await bot.sendMessage(chatId, message).catch(() => {});
    }
  }
});

bot.onText(/\/video_status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  if (!(await canManagePaidBeta(userId))) {
    await bot.sendMessage(chatId, "🔒 Video status доступен только admin/full_access.");
    return;
  }
  const readiness = await getVideoReadiness(chatId);
  const yesNo = (value) => value ? "yes" : "no";
  await bot.sendMessage(chatId, [
    "Video generation beta readiness",
    "",
    `video enabled: ${yesNo(readiness.enabled)}`,
    `FALAI_KEY present: ${yesNo(readiness.falKeyPresent)}`,
    `Cloudinary present: ${yesNo(readiness.cloudinaryPresent)}`,
    `Fish Audio key present: ${yesNo(readiness.fishAudioKeyPresent)}`,
    `voiceProfileId present: ${yesNo(readiness.voiceProfileIdPresent)}`,
    `voiceProfileId source: ${readiness.voiceProfileSource}`,
    `imageAvatarProfileId present: ${yesNo(readiness.imageAvatarProfileIdPresent)}`,
    `image avatar source: ${readiness.imageAvatarProfileSource}`,
    `videoAvatarProfileId present: ${yesNo(readiness.videoAvatarProfileIdPresent)}`,
    `video model/endpoint: ${readiness.modelEndpoint}`,
    `image model/endpoint: ${readiness.imageModelEndpoint}`,
    `audio URL bridge: ${readiness.audioBridge}`,
    `active expertId: ${readiness.expertId}`,
    "",
    "For /test_video required: FALAI_KEY + Cloudinary + Fish Audio key + voiceProfileId + Dinara LoRA/profile.",
    "This diagnostic command does not spend generation limits.",
  ].join("\n"));
});

bot.onText(/\/test_video(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  let status = null;
  console.log("[/test_video] command received", { chatId, userId: msg.from?.id || chatId });
  try {
    status = await bot.sendMessage(chatId, "Готовлю тестовое видео...");

    const userId = msg.from?.id || chatId;
    if (!(await canManagePaidBeta(userId))) {
      await bot.sendMessage(chatId, "🔒 Test video доступен только admin/full_access.");
      return;
    }

    const text = (match?.[1] || "").trim();
    if (!text) {
      await bot.sendMessage(chatId, [
        "Usage:",
        "/test_video Привет, это тест видео Динары",
      ].join("\n"));
      return;
    }

    const videoText = text.length > 450 ? text.slice(0, 450).trim() : text;
    const readiness = await getVideoReadiness(chatId);
    console.log("[/test_video] readiness", {
      expertId: readiness.expertId,
      falKeyPresent: readiness.falKeyPresent,
      cloudinaryPresent: readiness.cloudinaryPresent,
      fishAudioKeyPresent: readiness.fishAudioKeyPresent,
      voiceProfileSource: readiness.voiceProfileSource,
      imageSource: readiness.imageAvatarProfileSource,
      modelEndpoint: readiness.modelEndpoint,
    });

    const missingText = buildVideoReadinessMissingText(readiness);
    if (missingText) {
      await bot.sendMessage(chatId, missingText);
      return;
    }

    await bot.editMessageText("Шаг 1/4: генерирую короткий голос...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    let voiceBuffer;
    try {
      console.log("[/test_video] Fish request start");
      ({ buffer: voiceBuffer } = await generateVoice(videoText, readiness.voiceProfileId));
      console.log("[/test_video] Fish request success", { bytes: voiceBuffer.length });
    } catch (error) {
      console.log("[/test_video] Fish request fail", error);
      await bot.sendMessage(chatId, formatVideoGenerationError(error));
      return;
    }

    await bot.editMessageText("Шаг 2/4: загружаю аудио в Cloudinary...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    let audioUrl;
    try {
      console.log("[/test_video] Cloudinary upload start");
      audioUrl = await uploadAudioToCloudinary(voiceBuffer, `${readiness.expertId || "expert"}-test-video.mp3`);
      console.log("[/test_video] Cloudinary upload success", { audioUrlPresent: Boolean(audioUrl) });
    } catch (error) {
      console.log("[/test_video] Cloudinary upload fail", error);
      await bot.sendMessage(chatId, [
        "Голос сгенерирован, но видео требует публичный audio URL.",
        "Cloudinary сейчас недоступен или не настроен.",
        `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
      ].join("\n"));
      return;
    }

    await bot.editMessageText("Шаг 3/4: генерирую изображение Динары...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    let imageResult;
    try {
      console.log("[/test_video] FAL image request start", { endpoint: readiness.imageModelEndpoint });
      imageResult = await generateImage(chatId, TEST_VIDEO_SCENE_PROMPT, { loraUrl: readiness.loraUrl });
      console.log("[/test_video] FAL image request success", { imageUrlPresent: Boolean(imageResult?.imageUrl) });
    } catch (error) {
      console.log("[/test_video] FAL image request fail", error);
      await bot.sendMessage(chatId, formatVideoGenerationError(error));
      return;
    }

    await bot.editMessageText("Шаг 4/4: запускаю Aurora video generation...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    let videoResult;
    try {
      console.log("[/test_video] Aurora request start", { endpoint: readiness.modelEndpoint });
      videoResult = await generateVideoAurora(chatId, imageResult.imageUrl, audioUrl);
      console.log("[/test_video] Aurora request success", { videoUrlPresent: Boolean(videoResult?.videoUrl), cost: videoResult?.cost });
    } catch (error) {
      console.log("[/test_video] Aurora request fail", error);
      await bot.sendMessage(chatId, formatVideoGenerationError(error));
      return;
    }

    const state = userState.get(chatId) || {};
    state.lastImageUrl = imageResult.imageUrl;
    state.lastAudioUrl = audioUrl;
    state.lastVideoUrl = videoResult.videoUrl;
    state.lastExpertId = readiness.expertId;
    userState.set(chatId, state);

    try {
      console.log("[/test_video] Telegram sendVideo start");
      await bot.sendVideo(chatId, videoResult.videoUrl, {
        caption: [
          "Тестовое видео готово.",
          `expertId: ${readiness.expertId}`,
          `video endpoint: ${readiness.modelEndpoint}`,
          "Generation limits were not incremented.",
        ].join("\n"),
      });
      console.log("[/test_video] Telegram sendVideo success");
    } catch (error) {
      console.log("[/test_video] Telegram sendVideo fail", error);
      await bot.sendMessage(chatId, [
        "Видео сгенерировано, но Telegram не смог отправить mp4.",
        `URL: ${videoResult.videoUrl}`,
        `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
      ].join("\n"));
      return;
    }

    await bot.editMessageText("Готово: тестовое видео отправлено.", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
  } catch (error) {
    console.log("[/test_video] handler fail", error);
    const message = [
      "Не удалось выполнить /test_video.",
      `Короткая причина: ${String(error?.message || error || "unknown error").slice(0, 500)}`,
    ].join("\n");
    if (status?.message_id) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: status.message_id,
      }).catch(async () => {
        await bot.sendMessage(chatId, message).catch(() => {});
      });
    } else {
      await bot.sendMessage(chatId, message).catch(() => {});
    }
  }
});

bot.onText(/\/runtime_preview(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  if (!(await canUseRuntimePreview(userId))) {
    await bot.sendMessage(chatId, "🔒 Runtime preview доступен только admin/full_access.");
    return;
  }

  const topic = (match?.[1] || "").trim();
  const parts = topic.split(/\s+/).filter(Boolean);
  const requestedMode = ["dry", "sandbox"].includes(parts[0]) ? parts.shift() : "dry";
  const runtimeTopic = parts.join(" ").trim();
  if (!runtimeTopic) {
    await bot.sendMessage(chatId, [
      "🧪 Runtime preview доступен в двух admin-only режимах.",
      "",
      "Использование:",
      "/runtime_preview dry тема поста",
      "/runtime_preview sandbox тема поста",
      "",
      "Dry не генерирует текст. Sandbox выполняет локальную генерацию, валидирует и санитизирует результат.",
      "Публикации нет, Telegram production flow не меняется.",
    ].join("\n"));
    return;
  }

  const status = await bot.sendMessage(
    chatId,
    requestedMode === "sandbox"
      ? "🧪 Запускаю admin-only runtime sandbox без публикации..."
      : "🧪 Собираю runtime preview без LLM и без публикации...",
  );
  try {
    const result = await runRuntimeGenerationAdapter({
      expertId: "dinara",
      topic: runtimeTopic,
      userRequest: runtimeTopic,
      intent: "educational_post",
      platform: "telegram_longread",
      length: "medium",
      format: "post",
      tone: "expert_warm",
      audienceState: "warming",
      ctaType: "low_pressure_cta",
      llmExecutionMode: requestedMode === "sandbox" ? "sandbox_execution" : "dry_run_prompt_only",
    }, {
      persistRuntime: false,
      initializeStorage: false,
      llmExecutionMode: requestedMode === "sandbox" ? "sandbox_execution" : "dry_run_prompt_only",
    });

    const logPaths = await storeRuntimePreviewRun({ chatId, topic: runtimeTopic, result, previewMode: requestedMode });
    await bot.editMessageText("✅ Runtime preview готов. Отправляю краткий отчёт...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    await sendLongPlainText(chatId, [
      formatRuntimePreviewMessage(result, runtimeTopic, requestedMode),
      "",
      `Local log: ${logPaths.mdPath.replace(RUNTIME_DATA_ROOT, "").replace(/^[\\/]/, "")}`,
    ].join("\n"));
  } catch (err) {
    console.error("Runtime preview error:", err);
    await bot.editMessageText(`❌ Runtime preview error: ${String(err.message || err).slice(0, 700)}`, {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(async () => {
      await bot.sendMessage(chatId, `❌ Runtime preview error: ${String(err.message || err).slice(0, 700)}`);
    });
  }
});

bot.on("pre_checkout_query", async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error("Pre-checkout answer failed:", error.message);
  }
});

bot.onText(/\/(?:knowledge|kb_intake)/, async (msg) => {
  await sendKnowledgeIntakeMenu(msg.chat.id, msg.from?.id || msg.chat.id);
});

// ─── ОБРАБОТЧИК СООБЩЕНИЙ ────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    if (msg.successful_payment) {
      const runtime = await loadExpertRuntime(chatId);
      runtime.limits.text = Number(runtime.limits.text || SOFT_FREE_LIMITS.text) + 10;
      runtime.monetization.paid_plan = "stars_text10_beta";
      runtime.monetization.telegram_stars_ready = true;
      runtime.updated_at = new Date().toISOString();
      await saveExpertRuntime(chatId, runtime);
      await bot.sendMessage(chatId, "Оплата получена. Добавил 10 beta-генераций к вашему AI-эксперту.");
      await sendExpertDashboard(chatId, msg.from?.id || chatId);
      return;
    }

    if (msg.text && msg.text.startsWith('/')) return;

    if (msg.text === "\uD83D\uDE80 Старт") {
      const access = await checkDemoAccess(chatId);
      if (!access.allowed) {
        if (access.reason === "expired") { await handleExpired(chatId, access.user); }
        else { await startExpertOnboarding(chatId, msg.from?.id || chatId); }
        return;
      }
      await bot.sendMessage(chatId, "🌟 Начинаем!", { reply_markup: REMOVE_KEYBOARD });
      if (state.onboardingDisabled) {
        await sendTopicMenu(chatId);
      } else {
        await sendOnboarding(chatId, 1);
      }
      return;
    }

    if (state.expertOnboarding && await handleExpertOnboardingMessage(msg, state)) {
      return;
    }

    if (await handleKnowledgeIntakeMessage(msg)) {
      return;
    }

    if (msg.voice) {
      if (!state.awaitingVoiceRecord) return;
      const fileId = msg.voice.file_id;
      const processingMsg = await bot.sendMessage(chatId, "⏳ Загружаю голосовое...");
      const voiceBuffer = await downloadTelegramDocument(fileId, msg.voice.file_size);
      await bot.editMessageText("✅ Голосовое принято!", { chat_id: chatId, message_id: processingMsg.message_id });
      const voices = state.pendingVoices || [];
      voices.push({ voiceBuffer: voiceBuffer.toString('base64') });
      state.pendingVoices = voices;
      state.awaitingVoiceRecord = false;
      userState.set(chatId, state);
      await sendVoiceSelectionMenu(chatId);
      return;
    }

    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId);
      const imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const photoKey = `pf${Date.now()}`;
      if (!state.photos) state.photos = {};
      state.photos[photoKey] = { imageUrl, scenePrompt: null };
      state.lastImageUrl = imageUrl;
      userState.set(chatId, state);
      await bot.sendMessage(chatId, "📷 Фото получено!", {
        reply_markup: { inline_keyboard: [[
          { text: "🎬 Видео", callback_data: `mv:${photoKey}` },
          { text: "📤 Опубликовать в канал", callback_data: "pub_menu" },
        ]]},
      });
      return;
    }

    const text = msg.text;
    if (!text) return;

    if (state.awaitingFeedbackCorrection) {
      const s = userState.get(chatId) || {};
      const correction = {
        ...(s.pendingFeedbackCorrection || {}),
        timestamp: new Date().toISOString(),
        telegram_user_id: msg.from?.id || chatId,
        correction_text: text,
      };
      await appendFeedbackItem(correction);
      s.awaitingFeedbackCorrection = false;
      s.pendingFeedbackCorrection = null;
      s.pendingTopic = s.lastTopic || s.pendingTopic;
      s.pendingGenerationNote = text;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Спасибо, комментарий сохранён.", {
        reply_markup: { inline_keyboard: [[
          { text: "🔁 Исправить по комментарию", callback_data: "regen:feedback" },
          { text: "✏️ Редактировать вручную", callback_data: "txt_edit" },
        ]]},
      });
      return;
    }

    if (state.awaitingTextEdit) {
      const s = userState.get(chatId) || {};
      s.lastFullAnswer = text;
      s.awaitingTextEdit = false;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Текст обновлён!");
      await sendGeneratedText(chatId, text, s.lastScenario);
      return;
    }

    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const translatedScene = await translateScene(text);
      const customScene = `${translatedScene}, bokeh background, photorealistic`;
      const { imageUrl, cost: photoCost, scenePrompt } = await generateImage(chatId, customScene);
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);
      return;
    }

    if (state.usingPreset) {
      if (text.length > ABUSE_LIMITS.maxTopicChars) {
        await bot.sendMessage(chatId, "Тема слишком длинная для генерации. Сформулируйте её в 1-3 предложениях.");
        return;
      }
      const s = userState.get(chatId) || {};
      s.pendingTopic = text;
      s.usingPreset = false;
      userState.set(chatId, s);
      await runGeneration(chatId, s.pendingScenario, s.pendingLengthMode, s.presetStyleKey || "auto");
      return;
    }

    if (state.pendingScenario && !state.pendingTopic) {
      if (text.length > ABUSE_LIMITS.maxTopicChars) {
        await bot.sendMessage(chatId, "Тема слишком длинная. Напишите короткий запрос, а детали можно добавить через правку после первого варианта.");
        return;
      }
      const s = userState.get(chatId) || {};
      s.pendingTopic = text;
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, state.pendingScenario);
      return;
    }

    debugLog("New topic received", { chatId, length: text.length });
    if (text.length > ABUSE_LIMITS.maxTopicChars) {
      await bot.sendMessage(chatId, "Тема слишком длинная для первого шага. Напишите коротко: о чём пост и для кого.");
      return;
    }
    await sendScenarioChoice(chatId, text);

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера"); } catch(e) {}
  }
});

// ─── ОБРАБОТЧИК КНОПОК ───────────────────────────────────────────────────────

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  try {
    const state = userState.get(chatId) || {};

    if (data === "admin_tools") {
      await sendAdminTools(chatId, query.from?.id || chatId, state.adminTargetUserId || query.from?.id || chatId);
      return;
    }

    if (data === "admin_tuning") {
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      await sendAdminTuningPanel(chatId, query.from?.id || chatId, targetUserId);
      return;
    }

    if (data.startsWith("admin_tune:")) {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      const [, key, value] = data.split(":");
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      const result = await updateRuntimeSetting(targetUserId, key, value);
      if (!result.ok) {
        await bot.sendMessage(chatId, `Tuning error: ${result.error}`);
        return;
      }
      await sendAdminTuningPanel(chatId, query.from?.id || chatId, targetUserId);
      return;
    }

    if (data.startsWith("admin_rebuild:")) {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      const scope = data.replace("admin_rebuild:", "");
      await rebuildPersonaAndNotify(chatId, targetUserId, `Admin rebuild ${scope}: пересобираю persona/worldview/examples...`);
      await sendAdminTools(chatId, query.from?.id || chatId, targetUserId);
      return;
    }

    if (data === "admin_inspect_uploads") {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      await sendLongPlainText(chatId, await inspectUploadsText(targetUserId), {
        inline_keyboard: [[{ text: "← Admin tools", callback_data: "admin_tools" }]],
      });
      return;
    }

    if (data === "admin_reset_onboarding") {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      await resetOnboardingState(targetUserId);
      await bot.sendMessage(chatId, `Onboarding reset for ${targetUserId}. Materials are preserved.`);
      await sendAdminTools(chatId, query.from?.id || chatId, targetUserId);
      return;
    }

    if (data === "admin_clone_template_menu") {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      await sendAdminCloneTemplateMenu(chatId);
      return;
    }

    if (data.startsWith("admin_clone_template:")) {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      const templateKey = data.replace("admin_clone_template:", "");
      const targetUserId = state.adminTargetUserId || query.from?.id || chatId;
      const { template, scenario } = await createStarterExpertFromTemplate(targetUserId, templateKey);
      await bot.sendMessage(chatId, `Cloned template "${template.label}" to ${targetUserId}. Active scenario: ${scenario.id}`);
      await sendAdminTools(chatId, query.from?.id || chatId, targetUserId);
      return;
    }

    if (data === "admin_target_dashboard") {
      if (!isAdminUser(query.from?.id || chatId)) {
        await bot.sendMessage(chatId, "🔒 Admin shortcut.");
        return;
      }
      await sendExpertDashboard(chatId, state.adminTargetUserId || query.from?.id || chatId);
      return;
    }

    if (data.startsWith("ki_kb:")) {
      const userId = query.from?.id || chatId;
      if (!(await canUseKnowledgeIntake(userId))) {
        await bot.sendMessage(chatId, "🔒 Режим пополнения базы знаний доступен только для admin/full_access.");
        return;
      }
      const targetKb = data.replace("ki_kb:", "");
      const session = await createIntakeSession(userId, targetKb);
      await bot.sendMessage(
        chatId,
        `📚 Сессия создана: ${session.session_id}\nБаза знаний: ${getTargetLabel(targetKb)}\n\nОтправляйте document/file, ссылку или текстовую заметку.`,
        KNOWLEDGE_INTAKE_ACTIONS
      );
      return;
    }

    if (data === "ki_more") {
      await bot.sendMessage(chatId, "➕ Отправьте следующий document/file, ссылку или текстовую заметку.", KNOWLEDGE_INTAKE_ACTIONS);
      return;
    }

    if (data === "ki_done") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session || session.status !== "collecting") {
        await bot.sendMessage(chatId, "Активная сессия загрузки не найдена.");
        return;
      }
      const updated = await setSessionStatus(session.session_id, "awaiting_confirmation");
      await sendIntakeSummary(chatId, updated);
      return;
    }

    if (data === "ki_approve") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session || session.status !== "awaiting_confirmation") {
        await bot.sendMessage(chatId, "Сессия, ожидающая подтверждения, не найдена.");
        return;
      }
      await setSessionStatus(session.session_id, "approved_for_processing");
      await bot.sendMessage(
        chatId,
        "Материалы приняты и поставлены в очередь обработки. Следующий этап — анализ качества и подготовка к ingestion."
      );
      return;
    }

    if (data === "ki_reject" || data === "ki_cancel") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session) {
        await bot.sendMessage(chatId, "Активная сессия загрузки не найдена.");
        return;
      }
      await setSessionStatus(session.session_id, "cancelled");
      await bot.sendMessage(chatId, "❌ Сессия пополнения базы знаний отменена. Файлы не удалены.");
      return;
    }

    if (data.startsWith("req_limit_")) {
      const limitType = data.replace("req_limit_", "");
      const user = await getDemoUserByTgId(chatId);
      if (user) {
        const labelMap = { text: "📝 Тексты", photo: "🖼 Фото", video: "🎬 Видео", demo: "⚡ Демо" };
        await notifyLeadsBot(
          `📩 *Запрос на увеличение лимита*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n📊 Хочет больше: *${labelMap[limitType] || limitType}*`,
          { inline_keyboard: [[{ text: "💬 Написать пользователю", url: `tg://user?id=${user.tg_id}` }]] }
        );
      } else {
        await notifyLeadsBot(
          `📩 *Запрос premium/beta лимита*\n\nTelegram user: ${chatId}\nТип: ${limitType}`,
          { inline_keyboard: [[{ text: "💬 Написать пользователю", url: `tg://user?id=${chatId}` }]] }
        );
      }
      await bot.sendMessage(chatId, "✅ Запрос отправлен администратору. Он свяжется с вами в ближайшее время.");
      return;
    }

    if (data === "manual_upgrade") {
      await bot.sendMessage(chatId, buildManualUpgradeText(), {
        reply_markup: { inline_keyboard: [
          [{ text: `Оплатить ${BETA_PACK_STARS_PRICE} Stars`, callback_data: "stars_pack:text10" }],
          [{ text: "Запросить beta_paid вручную", callback_data: "req_limit_text" }],
          [{ text: "Планы", callback_data: "show_plans" }],
        ]},
      });
      return;
    }

    if (data === "show_plans") {
      await bot.sendMessage(chatId, buildPaidBetaPlansText(), {
        reply_markup: { inline_keyboard: [
          [{ text: `Оплатить ${BETA_PACK_STARS_PRICE} Stars`, callback_data: "stars_pack:text10" }],
          [{ text: "Запросить beta_paid вручную", callback_data: "req_limit_text" }],
        ]},
      });
      return;
    }

    if (data.startsWith("stars_pack:")) {
      await sendStarsUpgradePlaceholder(chatId, "text", data.replace("stars_pack:", ""));
      return;
    }

    if (data === "req_extend") {
      const user = await getDemoUserByTgId(chatId);
      if (user) {
        await notifyLeadsBot(
          `📩 *Запрос на продление демо*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n📊 Текст: ${user.limits.text.used}/${user.limits.text.max} | Фото: ${user.limits.photo.used}/${user.limits.photo.max} | Видео: ${user.limits.video.used}/${user.limits.video.max}`,
          { inline_keyboard: [[
            { text: "💬 Написать", url: `tg://user?id=${user.tg_id}` },
            { text: "➕ Продлить на 3 дня", callback_data: `extend_${user.phone}` },
          ]] }
        );
      }
      await bot.sendMessage(chatId, "✅ Запрос на продление отправлен. Администратор свяжется с вами.");
      return;
    }

    if (data === "onboard_1") { await sendOnboarding(chatId, 1); return; }
    if (data === "onboard_2") { await sendOnboarding(chatId, 2); return; }
    if (data === "onboard_3") { await sendTopicMenu(chatId); return; }
    if (data === "skip_onboard") { await sendTopicMenu(chatId); return; }
    if (data === "dis_onboard") {
      const s = userState.get(chatId) || {};
      s.onboardingDisabled = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Обучение отключено.");
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "ob_start") {
      await startExpertOnboarding(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_custom_name") {
      const s = userState.get(chatId) || {};
      s.expertOnboarding = {
        userId: query.from?.id || chatId,
        mode: "create_expert",
        step: "name",
        data: {},
      };
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Напишите имя эксперта или бренда:");
      return;
    }

    if (data === "ob_template_menu") {
      await sendStarterTemplateMenu(chatId, "onboarding");
      return;
    }

    if (data === "demo_start") {
      await sendStarterTemplateMenu(chatId, "demo");
      return;
    }

    if (data === "demo_invite_copy") {
      await sendBetaInviteCopy(chatId);
      return;
    }

    if (data === "create_expert_cta") {
      await sendCreateExpertCta(chatId);
      return;
    }

    if (data.startsWith("demo_template:")) {
      await startDemoMode(chatId, data.replace("demo_template:", ""));
      return;
    }

    if (data.startsWith("ob_template:")) {
      const templateKey = data.replace("ob_template:", "");
      const s = userState.get(chatId) || {};
      const convertedFromDemo = Boolean(s.demoMode);
      const userId = query.from?.id || chatId;
      const { scenario, template } = await createStarterExpertFromTemplate(userId, templateKey);
      s.expertOnboarding = null;
      s.demoMode = false;
      s.demoTemplateKey = null;
      s.pendingScenario = scenario.id;
      s.pendingTopic = templateKey === "sexologist"
        ? "как перестать стыдиться своего желания"
        : templateKey === "coach"
          ? "почему я много планирую и не начинаю"
          : templateKey === "blogger"
            ? "как перестать звучать как все"
            : templateKey === "fitness"
              ? "почему я начинаю тренироваться и бросаю через неделю"
              : templateKey === "marketing"
                ? "почему контент не приводит клиентов"
            : "почему я всё понимаю, но не могу перестать тревожиться";
      s.pendingLengthMode = "normal";
      s.pendingContentPreset = "emotional";
      userState.set(chatId, s);
      if (convertedFromDemo) {
        await trackBetaEvent(userId, BETA_EVENT_NAMES.DEMO_CONVERTED, { template: templateKey, scenario: scenario.id });
      }
      await bot.sendMessage(chatId,
        `Шаблон "${template.label}" создан.\n\nСейчас покажу первый пост сразу. Если он уже близко попадает в голос, материалы сделают его ещё точнее.`
      );
      await runGeneration(chatId, scenario.id, "normal", "auto");
      return;
    }

    if (data === "ob_dashboard") {
      await sendExpertDashboard(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_guide") {
      await sendBetaOnboardingGuide(chatId);
      return;
    }

    if (data === "ob_add_scenario") {
      await startAddScenario(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_list_scenarios") {
      await sendScenarioList(chatId, query.from?.id || chatId, "list");
      return;
    }

    if (data === "ob_select_scenario") {
      await sendScenarioList(chatId, query.from?.id || chatId, "select");
      return;
    }

    if (data.startsWith("ob_set_active:")) {
      const idx = parseInt(data.replace("ob_set_active:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте dashboard заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId);
      const scenario = await loadUserScenario(query.from?.id || chatId, scenarioId);
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Активный сценарий: ${scenario?.label || scenarioId}`);
      await sendTopicsForScenario(chatId, scenarioId);
      return;
    }

    if (data === "ob_regen_persona") {
      await rebuildPersonaAndNotify(chatId, query.from?.id || chatId);
      await sendExpertDashboard(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_share_identity") {
      await sendShareableExpertIdentity(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_test_generation") {
      const inventory = await getOnboardingInventory(query.from?.id || chatId);
      const scenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id;
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сначала добавьте сценарий, и сразу сделаем тестовый пост.");
        await startAddScenario(chatId, query.from?.id || chatId);
        return;
      }
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = "почему клиенту важно почувствовать, что эксперт его понимает";
      s.pendingLengthMode = "normal";
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Сейчас покажу тестовый пост на активном сценарии. Это быстрый WOW-пруф после онбординга.");
      await runGeneration(chatId, scenarioId, "normal", "auto");
      return;
    }

    if (data.startsWith("ob_upload_more:")) {
      const category = data.replace("ob_upload_more:", "");
      const s = userState.get(chatId) || {};
      s.expertOnboarding = {
        userId: query.from?.id || chatId,
        mode: "upload_more",
        step: category,
        data: {},
      };
      userState.set(chatId, s);
      await sendOnboardingUploadStep(chatId, category);
      return;
    }

    if (data.startsWith("ob_help_upload:")) {
      const category = data.replace("ob_help_upload:", "");
      await sendUploadRecoveryGuide(chatId, category);
      return;
    }

    if (data.startsWith("ob_role:")) {
      const roleKey = data.replace("ob_role:", "");
      const s = userState.get(chatId) || {};
      const onboarding = s.expertOnboarding || {
        userId: query.from?.id || chatId,
        mode: "create_expert",
        data: {},
      };
      onboarding.data = onboarding.data || {};
      onboarding.data.roleKey = roleKey;
      s.expertOnboarding = onboarding;
      userState.set(chatId, s);

      if (onboarding.mode === "add_scenario") {
        const profile = await loadUserProfile(onboarding.userId);
        const scenario = await createUserScenario(onboarding.userId, roleKey, {
          expertName: profile?.expert_name || "Эксперт",
          title: ONBOARDING_ROLES[roleKey]?.label || roleKey,
        });
        if (profile) await setActiveUserScenario(onboarding.userId, scenario.id);
        s.expertOnboarding = null;
        userState.set(chatId, s);
        await trackBetaEvent(onboarding.userId, BETA_EVENT_NAMES.SCENARIO_CREATED, { scenario: scenario.id, source: "add_scenario", role: roleKey });
        await bot.sendMessage(chatId, `✅ Сценарий добавлен и выбран активным: ${scenario.label}`);
        await sendExpertDashboard(chatId, onboarding.userId);
        return;
      }

      await sendOnboardingUploadStep(chatId, "knowledge");
      return;
    }

    if (data.startsWith("ob_done:")) {
      const category = data.replace("ob_done:", "");
      const s = userState.get(chatId) || {};
      if (s.expertOnboarding?.mode === "upload_more") {
        const userId = s.expertOnboarding.userId || query.from?.id || chatId;
        s.expertOnboarding = null;
        userState.set(chatId, s);
        await bot.sendMessage(chatId, "✅ Upload finished\nprocessed: сохранено\nqueued: готово к использованию в эксперте");
        if (["knowledge", "style"].includes(category)) {
          await rebuildPersonaAndNotify(chatId, userId, "Обновляю persona после новых материалов...");
        }
        await sendExpertDashboard(chatId, userId);
        return;
      }
      if (["knowledge", "style"].includes(category)) {
        const inventory = await getOnboardingInventory(query.from?.id || chatId);
        if ((inventory.counts?.[category] || 0) === 0) {
          await bot.sendMessage(
            chatId,
            category === "knowledge"
              ? "Можно продолжить без материалов, но первый пост будет шаблонным. Чтобы получить сильный WOW-эффект, позже добавьте хотя бы одну экспертную заметку или несколько постов."
              : "Можно продолжить без примеров стиля, но голос будет менее похож на автора. Позже добавьте 3-5 реальных постов, и я пересоберу persona.",
            onboardingControls(category)
          );
        }
      }
      if (category === "knowledge") { await sendOnboardingUploadStep(chatId, "style"); return; }
      if (category === "style") { await sendOnboardingUploadStep(chatId, "avatar"); return; }
      if (category === "avatar") { await sendOnboardingUploadStep(chatId, "voice"); return; }
      if (category === "voice") { await finishExpertOnboarding(chatId, query.from?.id || chatId); return; }
      return;
    }

    if (data === "ob_cancel") {
      const s = userState.get(chatId) || {};
      s.expertOnboarding = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Онбординг остановлен. Загруженные файлы остались в папке пользователя.");
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "show_help") { await sendHelp(chatId); return; }
    if (data === "back_to_topics") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = null;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "prompt_topic") {
      const s = userState.get(chatId) || {};
      if (s.pendingScenario) {
        await bot.sendMessage(chatId, "📝 Напишите тему:\n\nНапример: _тревога_, _выгорание_, _одиночество_", { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(chatId, "📝 Сначала выберите сценарий:", {
          reply_markup: { inline_keyboard: [[
            { text: "🧠 Психолог", callback_data: "sc_psych" },
            { text: "💜 Сексолог", callback_data: "sc_sex" },
          ]]},
        });
      }
      return;
    }

    if (data.startsWith("prompt_topic_sc:")) {
      const scenario = data.replace("prompt_topic_sc:", "");
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenario;
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "📝 Напишите тему:\n\nНапример: _тревога_, _выгорание_, _одиночество_", { parse_mode: "Markdown" });
      return;
    }

    if (data.startsWith("qp:")) {
      const idx = parseInt(data.replace("qp:", ""));
      const topic = QUICK_TOPICS_PSYCH[idx];
      if (!topic) return;
      const s = userState.get(chatId) || {};
      s.pendingTopic = topic;
      s.pendingScenario = "psychologist";
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, "psychologist");
      return;
    }

    if (data.startsWith("qs:")) {
      const idx = parseInt(data.replace("qs:", ""));
      const topic = QUICK_TOPICS_SEX[idx];
      if (!topic) return;
      const s = userState.get(chatId) || {};
      s.pendingTopic = topic;
      s.pendingScenario = "sexologist";
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, "sexologist");
      return;
    }

    if (data === "show_presets") { await sendPresetsMenu(chatId); return; }

    if (data === "save_preset") {
      const s = userState.get(chatId) || {};
      if (!s.lastScenario) { await bot.sendMessage(chatId, "Нет данных для сохранения."); return; }
      const styleLabel = SEXOLOGIST_STYLE_META[s.lastStyleKey]?.label || "✨ Авто";
      const scLabel = await getScenarioLabel(chatId, s.lastScenario);
      const lenLabel = { short: "✂️ Короткий", normal: "📄 Обычный", long: "📖 Длинный" }[s.lastLengthMode] || "📄";
      savePreset(chatId, {
        scenario: s.lastScenario,
        lengthMode: s.lastLengthMode || "normal",
        styleKey: s.lastStyleKey || "auto",
        label: `${scLabel} · ${lenLabel} · ${styleLabel}`,
      });
      await bot.sendMessage(chatId, `⭐ Пресет сохранён!\n\n${scLabel} · ${lenLabel} · ${styleLabel}`);
      return;
    }

    if (data.startsWith("use_preset:")) {
      const idx = parseInt(data.replace("use_preset:", ""));
      const presets = getPresets(chatId);
      const preset = presets[idx];
      if (!preset) return;
      const s = userState.get(chatId) || {};
      s.pendingScenario = preset.scenario;
      s.pendingLengthMode = preset.lengthMode;
      s.usingPreset = true;
      s.presetStyleKey = preset.styleKey;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `⚡ Пресет: ${preset.label}\n\nНапишите тему поста:`);
      return;
    }

    if (data.startsWith("usc:")) {
      const idx = parseInt(data.replace("usc:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте меню заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId).catch(() => null);
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, scenarioId);
      return;
    }

    if (data.startsWith("usc_t:")) {
      const idx = parseInt(data.replace("usc_t:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте меню заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId).catch(() => null);
      await sendContentPresetChoice(chatId, scenarioId);
      return;
    }

    if (data === "sc_psych") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = "psychologist";
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, "psychologist");
      return;
    }
    if (data === "sc_sex") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = "sexologist";
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, "sexologist");
      return;
    }

    if (data === "sc_psych_t") { await sendContentPresetChoice(chatId, "psychologist"); return; }
    if (data === "sc_sex_t") { await sendContentPresetChoice(chatId, "sexologist"); return; }

    if (data.startsWith("cp:")) {
      const presetId = data.replace("cp:", "");
      if (presetId === "manual") {
        await sendLengthChoice(chatId, state.pendingScenario || "psychologist");
        return;
      }
      const preset = getContentPreset(presetId);
      if (!preset) return;
      const s = userState.get(chatId) || {};
      const scenario = s.pendingScenario || state.pendingScenario || "psychologist";
      s.pendingContentPreset = preset.id;
      s.pendingLengthMode = preset.lengthMode;
      userState.set(chatId, s);
      if (scenario === "sexologist") {
        await sendStyleChoice(chatId);
      } else {
        await runGeneration(chatId, scenario, preset.lengthMode, "auto");
      }
      return;
    }

    if (data === "len_short" || data === "len_normal" || data === "len_long") {
      const lengthMode = data.replace("len_", "");
      const s = userState.get(chatId) || {};
      s.pendingLengthMode = lengthMode;
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      const scenario = state.pendingScenario || "psychologist";
      if (scenario === "sexologist") {
        await sendStyleChoice(chatId);
      } else {
        await runGeneration(chatId, scenario, lengthMode, "auto");
      }
      return;
    }

    if (data.startsWith("sty_")) {
      await runGeneration(chatId, state.pendingScenario || "sexologist", state.pendingLengthMode || "normal", normalizeSexologistStyleKey(data.replace("sty_", "")));
      return;
    }

    if (data.startsWith("feedback:")) {
      const [, feedbackType, answerId] = data.split(":");
      const payload = buildFeedbackPayload(query, answerId, feedbackType);
      await appendFeedbackItem(payload);
      if (feedbackType === "edit") {
        const s = userState.get(chatId) || {};
        s.awaitingFeedbackCorrection = true;
        s.pendingFeedbackCorrection = {
          ...payload,
          feedback_type: "edit_comment",
        };
        userState.set(chatId, s);
        await bot.sendMessage(chatId, "Напишите, что именно нужно поправить в этом ответе.");
      } else {
        const regenerationRows = {
          not_voice: [[
            { text: "💬 Личнее", callback_data: "regen:voice" },
            { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
          ]],
          weak_expertise: [[{ text: "🧠 Экспертнее", callback_data: "regen:expert" }]],
          bad: directedRegenerationKeyboard().slice(0, 2),
        };
        const rows = regenerationRows[feedbackType];
        const feedbackReply = feedbackType === "like"
          ? "✅ Зафиксировал: этот вариант похож на вас. Можно усилить его в любую сторону или сразу идти дальше."
          : "✅ Обратная связь сохранена.";
        await bot.sendMessage(chatId, feedbackReply, rows ? {
          reply_markup: { inline_keyboard: rows },
        } : undefined);
      }
      return;
    }

    if (data === "share_friend") {
      await bot.sendMessage(chatId, [
        "Можно переслать другу так:",
        "",
        "Я собрал(а) AI-эксперта, который пишет в моём стиле. Посмотри на этот пост — интересно, похоже ли на меня?",
        "",
        "Если хочешь, покажу, как он собирается из материалов, worldview и примеров голоса.",
      ].join("\n"));
      return;
    }

    if (data === "txt_edit") {
      const s = userState.get(chatId) || {};
      s.awaitingTextEdit = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, (state.lastFullAnswer || "").replace(/[*_]/g, ''), {
        reply_markup: { force_reply: true, input_field_placeholder: "Отредактируйте и отправьте..." },
      });
      return;
    }

    if (data === "txt_ready") { await sendAudioChoiceButtons(chatId); return; }

    if (data === "new_topic") {
      const s = userState.get(chatId) || {};
      userState.set(chatId, { onboardingDisabled: s.onboardingDisabled, presets: s.presets });
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "retry_generation") {
      const s = userState.get(chatId) || {};
      if (!s.pendingTopic && !s.lastTopic) {
        await bot.sendMessage(chatId, "Тема не найдена. Напишите тему заново.");
        return;
      }
      s.lastGenerationAt = 0;
      userState.set(chatId, s);
      await runGeneration(chatId, s.pendingScenario || s.lastScenario || "psychologist", s.pendingLengthMode || s.lastLengthMode || "normal", s.lastStyleKey || "auto");
      return;
    }

    if (data === "regen_txt") {
      if (!state.lastTopic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
      const s = userState.get(chatId) || {};
      s.pendingTopic = state.lastTopic;
      userState.set(chatId, s);
      await runGeneration(chatId, state.lastScenario || "psychologist", state.lastLengthMode || "normal", state.lastStyleKey || "auto", "telegram");
      return;
    }

    if (data.startsWith("regen:")) {
      if (!state.lastTopic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
      const variant = data.replace("regen:", "");
      const s = userState.get(chatId) || {};
      s.pendingTopic = state.lastTopic;
      userState.set(chatId, s);
      await runGeneration(chatId, state.lastScenario || "psychologist", state.lastLengthMode || "normal", state.lastStyleKey || "auto", variant);
      return;
    }

    if (data === "pub_menu") { await sendPublishMenu(chatId); return; }
    if (data.startsWith("pub:")) { await showFinalPost(chatId, data.replace("pub:", "")); return; }

    if (data.startsWith("rp:")) {
      if (!(await guardMediaAction(chatId, "фото"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "photo", "фото"))) return;
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const scenePrompt = state.photos?.[data.replace("rp:", "")]?.scenePrompt || state.lastScenePrompt;
      if (!scenePrompt) { await bot.sendMessage(chatId, "Не могу воспроизвести сцену."); return; }
      const { imageUrl, cost: photoCost, scenePrompt: newScene } = await generateImage(chatId, scenePrompt);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "image", "fal_image_generation", photoCost, { scenario: state.lastScenario }).catch(() => {});
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, newScene);
      return;
    }

    if (data.startsWith("cv:")) {
      const videoUrl = state.videos?.[data.replace("cv:", "")];
      if (!videoUrl) { await bot.sendMessage(chatId, "Видео не найдено."); return; }
      const s = userState.get(chatId) || {};
      s.lastVideoUrl = videoUrl;
      userState.set(chatId, s);
      const cleanText = (s.lastFullAnswer || "").replace(/[*_]/g, '').substring(0, 1024);
      await bot.sendVideo(chatId, videoUrl, { caption: cleanText });
      await bot.sendMessage(chatId, "✅ Видео выбрано! Публиковать в канал?", {
        reply_markup: { inline_keyboard: [[
          { text: "🎬 Текст+Видео → канал", callback_data: "pub:text_video" },
          { text: "🖼 Текст+Фото → канал", callback_data: "pub:text_photo" },
        ]]},
      });
      return;
    }

    if (data === "vid_again") {
      if (!(await guardMediaAction(chatId, "видео"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "video", "видео"))) return;
      if (!state.lastImageUrl || !state.lastAudioUrl) { await bot.sendMessage(chatId, "Нет фото или аудио."); return; }
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, state.lastImageUrl, state.lastAudioUrl);
      await incrementExpertRuntime(chatId, "generate_video", { counter: "video", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "video", "fal_video_generation", videoCost, { scenario: state.lastScenario }).catch(() => {});
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
      return;
    }

    if (data === "audio_gen") {
      if (!(await guardConfiguredVoiceGeneration(chatId))) return;
      await sendAudioLengthChoice(chatId);
      return;
    }

    if (data === "audlen_short" || data === "audlen_long") {
      if (!(await guardMediaAction(chatId, "аудио"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "audio", "аудио"))) return;
      const voiceReadiness = await guardConfiguredVoiceGeneration(chatId);
      if (!voiceReadiness) return;
      const audioLength = data === "audlen_long" ? "long" : "short";
      const fullAnswer = state.lastFullAnswer;
      if (!fullAnswer) { await bot.sendMessage(chatId, "Нет текста для аудио."); return; }
      const genMsg = await bot.sendMessage(chatId, "⏳ Генерирую голос...");
      const audioText = await generateAudioText(fullAnswer, audioLength);
      debugLog(`Audio text prepared (${audioLength}): ${audioText.length} chars`);
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(audioText, voiceReadiness.voiceProfileId);
      await incrementExpertRuntime(chatId, "generate_audio", { counter: "audio", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "audio", "fish_audio_tts", audioCost, { scenario: state.lastScenario, chars: audioText.length }).catch(() => {});
      await bot.editMessageText("✅ Голос готов! Выберите музыку:", { chat_id: chatId, message_id: genMsg.message_id });
      const s = userState.get(chatId) || {};
      s.pendingVoiceBuffer = audioBuffer.toString('base64');
      s.pendingAudioCost = audioCost;
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      s.previewTracks = tracks;
      userState.set(chatId, s);
      await sendTrackPreview(chatId, tracks, 0);
      return;
    }

    if (data.startsWith("mn:")) {
      const nextIndex = parseInt(data.replace("mn:", ""));
      const tracks = state.previewTracks;
      if (!tracks || nextIndex >= tracks.length) { await bot.sendMessage(chatId, "Треки закончились."); return; }
      await sendTrackPreview(chatId, tracks, nextIndex);
      return;
    }

    if (data.startsWith("mc:")) { await processAudioWithTrack(chatId, data.replace("mc:", "")); return; }

    if (data === "music_skip") {
      const voiceB64 = state.pendingVoiceBuffer;
      if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса."); return; }
      const voiceBuffer = Buffer.from(voiceB64, 'base64');
      await bot.sendVoice(chatId, voiceBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });
      const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(voiceBuffer);
        await recordRuntimeCost(chatId, "upload", "cloudinary_upload", COST_ESTIMATES_USD.cloudinary_upload).catch(() => {});
        await bot.editMessageText("✅ Аудио готово!", { chat_id: chatId, message_id: uploadMsg.message_id });
      } catch(err) {
        await bot.editMessageText("Аудио готово, но загрузка для видео сейчас недоступна.", { chat_id: chatId, message_id: uploadMsg.message_id });
      }
      const s = userState.get(chatId) || {};
      s.lastAudioUrl = audioUrl;
      s.pendingVoiceBuffer = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Аудио готово\n💰 $${(state.pendingAudioCost || 0).toFixed(4)}`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data === "audio_rec") {
      const s = userState.get(chatId) || {};
      s.awaitingVoiceRecord = true;
      s.pendingVoices = [];
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "🎙 Запишите голосовое.");
      return;
    }

    if (data === "voice_more") {
      const s = userState.get(chatId) || {};
      s.awaitingVoiceRecord = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "🎙 Запишите ещё одно:");
      return;
    }

    if (data.startsWith("vc:")) {
      const index = parseInt(data.replace("vc:", ""));
      const voices = state.pendingVoices || [];
      const chosen = voices[index];
      if (!chosen) { await bot.sendMessage(chatId, "Голосовое не найдено."); return; }
      const s = userState.get(chatId) || {};
      s.pendingVoiceBuffer = chosen.voiceBuffer;
      s.pendingAudioCost = 0;
      s.awaitingVoiceRecord = false;
      s.pendingVoices = [];
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      s.previewTracks = tracks;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Голосовое ${index + 1} выбрано!`);
      await sendTrackPreview(chatId, tracks, 0);
      return;
    }

    if (data.startsWith("mv:")) {
      if (!(await guardMediaAction(chatId, "видео"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "video", "видео"))) return;
      const videoCheck = await checkLimit(chatId, "video");
      if (!videoCheck.ok) {
        if (videoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (videoCheck.reason === "expired") { await handleExpired(chatId, videoCheck.user); return; }
        await handleLimitExhausted(chatId, "video", videoCheck.user); return;
      }
      const photoKey = data.replace("mv:", "");
      const imageUrl = state.photos?.[photoKey]?.imageUrl || null;
      if (!imageUrl) { await bot.sendMessage(chatId, "Фото не найдено."); return; }
      if (!state.lastAudioUrl) { await bot.sendMessage(chatId, "Нет аудио."); return; }
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, imageUrl, state.lastAudioUrl);
      await incrementLimit(chatId, "video", state.lastScenario, null);
      await incrementExpertRuntime(chatId, "generate_video", { counter: "video", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "video", "fal_video_generation", videoCost, { scenario: state.lastScenario }).catch(() => {});
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
      return;
    }

    if (data === "photo_topic") {
      if (!(await guardMediaAction(chatId, "фото"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "photo", "фото"))) return;
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const scenePrompt = await buildTopicScenePrompt(state.lastTopic || "психология");
      const { imageUrl, cost: photoCost } = await generateImage(chatId, scenePrompt);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "image", "fal_image_generation", photoCost, { scenario: state.lastScenario }).catch(() => {});
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);
    } else if (data === "photo_office") {
      if (!(await guardMediaAction(chatId, "фото"))) return;
      if (!(await guardRuntimeQuotaForAction(chatId, "photo", "фото"))) return;
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const officeScene = `sitting in cozy therapist office, bookshelf background, soft warm lamp light, wooden furniture, indoor plants, bokeh background`;
      const { imageUrl, cost: photoCost } = await generateImage(chatId, officeScene);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
      await recordRuntimeCost(chatId, "image", "fal_image_generation", photoCost, { scenario: state.lastScenario }).catch(() => {});
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, officeScene);
    } else if (data === "photo_custom") {
      userState.set(chatId, { ...state, awaitingCustomScene: true });
      await bot.sendMessage(chatId, "✏️ Опишите сцену на русском:");
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации"); } catch(e) {}
  }
});

// ─── ГЕНЕРАЦИЯ ────────────────────────────────────────────────────────────────

async function runGeneration(chatId, scenario, lengthMode, styleKey, variant = "default") {
  const state = userState.get(chatId) || {};
  const cooldown = checkCooldown(state, "lastGenerationAt", ABUSE_LIMITS.generationCooldownMs);
  if (!cooldown.ok) {
    await bot.sendMessage(chatId, `Генерация уже запущена недавно. Подождите ${cooldown.remainingSec} сек., чтобы не потерять результат.`);
    return;
  }
  state.lastGenerationAt = nowMs();
  userState.set(chatId, state);

  const runtimeQuotaCheck = await checkRuntimeGenerationQuota(chatId, state, "text");
  if (!runtimeQuotaCheck.ok) {
    if (String(runtimeQuotaCheck.reason || "").startsWith("entitlement_")) {
      await handlePaidBetaAccessDenied(chatId, runtimeQuotaCheck.entitlement, runtimeQuotaCheck.reason);
      return;
    }
    await handleRuntimeLimitExhausted(chatId, runtimeQuotaCheck.limitType || "text", runtimeQuotaCheck.runtime, { demoMode: state.demoMode });
    return;
  }

  if (!state.demoMode) {
    const textCheck = await checkLimit(chatId, "text");
    if (!textCheck.ok) {
      if (textCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
      if (textCheck.reason === "expired") { await handleExpired(chatId, textCheck.user); return; }
      await handleLimitExhausted(chatId, "text", textCheck.user); return;
    }
  }

  const topic = state.pendingTopic || state.lastTopic;
  if (!topic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
  const runtimeBeforeGeneration = await loadExpertRuntime(chatId);
  const firstGenerationBoost = (runtimeBeforeGeneration.counters?.text || 0) === 0 && variant === "default";
  if (firstGenerationBoost) {
    const boostedState = userState.get(chatId) || {};
    boostedState.firstGenerationBoost = true;
    userState.set(chatId, boostedState);
  }

  const labelMap = { short: "короткий", normal: "обычный", long: "длинный" };
  const scenarioLabel = state.demoMode && state.demoTemplateKey
    ? `⚡ Demo: ${STARTER_EXPERT_TEMPLATES[state.demoTemplateKey]?.label || "AI-эксперт"}`
    : await getScenarioLabel(chatId, scenario);
  const styleLabel = scenario === "sexologist" && styleKey !== "auto"
    ? ` · ${SEXOLOGIST_STYLE_META[styleKey]?.label || ""}` : "";
  const genMsg = await bot.sendMessage(chatId,
    `⏳ Генерирую ${labelMap[lengthMode]} пост [${scenarioLabel}${styleLabel}]\nТема: "${topic}"...`
  );

  try {
    const feedbackNote = variant === "feedback" ? state.pendingGenerationNote || "" : "";
    const generation = await generatePostTextResult(topic, scenario, lengthMode, styleKey, variant, feedbackNote, chatId);
    const fullAnswer = generation.text;
    const ownership = generation.ownership || await resolveGenerationOwnership(chatId, scenario, generation.styleKey || styleKey);
    await bot.deleteMessage(chatId, genMsg.message_id).catch(() => {});

    const entitlementAfterGeneration = await incrementEntitlementUsage(chatId);
    await incrementLimit(chatId, "text", scenario, lengthMode);
    const runtimeAfterGeneration = await incrementExpertRuntime(chatId, "generate_text", {
      counter: "text",
      scenario,
      expertId: ownership.expertId,
      knowledgeBase: ownership.knowledgeBase,
      styleProfile: ownership.styleProfile,
      lengthMode,
      demoMode: state.demoMode || variant === "demo",
      premium: runtimeQuotaCheck.premium,
    });
    if ((runtimeBeforeGeneration.counters?.text || 0) === 0) {
      await trackBetaEvent(chatId, BETA_EVENT_NAMES.FIRST_GENERATION, {
        scenario,
        expert_id: ownership.expertId,
        knowledge_base: ownership.knowledgeBase,
        style_profile: ownership.styleProfile,
        lengthMode,
        demo_mode: state.demoMode || variant === "demo",
      });
    }
    await trackBetaEvent(chatId, BETA_EVENT_NAMES.GENERATION_COMPLETED, {
      scenario,
      expert_id: ownership.expertId,
      knowledge_base: ownership.knowledgeBase,
      style_profile: ownership.styleProfile,
      lengthMode,
      variant,
      demo_mode: state.demoMode || variant === "demo",
    });
    await recordRuntimeCost(chatId, "text", "openai_text_generation", estimateTextCost(lengthMode), {
      scenario,
      expertId: ownership.expertId,
      knowledgeBase: ownership.knowledgeBase,
      styleProfile: ownership.styleProfile,
      lengthMode,
      variant,
    }).catch((error) => console.warn("Cost record failed:", error.message));
    if (!["default", "demo"].includes(variant)) {
      await trackBetaEvent(chatId, BETA_EVENT_NAMES.REGENERATION_USED, {
        scenario,
        expert_id: ownership.expertId,
        knowledge_base: ownership.knowledgeBase,
        style_profile: ownership.styleProfile,
        lengthMode,
        variant,
      });
    }

    const s = userState.get(chatId) || {};
    s.lastFullAnswer = fullAnswer;
    s.lastTopic = topic;
    s.lastScenario = scenario;
    s.lastLengthMode = lengthMode;
    s.lastStyleKey = generation.styleKey || styleKey;
    s.lastExpertId = ownership.expertId;
    s.lastKnowledgeBase = ownership.knowledgeBase;
    s.lastStyleProfile = ownership.styleProfile;
    s.lastGenerationOwnership = ownership;
    s.lastContentPreset = s.pendingContentPreset || null;
    s.lastAnswerId = createAnswerId();
    s.lastRetrievalMeta = generation.retrieval;
    s.lastAuthorVoiceMeta = generation.authorVoice;
    s.lastQualityPass = generation.qualityPass;
    s.lastGenerationVariant = generation.variant || variant;
    s.firstGenerationBoostApplied = Boolean(generation.firstGenerationBoost);
    s.firstGenerationBoost = false;
    s.lastAudioUrl = null;
    s.lastVideoUrl = null;
    s.pendingVoices = [];
    s.awaitingVoiceRecord = false;
    s.pendingVoiceBuffer = null;
    s.suggestedTracks = null;
    if (variant === "feedback") s.pendingGenerationNote = null;
    s.awaitingTextEdit = false;
    userState.set(chatId, s);

    selectMusicTracks(fullAnswer).then(tracks => {
      const cur = userState.get(chatId) || {};
      cur.suggestedTracks = tracks;
      userState.set(chatId, cur);
    }).catch(() => {});

    await sendGeneratedText(chatId, fullAnswer, scenario);
    const entitlementRemaining = Math.max(0, Number(entitlementAfterGeneration.generationLimit || 0) - Number(entitlementAfterGeneration.generationUsed || 0));
    const remaining = ["admin", "beta_paid"].includes(entitlementAfterGeneration.plan)
      ? entitlementRemaining
      : runtimeRemaining(runtimeAfterGeneration, "text");
    if (remaining !== null && (remaining <= 3 || state.demoMode || variant === "demo")) {
      await bot.sendMessage(
        chatId,
        [
          `Осталось текстовых генераций: ${remaining}/${["admin", "beta_paid"].includes(entitlementAfterGeneration.plan) ? entitlementAfterGeneration.generationLimit : runtimeAfterGeneration.limits.text}.`,
          remaining <= 0
            ? "Лимит закончился. Можно запросить расширение, а пока улучшить AI-эксперта материалами."
            : "Чтобы следующий текст был сильнее, можно продолжить онбординг: добавить стиль, материалы или собрать своего AI-эксперта.",
        ].join("\n"),
        {
          reply_markup: { inline_keyboard: [
            [{ text: "👤 Продолжить онбординг", callback_data: "ob_dashboard" }],
            [{ text: "📩 Запросить расширение", callback_data: "req_limit_text" }],
          ]},
        }
      );
    }
  } catch (error) {
    console.error("Generation failed:", error.message);
    const s = userState.get(chatId) || {};
    s.pendingTopic = topic;
    s.pendingScenario = scenario;
    s.pendingLengthMode = lengthMode;
    s.lastGenerationFailedAt = new Date().toISOString();
    const runtime = await loadExpertRuntime(chatId).catch(() => null);
    if (runtime) {
      runtime.telemetry.generation_failures = (runtime.telemetry.generation_failures || 0) + 1;
      await saveExpertRuntime(chatId, runtime).catch(() => {});
    }
    s.firstGenerationBoost = false;
    userState.set(chatId, s);
    await bot.editMessageText([
      "Генерация не завершилась.",
      friendlyErrorMessage(error, "generation"),
      "",
      "Тема сохранена. Можно повторить или перейти в dashboard и усилить эксперта.",
    ].join("\n"), {
      chat_id: chatId,
      message_id: genMsg.message_id,
      reply_markup: { inline_keyboard: [
        [{ text: "🔁 Повторить", callback_data: "retry_generation" }],
        [{ text: "👤 Dashboard", callback_data: "ob_dashboard" }],
      ]},
    }).catch(async () => {
      await bot.sendMessage(chatId, friendlyErrorMessage(error, "generation"));
    });
  }
}

process.on("uncaughtException", (err) => {
  console.error(`[${RUNTIME_NAME}] Uncaught:`, err?.message || err);
});
process.on("unhandledRejection", (err) => {
  console.error(`[${RUNTIME_NAME}] Unhandled:`, err?.message || err);
});

await initializeMainPolling();
