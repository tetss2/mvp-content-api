import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID;

const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: false });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("../articles.production.json");

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
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-10",
      "X-API-Key": CARTESIA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-multilingual",
      transcript: text,
      voice: { mode: "id", id: CARTESIA_VOICE_ID },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      language: "ru",
    }),
  });
  if (!response.ok) throw new Error(`Cartesia error: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  console.log("handleMessage:", chatId, text);

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

  const shortPrompt = `Сожми до 1-2 предложений (не более 200 символов), сохрани главную мысль и эмпатию. Только текст без пояснений.\n\nТекст:\n${fullAnswer}\n\nСжатая версия:`;

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
}

export default async function handler(req, res) {
  console.log("Webhook hit:", req.method);
  if (req.method === "POST") {
    const update = req.body;
    res.status(200).json({ ok: true });
    if (update.message) {
      try {
        await handleMessage(update.message);
      } catch (err) {
        console.error("Error:", err.message);
      }
    }
  } else {
    res.status(200).send("Webhook active");
  }
}
