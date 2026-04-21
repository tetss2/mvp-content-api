import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

console.log("Bot started in polling mode");

function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => {
    if (text.includes(word)) score += 1;
  });
  return score;
}

async function generateVoice(text) {
  // Добавляем паузы через знаки препинания для более естественной речи
  const textWithPauses = text
    .replace(/\. /g, '.  ')      // пауза после точки
    .replace(/\? /g, '?  ')      // пауза после вопроса
    .replace(/\! /g, '!  ')      // пауза после восклицания
    .replace(/, /g, ',  ');       // небольшая пауза после запятой

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-10",
      "X-API-Key": CARTESIA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-multilingual",
      transcript: textWithPauses,
      voice: {
        mode: "id",
        id: CARTESIA_VOICE_ID,
        __experimental_controls: {
          speed: "slow",   // медленнее (~0.85)
          emotion: ["positivity:low", "curiosity:low"]  // мягче, теплее
        }
      },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      language: "ru",
    }),
  });
  if (!response.ok) throw new Error(`Cartesia error: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    console.log("Message:", text);

    const topArticles = articles
      .map(a => ({ ...a, score: scoreArticle(a, text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const context = topArticles
      .map(a => `Статья: ${a.title}\n${a.content}`)
      .join("\n\n");

    const prompt = `Ты практикующий психолог (Динара).
ФОРМАТ: 2-4 абзаца, живой язык, без списков, эмпатия + вопрос.
ОГРАНИЧЕНИЕ: не более 1200 символов.
Контекст:
${context}
Вопрос:
${text}
Ответ:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const fullAnswer = completion.choices[0].message.content;
    await bot.sendMessage(chatId, fullAnswer);
    console.log("Text sent");

    // Сжатая версия для голоса — короткая, с паузами через многоточие
    const shortPrompt = `Сожми до 1-2 предложений (не более 200 символов).
Сохрани главную мысль и тепло. Пиши от первого лица.
Добавь многоточие (...) там где нужна пауза для живой речи.
Только текст без пояснений.

Текст:
${fullAnswer}

Сжатая версия:`;

    const shortCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: shortPrompt }],
      temperature: 0.5,
      max_tokens: 80,
    });

    const shortAnswer = shortCompletion.choices[0].message.content.trim();
    console.log("Short:", shortAnswer);

    const audioBuffer = await generateVoice(shortAnswer);
    await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });
    console.log("Voice sent");

  } catch (error) {
    console.error("Error:", error.message);
    bot.sendMessage(msg.chat.id, "Ошибка сервера 😢");
  }
});
