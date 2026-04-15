import express from "express";
import { Telegraf } from "telegraf";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 3000;

// === ИНИЦИАЛИЗАЦИЯ ===
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === СТАРТ ===
bot.start((ctx) => {
  ctx.reply("Привет. Я рядом. Можешь написать, что тебя беспокоит.");
});

// === ОСНОВНАЯ ЛОГИКА ===
bot.on("text", async (ctx) => {
  try {
    const userText = ctx.message.text;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",

      temperature: 0.7,
      max_tokens: 180,

      messages: [
        {
          role: "system",
          content: `
Ты — психолог (женщина), отвечаешь как живой человек.

Правила ответа:
- 2–4 коротких предложения
- без списков и нумерации
- без длинных объяснений
- пиши простым разговорным языком
- проявляй эмпатию (поддержка, понимание)
- не давай сухих советов
- в конце задай 1 мягкий вопрос

Стиль:
- спокойно, тепло, без морализаторства
- как в переписке в Telegram
- без шаблонных фраз типа "это нормально"
`
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });

    let answer = response.choices[0].message.content;

    await ctx.reply(answer);

  } catch (error) {
    console.error("OpenAI error:", error);
    await ctx.reply("Сейчас не получилось ответить, попробуй ещё раз 🙏");
  }
});

// === HTTP СЕРВЕР ===
app.get("/", (req, res) => {
  res.send("Bot is alive");
});

// === ЗАПУСК ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// === ЗАПУСК БОТА ===
bot.launch().then(() => {
  console.log("Bot started");
});

// === КОРРЕКТНОЕ ЗАВЕРШЕНИЕ ===
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
