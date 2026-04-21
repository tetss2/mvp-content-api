import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ====== ENV ======
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VOICE_ID = process.env.CARTESIA_VOICE_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ====== INIT (webhook mode — NO polling) ======
const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: false });

// ====== LOAD ARTICLES ======
const articles = require("./articles.production.json");

// ====== SEMANTIC SCORE ======
function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => {
    if (text.includes(word)) score += 1;
  });
  return score;
}

// ====== CARTESIA TTS ======
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
      voice: {
        mode: "id",
        id: CARTESIA_VOICE_ID,
      },
      output_format: {
        container: "mp3",
        encoding: "mp3",
        sample_rate: 44100,
      },
      language: "ru",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cartesia error: ${err}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// ====== MAIN HANDLER ======
async function handleMessage(msg) {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // 1. FIND BEST ARTICLES
    const topArticles = articles
      .map(a => ({ ...a, score: scoreArticle(a, text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // 2. BUILD CONTEXT
    const context = topArticles
      .map(a => `Статья: ${a.title}\n${a.content}`)
      .join("\n\n");

    // 3. PROMPT
    const prompt = `
Ты практикующий психолог (Динара).
ФОРМАТ ОТВЕТА:
— 2-4 абзаца
— каждый абзац 2-4 предложения
— делай перенос строки между абзацами
— пиши структурно, как в постах
— не повторяй формулировки из предыдущих ответов
СТИЛЬ:
— спокойно, без давления
— живой язык, не академический
— иногда начинай с короткой фразы: "Понимаю", "Похоже", "Это непросто"
— без списков
— без "воды"
— не повторяйся
ЛОГИКА:
1. коротко обозначь суть/эмпатию
2. немного раскрой тему
3. задай 1-2 вопроса или мягко направь
ОГРАНИЧЕНИЕ:
— не более 1200 символов
Контекст:
${context}
Вопрос:
${text}
Ответ:
`;

    // 4. OPENAI
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const answer = completion.choices[0].message.content;

    // 5. SEND TEXT
    await bot.sendMessage(chatId, answer);

    // 6. SEND VOICE
    try {
      const audioBuffer = await generateVoice(answer);
      await bot.sendVoice(chatId, audioBuffer, {}, {
        filename: "voice.mp3",
        contentType: "audio/mpeg",
      });
    } catch (voiceError) {
      console.error("Voice generation failed:", voiceError.message);
    }

  } catch (error) {
    console.error("Handler error full:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    bot.sendMessage(msg.chat.id, "Ошибка: " + error.message);
  }
}

export { bot, handleMessage };
