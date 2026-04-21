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

// Простая msgpack упаковка без внешних зависимостей
function encodeMsgpack(obj) {
  const parts = [];
  const keys = Object.keys(obj);
  // fixmap header
  parts.push(Buffer.from([0x80 | keys.length]));
  for (const key of keys) {
    const val = obj[key];
    // encode key (string)
    const keyBuf = Buffer.from(key, 'utf8');
    if (keyBuf.length <= 31) {
      parts.push(Buffer.from([0xa0 | keyBuf.length]));
    } else {
      parts.push(Buffer.from([0xd9, keyBuf.length]));
    }
    parts.push(keyBuf);
    // encode value
    if (typeof val === 'string') {
      const valBuf = Buffer.from(val, 'utf8');
      if (valBuf.length <= 31) {
        parts.push(Buffer.from([0xa0 | valBuf.length]));
      } else if (valBuf.length <= 255) {
        parts.push(Buffer.from([0xd9, valBuf.length]));
      } else {
        parts.push(Buffer.from([0xda, valBuf.length >> 8, valBuf.length & 0xff]));
      }
      parts.push(valBuf);
    } else if (typeof val === 'number') {
      if (Number.isInteger(val) && val >= 0 && val <= 127) {
        parts.push(Buffer.from([val]));
      } else {
        // int32
        const b = Buffer.alloc(5);
        b[0] = 0xd2;
        b.writeInt32BE(val, 1);
        parts.push(b);
      }
    } else if (typeof val === 'boolean') {
      parts.push(Buffer.from([val ? 0xc3 : 0xc2]));
    }
  }
  return Buffer.concat(parts);
}

async function generateVoice(text) {
  const payload = encodeMsgpack({
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

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
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
    bot.sendMessage(msg.chat.id, "Ошибка сервера 😢");
  }
});
