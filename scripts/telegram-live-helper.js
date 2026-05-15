import "dotenv/config";

const mode = (process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const betaMode = ["beta", "demo", "staging", "railway-beta"].includes(mode);
const tokenName = betaMode ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN";
const token = process.env[tokenName] || "";
const baseUrl = (process.env.LIVE_BASE_URL || process.env.RAILWAY_PUBLIC_URL || "").replace(/\/+$/, "");
const miniappUrl = process.env.MINIAPP_PUBLIC_URL || process.env.TELEGRAM_MINIAPP_URL || "";
const polling = process.env.TELEGRAM_POLLING !== "false";
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || (baseUrl ? `${baseUrl}/api/webhook` : "");

async function fetchTelegram(method) {
  if (!token) return { ok: false, skipped: true, reason: `${tokenName}_missing` };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    const body = await res.json().catch(() => null);
    return { ok: res.ok && body?.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

const [me, webhook] = await Promise.all([
  fetchTelegram("getMe"),
  fetchTelegram("getWebhookInfo"),
]);

const activeWebhookUrl = webhook.body?.result?.url || "";
const recommendations = [];

if (polling) {
  recommendations.push("This MVP is polling-first. Keep Telegram webhook empty for live polling mode.");
  if (activeWebhookUrl) recommendations.push("Delete the active Telegram webhook before enabling live polling.");
} else {
  recommendations.push("Webhook mode requested. Verify api/webhook.js is intentionally used before switching away from polling.");
  if (webhookUrl) recommendations.push(`Webhook URL to set manually: ${webhookUrl}`);
}
if (miniappUrl) {
  recommendations.push(`Set Telegram Mini App launch URL in BotFather to: ${miniappUrl}`);
} else {
  recommendations.push("Set MINIAPP_PUBLIC_URL=https://<railway-domain>/miniapp before Mini App launch.");
}
if (process.env.TELEGRAM_STARS_ENABLED === "true") {
  recommendations.push("Telegram Stars checkout is enabled. Use /payment_flow_check before the first real invoice.");
} else {
  recommendations.push("Telegram Stars checkout is disabled. Enable TELEGRAM_STARS_ENABLED=true only for the controlled live payment test.");
}

const summary = {
  ok: Boolean(token) && me.ok && webhook.ok,
  checkedAt: new Date().toISOString(),
  mode,
  tokenName,
  bot: me.ok ? {
    id: me.body?.result?.id,
    username: me.body?.result?.username,
    canJoinGroups: me.body?.result?.can_join_groups ?? null,
    canReadAllGroupMessages: me.body?.result?.can_read_all_group_messages ?? null,
  } : {
    ok: false,
    reason: me.reason || me.error || me.body?.description || "not_verified",
  },
  liveMode: polling ? "polling" : "webhook",
  webhook: webhook.ok ? {
    active: Boolean(activeWebhookUrl),
    urlConfigured: activeWebhookUrl ? "[configured]" : null,
    pendingUpdateCount: webhook.body?.result?.pending_update_count ?? null,
    lastErrorDate: webhook.body?.result?.last_error_date || null,
    lastErrorMessage: webhook.body?.result?.last_error_message || null,
    expectedEmptyForPolling: polling,
    matchesEnv: webhookUrl ? activeWebhookUrl === webhookUrl : null,
  } : {
    ok: false,
    reason: webhook.reason || webhook.error || webhook.body?.description || "not_verified",
  },
  miniapp: {
    publicUrlConfigured: Boolean(miniappUrl),
    publicUrl: miniappUrl ? "[configured]" : null,
    launchPathExpected: "/miniapp",
  },
  stars: {
    enabled: process.env.TELEGRAM_STARS_ENABLED === "true",
    currency: "XTR",
    providerTokenRequired: false,
    paymentTestMode: process.env.PAYMENT_TEST_MODE === "true" || process.env.TELEGRAM_STARS_TEST_MODE === "true",
  },
  recommendations,
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) process.exitCode = 1;
