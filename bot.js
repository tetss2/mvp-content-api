import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import OpenAI from "openai";

// ===== ENV =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== INIT =====
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ===== LOAD ARTICLES =====
const rawData = fs.readFileSync("./articles.production.json");
const articles = JSON.parse(rawData);

// ===== SIMPLE FAST SEARCH =====
function searchArticles(query) {
  const q = query.toLowerCase();

  return articles
    .map((a) => {
      let score = 0;

      if (a.title.toLowerCase().includes(q)) score += 5;

      a.tags.forEach((tag) => {
        if (q.includes(tag)) score += 3;
      });

      if (a.content.toLowerCase().includes(q)) score += 1;

      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ===== OPENAI =====
async function askOpenAI(userText, contextText) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Ты психолог (Динара). Отвечай мягко, поддерживающе, без занудства. Используй контекст, но добавляй знания.",
      },
      {
        role: "user",
        content: `Контекст:\n${contextText}\n\nВопрос:\n${userText}`,
      },
    ],
  });

  return completion.choices[0].message.content;
}

// ===== BOT HANDLER =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  try {
    const found = searchArticles(text);

    let context = "";

    if (found.length > 0) {
      context = found
        .map(
          (a) =>
            `Статья: ${a.title}\n${a.content.substring(0, 500)}`
        )
        .join("\n\n");
    }

    // ===== OPENAI + FALLBACK =====
    try {
      const answer = await askOpenAI(text, context);
      bot.sendMessage(chatId, answer);
    } catch (e) {
      console.error("OpenAI ERROR:", e);

      if (context) {
        bot.sendMessage(
          chatId,
          "Нашла похожую информацию:\n\n" + context.slice(0, 1000)
        );
      } else {
        bot.sendMessage(
          chatId,
          "Пока не нашла точный ответ. Попробуй переформулировать 🙏"
        );
      }
    }
  } catch (err) {
    console.error("GLOBAL ERROR:", err);
    bot.sendMessage(chatId, "Ошибка сервера 😢");
  }
});
