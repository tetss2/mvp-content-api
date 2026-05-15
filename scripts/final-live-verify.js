import "dotenv/config";

const mode = (process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const betaMode = ["beta", "demo", "staging", "railway-beta"].includes(mode);
const tokenName = betaMode ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN";
const token = process.env[tokenName] || "";
const miniappUrl = process.env.MINIAPP_PUBLIC_URL || process.env.TELEGRAM_MINIAPP_URL || "";
const explicitBaseUrl = process.env.LIVE_BASE_URL || process.env.RAILWAY_PUBLIC_URL || process.argv[2] || "";
const baseUrl = (explicitBaseUrl || originFromUrl(miniappUrl) || "").replace(/\/+$/, "");
const polling = process.env.TELEGRAM_POLLING !== "false";
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || "";

const blockers = [];
const warnings = [];

function originFromUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isHttps(value) {
  return /^https:\/\//i.test(String(value || ""));
}

function safePath(value) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return "invalid";
  }
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 180) };
    }
    return { ok: res.ok && body?.ok !== false, status: res.status, body };
  } catch (error) {
    return { ok: false, status: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function telegram(method) {
  if (!token) return { ok: false, skipped: true, reason: `${tokenName}_missing` };
  return fetchJson(`https://api.telegram.org/bot${token}/${method}`);
}

if (!process.env[tokenName]) blockers.push(`${tokenName} missing`);
if (!process.env.OPENAI_API_KEY) blockers.push("OPENAI_API_KEY missing");
if (process.env.NODE_ENV !== "production") warnings.push("NODE_ENV is not production");
if (!baseUrl) blockers.push("LIVE_BASE_URL or RAILWAY_PUBLIC_URL missing");
if (baseUrl && !isHttps(baseUrl)) warnings.push("Base URL is not HTTPS; Railway live URL should be HTTPS");
if (!miniappUrl) blockers.push("MINIAPP_PUBLIC_URL/TELEGRAM_MINIAPP_URL missing");
if (miniappUrl && !isHttps(miniappUrl)) blockers.push("Mini App public URL must be HTTPS for live launch");
if (miniappUrl && !safePath(miniappUrl).startsWith("/miniapp")) {
  warnings.push("Mini App URL should usually point to /miniapp");
}
if (process.env.MINIAPP_DEV_AUTH !== "false") blockers.push("MINIAPP_DEV_AUTH must be false for live launch");
if (process.env.TELEGRAM_STARS_ENABLED !== "true") blockers.push("TELEGRAM_STARS_ENABLED must be true for first live Stars payment");
if (process.env.PAYMENT_TEST_MODE === "true" || process.env.TELEGRAM_STARS_TEST_MODE === "true") {
  blockers.push("Payment test mode must be disabled for live Stars payment");
}
if (!positiveNumber(process.env.PLAN_START_STARS_PRICE || process.env.TELEGRAM_STARS_TEXT_PACK_PRICE || 149)) {
  blockers.push("PLAN_START_STARS_PRICE must be positive");
}
if (!positiveNumber(process.env.PLAN_PRO_STARS_PRICE || 499)) {
  blockers.push("PLAN_PRO_STARS_PRICE must be positive");
}
if (webhookUrl && !isHttps(webhookUrl)) blockers.push("TELEGRAM_WEBHOOK_URL must be HTTPS when configured");
if (!polling && !webhookUrl) blockers.push("TELEGRAM_POLLING=false requires TELEGRAM_WEBHOOK_URL");

const endpointPaths = ["/health", "/runtime-status", "/payment-status", "/miniapp-status", "/runtime/plans", "/miniapp/api/plans"];
const endpoints = [];
if (baseUrl) {
  for (const path of endpointPaths) {
    endpoints.push({ path, ...(await fetchJson(`${baseUrl}${path}`)) });
  }
  for (const result of endpoints) {
    if (!result.ok) blockers.push(`Endpoint ${result.path} failed`);
  }
}

let protectedMiniappApi = null;
if (miniappUrl) {
  try {
    const url = new URL(miniappUrl);
    url.pathname = "/miniapp/api/dashboard";
    url.search = "";
    protectedMiniappApi = await fetchJson(url.toString());
    if (protectedMiniappApi.status !== 401) {
      blockers.push("Mini App protected API should reject missing Telegram init data with 401");
    }
  } catch {
    blockers.push("Mini App public URL is not parseable");
  }
}

const telegramMe = await telegram("getMe");
const webhookInfo = await telegram("getWebhookInfo");
if (!telegramMe.ok) warnings.push(`Telegram getMe not verified: ${telegramMe.reason || telegramMe.error || telegramMe.body?.description || "unknown"}`);
if (webhookInfo.ok) {
  const activeWebhook = webhookInfo.body?.result?.url || "";
  if (polling && activeWebhook) blockers.push("Telegram webhook is active while TELEGRAM_POLLING is enabled");
  if (!polling && webhookUrl && activeWebhook !== webhookUrl) blockers.push("Telegram webhook URL does not match TELEGRAM_WEBHOOK_URL");
} else {
  warnings.push(`Telegram webhook not verified: ${webhookInfo.reason || webhookInfo.error || webhookInfo.body?.description || "unknown"}`);
}

const summary = {
  ok: blockers.length === 0,
  checkedAt: new Date().toISOString(),
  mode,
  nodeEnv: process.env.NODE_ENV || "development",
  baseUrl: baseUrl || null,
  telegram: {
    tokenName,
    getMeOk: telegramMe.ok,
    polling,
    webhookConfiguredInEnv: Boolean(webhookUrl),
    webhookActive: Boolean(webhookInfo.body?.result?.url),
    pendingUpdates: webhookInfo.body?.result?.pending_update_count ?? null,
  },
  payment: {
    starsCheckout: process.env.TELEGRAM_STARS_ENABLED === "true",
    paymentTestMode: process.env.PAYMENT_TEST_MODE === "true" || process.env.TELEGRAM_STARS_TEST_MODE === "true",
    currency: "XTR",
    providerTokenRequired: false,
  },
  miniapp: {
    configured: Boolean(miniappUrl),
    https: miniappUrl ? isHttps(miniappUrl) : false,
    protectedApiStatus: protectedMiniappApi?.status ?? null,
  },
  endpoints: endpoints.map(({ path, ok, status, error }) => ({ path, ok, status, error: error || null })),
  blockers,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) process.exitCode = 1;
