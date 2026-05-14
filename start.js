import http from "http";
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

function tokenFingerprint(value) {
  if (value === undefined || value === null || value === "") return value;
  const text = String(value);
  if (text.length <= 10) return "[set]";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
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
http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "mvp-content-api", runtimeMode, startedAt }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}).listen(process.env.PORT || 3000);
await import("./index.js");
if (leadsBotEnabled) {
  await import("./leads-bot.js");
}
