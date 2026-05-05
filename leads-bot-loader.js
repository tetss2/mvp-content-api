// ─── ЗАПУСК LEADS-BOT В ТОМ ЖЕ ПРОЦЕССЕ ─────────────────────────────────────
if (process.env.LEADS_BOT_TOKEN) {
  import("./leads-bot.js").catch(err => console.error("Leads bot error:", err.message));
}
