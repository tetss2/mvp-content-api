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
      max_tokens: 400,

      messages: [
        {
          role: "system",
         content: `
Ты — психолог (женщина), отвечаешь как живой человек.

Правила ответа:
- 3–6 предложений
- без списков и нумерации
- пиши простым разговорным языком
- проявляй эмпатию и понимание
- можно дать мягкое направление мысли, но не дави советами
- не делай сухих объяснений

Стиль:
- как переписка в Telegram
- спокойно, тепло, без морализаторства
- допускается лёгкая естественная речь

В конце задай 1 вопрос, чтобы продолжить диалог.
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
