import http from "http";
import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const startedAt = new Date().toISOString();
const runtimeMode = (process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const betaMode = ["beta", "demo", "staging", "railway-beta"].includes(runtimeMode);
const mainTokenName = betaMode ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN";
const mainToken = process.env[mainTokenName];
const leadsToken = process.env.LEADS_BOT_TOKEN;
const mainBotEnabled = process.env.TELEGRAM_POLLING !== "false" && Boolean(process.env[mainTokenName]);
const leadsBotRequested = process.env.START_LEADS_BOT === "true";
const leadsBotTokenPresent = Boolean(leadsToken);
const leadsBotTokenOverlapsMain = Boolean(mainToken && leadsToken && mainToken === leadsToken);
const leadsBotEnabled = leadsBotRequested && leadsBotTokenPresent && !leadsBotTokenOverlapsMain;
const userPlansRoot = process.env.USER_PLANS_ROOT || join(__dirname, "runtime_data", "user_plans");
const planCatalog = {
  FREE: {
    planType: "FREE",
    premium: false,
    textLimit: Number(process.env.PLAN_FREE_TEXT_LIMIT || 3),
  },
  START: {
    planType: "START",
    premium: true,
    textLimit: Number(process.env.PLAN_START_TEXT_LIMIT || 50),
    days: Number(process.env.PLAN_START_DAYS || 30),
    starsPrice: Number(process.env.PLAN_START_STARS_PRICE || process.env.TELEGRAM_STARS_TEXT_PACK_PRICE || 149),
  },
  PRO: {
    planType: "PRO",
    premium: true,
    textLimit: Number(process.env.PLAN_PRO_TEXT_LIMIT || 200),
    days: Number(process.env.PLAN_PRO_DAYS || 30),
    starsPrice: Number(process.env.PLAN_PRO_STARS_PRICE || 499),
  },
};

function tokenFingerprint(value) {
  if (value === undefined || value === null || value === "") return value;
  const text = String(value);
  if (text.length <= 10) return "[set]";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function safeUserId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function readMiniappPlan(userId) {
  if (!userId) return null;
  try {
    const raw = await fs.readFile(join(userPlansRoot, `${safeUserId(userId)}.json`), "utf-8");
    const plan = JSON.parse(raw);
    return {
      userId: plan.userId,
      planType: plan.planType,
      status: plan.status,
      premium: Boolean(plan.premium),
      limits: plan.limits || {},
      usage: plan.usage || {},
      remaining: {
        text: Math.max(0, Number(plan.limits?.text || 0) - Number(plan.usage?.text || 0)),
      },
      validUntil: plan.validUntil || null,
      updatedAt: plan.updatedAt || null,
    };
  } catch {
    return null;
  }
}

console.log("[startup] Runtime:", {
  runtimeMode,
  betaMode,
});
console.log("[startup] Main bot:", {
  enabled: mainBotEnabled,
  polling: process.env.TELEGRAM_POLLING !== "false",
  tokenName: mainTokenName,
  tokenPresent: Boolean(process.env[mainTokenName]),
  tokenFingerprint: tokenFingerprint(mainToken),
  telegramTokenPresent: Boolean(process.env.TELEGRAM_TOKEN),
  telegramTokenFingerprint: tokenFingerprint(process.env.TELEGRAM_TOKEN),
  telegramBetaTokenPresent: Boolean(process.env.TELEGRAM_BETA_TOKEN),
  telegramBetaTokenFingerprint: tokenFingerprint(process.env.TELEGRAM_BETA_TOKEN),
  telegramBotTokenPresent: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  telegramBotTokenFingerprint: tokenFingerprint(process.env.TELEGRAM_BOT_TOKEN),
  botTokenPresent: Boolean(process.env.BOT_TOKEN),
  botTokenFingerprint: tokenFingerprint(process.env.BOT_TOKEN),
});
console.log("[startup] Leads bot:", {
  enabled: leadsBotEnabled,
  requested: leadsBotRequested,
  tokenPresent: leadsBotTokenPresent,
  tokenFingerprint: tokenFingerprint(leadsToken),
  disabledReason: leadsBotEnabled
    ? null
    : (leadsBotTokenOverlapsMain
      ? "LEADS_BOT_TOKEN matches main bot token"
      : (leadsBotRequested ? "LEADS_BOT_TOKEN missing" : "START_LEADS_BOT is not true")),
});
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/healthz" || url.pathname === "/") {
    sendJson(res, 200, { ok: true, service: "mvp-content-api", runtimeMode, startedAt });
    return;
  }
  if (url.pathname === "/runtime/plans") {
    sendJson(res, 200, { ok: true, plans: planCatalog, telegramStarsReady: process.env.TELEGRAM_STARS_ENABLED === "true" });
    return;
  }
  if (url.pathname === "/runtime/usage") {
    const userId = url.searchParams.get("user_id");
    const plan = await readMiniappPlan(userId);
    if (!plan) {
      sendJson(res, 404, { ok: false, error: "plan_not_found" });
      return;
    }
    sendJson(res, 200, { ok: true, plan });
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}).listen(process.env.PORT || 3000);
await import("./index.js");
if (leadsBotEnabled) {
  await import("./leads-bot.js");
}
