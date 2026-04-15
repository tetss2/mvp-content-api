import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";

// === ИНИЦИАЛИЗАЦИЯ ===
const app = express();
const PORT = process.env.PORT || 3000;

// Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === ЛОГИ (для дебага) ===
bot.use((ctx, next) => {
  console.log("Update:", ctx.update);
  return next();
});

// === КОМАНДА /start ===
bot.start((ctx) => {
  console.log("/start from:", ctx.from.username);
  ctx.reply("Бот работает 🚀 Напиши свой вопрос");
});

// === ОСНОВНАЯ ЛОГИКА (AI) ===
bot.on("text", async (ctx) => {
  try {
    const userText = ctx.message.text;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ты профессиональный психолог. Давай развернутые, поддерживающие и полезные ответы, как живой специалист.",
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });

    const answer = response.choices[0].message.content;

    await ctx.reply(answer);
  } catch (error) {
    console.error("OpenAI error:", error);
    await ctx.reply("Ошибка при генерации ответа 😢");
  }
});

// === HTTP СЕРВЕР ===
app.get("/", (req, res) => {
  res.send("Bot is alive");
});

// === ЗАПУСК СЕРВЕРА ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// === ЗАПУСК БОТА (polling) ===
bot.launch().then(() => {
  console.log("Bot started");
});

// === КОРРЕКТНОЕ ЗАВЕРШЕНИЕ ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
