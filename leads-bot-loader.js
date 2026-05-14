// Optional leads bot. Keep this gated so beta/staging does not start a second poller.
if (process.env.START_LEADS_BOT === "true" && process.env.LEADS_BOT_TOKEN) {
  import("./leads-bot.js").catch((err) => console.error("Leads bot error:", err.message));
}
