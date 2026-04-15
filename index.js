import express from "express";
import { Telegraf } from "telegraf";

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ ВСТАВЬ СВОЙ ТОКЕН
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ====== ЛОГИ ДЛЯ ДЕБАГА ======
bot.use((ctx, next) => {
  console.log("📩 Update:", ctx.update);
  return next();
});

// ====== КОМАНДЫ ======
bot.start((ctx) => {
  console.log("👉 /start from", ctx.from.username);
  ctx.reply("Бот работает 🚀");
});

bot.on("text", (ctx) => {
  console.log("👉 text:", ctx.message.text);
  ctx.reply("Ты написал: " + ctx.message.text);
});

// ====== HTTP СЕРВЕР ======
app.get("/", (req, res) => {
  res.send("Bot is alive");
});

// ====== ЗАПУСК ======
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ====== ЗАПУСК БОТА ======
bot.launch().then(() => {
  console.log("🤖 Bot started");
});

// graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
