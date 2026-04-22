import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;

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

// Правильная msgpack упаковка
function writeMsgpack(val) {
  if (typeof val === 'boolean') {
    return Buffer.from([val ? 0xc3 : 0xc2]);
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 0 && val <= 127) {
      return Buffer.from([val]);
    }
    const b = Buffer.alloc(5);
    b[0] = 0xd2;
    b.writeInt32BE(val, 1);
    return b;
  }
  if (typeof val === 'string') {
    const strBuf = Buffer.from(val, 'utf8');
    const len = strBuf.length;
    if (len <= 31) {
      return Buffer.concat([Buffer.from([0xa0 | len]), strBuf]);
    } else if (len <= 255) {
      return Buffer.concat([Buffer.from([0xd9, len]), strBuf]);
    } else {
      return Buffer.concat([Buffer.from([0xda, len >> 8, len & 0xff]), strBuf]);
    }
  }
  if (val && typeof val === 'object') {
    const keys = Object.keys(val);
    const parts = [Buffer.from([0x80 | keys.length])];
    for (const key of keys) {
      parts.push(writeMsgpack(key));
      parts.push(writeMsgpack(val[key]));
    }
    return Buffer.concat(parts);
  }
  return Buffer.from([0xc0]); // null
}

async function generateVoice(text) {
  const payload = writeMsgpack({
    text: text,
    reference_id: FISH_AUDIO_VOICE_ID,
    format: "mp3",
    mp3_bitrate: 128,
    normalize: true,
    latency: "normal",
  });

  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/msgpack",
    },
    body: payload,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Fish Audio error: ${err}`);
  }

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

    const shortPrompt = `Сожми следующий текст до 2-3 предложений (300-350 символов).
Требования:
- Без вопроса в конце
- Нейтральный тон, тёплый и спокойный
- Краткая осмысленная версия основной мысли
- Пиши от первого лица
- Только текст без пояснений

Текст:
${fullAnswer}

Сжатая версия:`;

    const shortCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: shortPrompt }],
      temperature: 0.5,
      max_tokens: 120,
    });

    const shortAnswer = shortCompletion.choices[0].message.content.trim();
    console.log("Short:", shortAnswer);

    const audioBuffer = await generateVoice(shortAnswer);
    await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });
    console.log("Voice sent");

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера 😢"); } catch(e) {}
  }
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
