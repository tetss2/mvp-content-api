import { createHmac, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import { extname, join, normalize, relative, resolve } from "path";
import { runRuntimeGenerationAdapter } from "../scripts/runtime-generation-adapter.js";

const MINIAPP_STATIC_ROOT = resolve(process.cwd(), "public", "miniapp");
const MAX_BODY_BYTES = 64 * 1024;
const MAX_AUTH_AGE_SECONDS = Number(process.env.MINIAPP_AUTH_MAX_AGE_SECONDS || 24 * 60 * 60);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(text);
}

function safeUserId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function safeNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function normalizePlanType(value, catalog) {
  const key = String(value || "FREE").trim().toUpperCase();
  if (["BETA_PAID", "PAID", "STARS_TEXT10_BETA"].includes(key)) return "START";
  if (["DEMO", "FREE_DEMO"].includes(key)) return "FREE";
  if (["ADMIN", "FULL_ACCESS"].includes(key)) return "PRO";
  return catalog[key] ? key : "FREE";
}

function buildDefaultPlan(userId, catalog) {
  const free = catalog.FREE;
  const now = new Date().toISOString();
  return {
    userId: String(userId),
    planType: "FREE",
    status: "active",
    premium: false,
    limits: {
      text: Number(free.textLimit || free.generationLimit || 3),
      photo: 0,
      audio: 0,
      video: 0,
    },
    usage: { text: 0, photo: 0, audio: 0, video: 0 },
    source: "miniapp_default",
    validUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizePlan(userId, raw, catalog) {
  const planType = normalizePlanType(raw?.planType || raw?.plan, catalog);
  const plan = catalog[planType] || catalog.FREE;
  return {
    userId: String(raw?.userId || userId),
    planType,
    status: raw?.status || "active",
    premium: Boolean(raw?.premium ?? plan.premium),
    limits: {
      text: safeNonNegativeInteger(raw?.limits?.text ?? raw?.generationLimit ?? plan.textLimit ?? plan.generationLimit ?? 0),
      photo: safeNonNegativeInteger(raw?.limits?.photo ?? 0),
      audio: safeNonNegativeInteger(raw?.limits?.audio ?? 0),
      video: safeNonNegativeInteger(raw?.limits?.video ?? 0),
    },
    usage: {
      text: safeNonNegativeInteger(raw?.usage?.text ?? raw?.generationUsed ?? 0),
      photo: safeNonNegativeInteger(raw?.usage?.photo ?? 0),
      audio: safeNonNegativeInteger(raw?.usage?.audio ?? 0),
      video: safeNonNegativeInteger(raw?.usage?.video ?? 0),
    },
    source: raw?.source || "runtime",
    validUntil: raw?.validUntil || null,
    telegramStars: raw?.telegramStars || null,
    createdAt: raw?.createdAt || null,
    updatedAt: raw?.updatedAt || null,
  };
}

function planRemaining(plan, key = "text") {
  return Math.max(0, Number(plan?.limits?.[key] || 0) - Number(plan?.usage?.[key] || 0));
}

function isPlanExpired(plan) {
  return Boolean(plan?.validUntil && new Date(plan.validUntil) < new Date());
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

async function logMiniappEvent(options, type, payload = {}) {
  const event = {
    ts: new Date().toISOString(),
    type,
    source: "miniapp",
    ...payload,
  };
  try {
    await fs.appendFile(options.runtimeEventsPath || join(options.runtimeDataRoot, "runtime_events.jsonl"), `${JSON.stringify(event)}\n`, "utf-8");
  } catch (error) {
    console.warn(`[miniapp] event log failed: ${error.message}`);
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return { ok: false, reason: "missing_init_data_or_token" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (hashBuffer.length !== expectedBuffer.length || !timingSafeEqual(hashBuffer, expectedBuffer)) {
    return { ok: false, reason: "invalid_hash" };
  }

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }
  if (!user?.id) return { ok: false, reason: "missing_user" };
  if (!/^\d+$/.test(String(user.id))) return { ok: false, reason: "invalid_user" };
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return { ok: false, reason: "missing_auth_date" };
  if (Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return { ok: false, reason: "stale_auth_date" };

  return {
    ok: true,
    reason: null,
    user,
    authDate: params.get("auth_date") || null,
    startParam: params.get("start_param") || null,
  };
}

function getInitData(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("tma ")) return auth.slice(4);
  return req.headers["x-telegram-init-data"] || url.searchParams.get("tg_init_data") || "";
}

function buildSession(req, url, options) {
  const validation = validateTelegramInitData(getInitData(req, url), options.botToken);
  if (validation.ok) {
    return {
      authenticated: true,
      mode: "telegram_webapp",
      userId: String(validation.user?.id || ""),
      user: validation.user,
      authDate: validation.authDate,
      startParam: validation.startParam,
    };
  }

  const devAuthAllowed = options.nodeEnv !== "production" && options.devAuth !== false;
  if (devAuthAllowed) {
    const userId = url.searchParams.get("user_id") || "dev";
    return {
      authenticated: true,
      mode: "dev_fallback",
      userId,
      user: { id: userId, first_name: "Local" },
      authWarning: validation.reason,
    };
  }

  return { authenticated: false, mode: "none", reason: validation.reason };
}

function requireSession(req, res, url, options) {
  const session = buildSession(req, url, options);
  if (!session.authenticated || !session.userId) {
    logMiniappEvent(options, "miniapp_session_rejected", { reason: session.reason || "missing_user", path: url.pathname }).catch(() => {});
    sendJson(res, 401, { ok: false, error: "unauthorized", session });
    return null;
  }
  return session;
}

async function loadUserPlan(userId, options) {
  const path = join(options.userPlansRoot, `${safeUserId(userId)}.json`);
  const raw = await readJson(path, null);
  return normalizePlan(userId, raw || buildDefaultPlan(userId, options.planCatalog), options.planCatalog);
}

async function loadDashboard(session, options) {
  const [plan, expertsStore, mediaStore, kbStore] = await Promise.all([
    loadUserPlan(session.userId, options),
    readJson(options.expertsPath, { experts: [] }),
    readJson(options.mediaProfilesPath, { profiles: [] }),
    readJson(options.expertKbRegistryPath, { experts: [] }),
  ]);
  const experts = Array.isArray(expertsStore.experts) ? expertsStore.experts : [];
  const activeExperts = experts.filter((expert) => expert.status !== "disabled");
  return {
    user: session.user,
    plan: withRemaining(plan),
    experts: activeExperts.map((expert) => ({
      expertId: expert.expertId,
      displayName: expert.displayName,
      niche: expert.niche,
      status: expert.status || "active",
      kbConfigured: Boolean(expert.kbConfigured),
    })),
    mediaProfiles: Array.isArray(mediaStore.profiles) ? mediaStore.profiles : [],
    knowledgeRegistry: Array.isArray(kbStore.experts) ? kbStore.experts : [],
    runtime: {
      generation: "existing_runtime_adapter",
      access: "user_plan_runtime",
      payments: "telegram_stars_abstraction",
      storage: "runtime_data",
    },
  };
}

function withRemaining(plan) {
  return {
    ...plan,
    remaining: {
      text: planRemaining(plan, "text"),
      photo: planRemaining(plan, "photo"),
      audio: planRemaining(plan, "audio"),
      video: planRemaining(plan, "video"),
    },
    expired: isPlanExpired(plan),
  };
}

async function listUploads(session, options) {
  const root = join(options.runtimeDataRoot, "users", safeUserId(session.userId));
  const profileRuntime = await readJson(join(root, "profile", "runtime.json"), null);
  return {
    userId: session.userId,
    runtimeProfileFound: Boolean(profileRuntime),
    uploadTelemetry: profileRuntime?.telemetry?.upload_counts || {},
    uploadsTotal: Number(profileRuntime?.telemetry?.uploads_total || 0),
    intakeHint: "Upload processing remains in Telegram bot flow; Mini App exposes control-panel status only.",
  };
}

async function handleGenerate(req, res, url, options) {
  const session = requireSession(req, res, url, options);
  if (!session) return true;
  const body = await readBody(req);
  const topic = String(body.topic || "").trim();
  if (!topic) {
    sendJson(res, 400, { ok: false, error: "topic_required" });
    return true;
  }

  const plan = await loadUserPlan(session.userId, options);
  if (plan.status !== "active" || isPlanExpired(plan) || planRemaining(plan, "text") <= 0) {
    sendJson(res, 402, { ok: false, error: "access_denied", plan: withRemaining(plan) });
    return true;
  }

  const expertId = String(body.expertId || body.expert_id || "dinara").trim();
  const adapterResult = await runRuntimeGenerationAdapter({
    expertId,
    topic,
    intent: body.intent || "educational_post",
    platform: body.platform || "telegram",
    format: body.format || "post",
    length: body.length || "medium",
    audienceState: body.audienceState || "warming",
    llmExecutionMode: "dry_run_prompt_only",
  }, {
    root: process.cwd(),
    llmExecutionMode: "dry_run_prompt_only",
    persistRuntime: false,
    persistIdentity: false,
    persistCampaignMemory: false,
    persistStrategicBrain: false,
    persistEditorialDirector: false,
  });

  sendJson(res, 200, {
    ok: true,
    mode: "telegram_handoff",
    message: "Generation is prepared as a runtime-safe handoff. Continue the AI conversation in Telegram.",
    userId: session.userId,
    plan: withRemaining(plan),
    request: { expertId, topic, length: body.length || "medium", platform: body.platform || "telegram" },
    runtimePreview: {
      runId: adapterResult.runtime?.run_id || null,
      promptScore: adapterResult.generation_pipeline?.validation?.prompt_score || null,
      qualityScore: adapterResult.integrated_validation?.combined_quality_score || null,
      warnings: adapterResult.integrated_validation?.warnings || [],
      llmExecutionMode: adapterResult.generation_pipeline?.llm_execution_mode || "dry_run_prompt_only",
    },
    telegram: {
      botUsername: options.telegramBotUsername || null,
      deepLink: options.telegramBotUsername
        ? `https://t.me/${options.telegramBotUsername}?start=miniapp_generate`
        : null,
    },
  });
  return true;
}

async function serveStatic(res, url) {
  const pathname = url.pathname === "/miniapp" || url.pathname === "/miniapp/"
    ? "/index.html"
    : url.pathname.replace(/^\/miniapp\//, "/");
  const candidate = resolve(MINIAPP_STATIC_ROOT, `.${normalize(pathname)}`);
  if (relative(MINIAPP_STATIC_ROOT, candidate).startsWith("..")) {
    sendText(res, 403, "forbidden");
    return true;
  }
  try {
    const content = await fs.readFile(candidate);
    sendText(res, 200, content, MIME_TYPES[extname(candidate)] || "application/octet-stream");
  } catch {
    sendText(res, 404, "not found");
  }
  return true;
}

function createMiniappShell(options = {}) {
  const resolvedOptions = {
    nodeEnv: process.env.NODE_ENV || "development",
    devAuth: process.env.MINIAPP_DEV_AUTH !== "false",
    runtimeDataRoot: process.env.RUNTIME_DATA_ROOT || process.cwd(),
    userPlansRoot: join(process.cwd(), "runtime_data", "user_plans"),
    expertsPath: join(process.cwd(), "runtime_data", "experts.json"),
    mediaProfilesPath: join(process.cwd(), "runtime_data", "media_profiles.json"),
    expertKbRegistryPath: join(process.cwd(), "runtime_data", "expert_kb_registry.json"),
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || "",
    ...options,
  };

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (!url.pathname.startsWith("/miniapp")) return false;

    try {
      if (url.pathname === "/miniapp/api/session") {
        const session = buildSession(req, url, resolvedOptions);
        await logMiniappEvent(resolvedOptions, "miniapp_launch", {
          authenticated: session.authenticated,
          mode: session.mode,
          userId: session.userId || null,
          reason: session.reason || session.authWarning || null,
        });
        sendJson(res, 200, { ok: true, session });
        return true;
      }
      if (url.pathname === "/miniapp/api/dashboard") {
        const session = requireSession(req, res, url, resolvedOptions);
        if (!session) return true;
        sendJson(res, 200, { ok: true, dashboard: await loadDashboard(session, resolvedOptions) });
        return true;
      }
      if (url.pathname === "/miniapp/api/plans") {
        sendJson(res, 200, {
          ok: true,
          plans: resolvedOptions.planCatalog,
          telegramStarsReady: resolvedOptions.telegramStarsReady,
        });
        return true;
      }
      if (url.pathname === "/miniapp/api/usage") {
        const session = requireSession(req, res, url, resolvedOptions);
        if (!session) return true;
        sendJson(res, 200, { ok: true, plan: withRemaining(await loadUserPlan(session.userId, resolvedOptions)) });
        return true;
      }
      if (url.pathname === "/miniapp/api/uploads") {
        const session = requireSession(req, res, url, resolvedOptions);
        if (!session) return true;
        sendJson(res, 200, { ok: true, uploads: await listUploads(session, resolvedOptions) });
        return true;
      }
      if (url.pathname === "/miniapp/api/generate" && req.method === "POST") {
        return await handleGenerate(req, res, url, resolvedOptions);
      }
      if (req.method === "GET") return await serveStatic(res, url);
      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
      return true;
    } catch (error) {
      sendJson(res, error.message === "body_too_large" ? 413 : 500, {
        ok: false,
        error: error.message || "miniapp_error",
      });
      return true;
    }
  }

  return { handle };
}

export { createMiniappShell, validateTelegramInitData };
