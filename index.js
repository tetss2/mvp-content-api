import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const FAL_KEY = process.env.FAL_KEY;

fal.config({ credentials: FAL_KEY });

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

console.log("Bot started in polling mode");

// --- БАЗА ПРОМПТОВ ---

const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
minimal wrinkles, very smooth skin, smooth under eyes,
youthful but mature appearance, 40 years old,
asian features, flat cheekbones, no cheekbones, soft round face,
small nose, almond eyes, upturned eye corners, lifted eye corners,
no drooping eyes, no sad eyes`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

const SCENE_OFFICE = `${BASE_PROMPT},
very subtle smile, slightly open mouth, relaxed lips, no gum show,
wearing elegant professional blouse, warm neutral colors,
sitting in cozy therapist office, bookshelf background,
soft warm lamp light, wooden furniture, indoor plants,
shallow depth of field, bokeh background, warm cozy atmosphere`;

// --- ХРАНИЛИЩЕ СОСТОЯНИЙ ---
// Хранит: последний топик диалога и режим ожидания кастомного описания
const userState = new Map();
// userState[chatId] = { lastTopic: string, awaitingCustomScene: boolean }

// --- УТИЛИТЫ ---

function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => {
    if (text.includes(word)) score += 1;
  });
  return score;
}

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
  return Buffer.from([0xc0]);
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

// Генерация промпта по теме через GPT
async function buildTopicScenePrompt(topic) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Тема психологической консультации: "${topic}".
Опиши одну краткую сцену (на английском, 1-2 предложения) где женщина-психолог находится в месте, подходящем к этой теме.
Правила:
- Только описание места и атмосферы (не человека)
- Реалистичное, уютное место
- Без слова "psychologist"
- Только текст сцены, без пояснений
Пример: "sitting at outdoor cafe table, warm golden sunlight, cobblestone street background, bokeh background"
Ответ:`
    }],
    temperature: 0.7,
    max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

// Генерация изображения через fal.ai
async function generateImage(chatId, scenePrompt) {
  await bot.sendMessage(chatId, "⏳ Генерирую фото, подождите ~30 секунд...");

  const fullPrompt = `${BASE_PROMPT}, soft natural smile, ${scenePrompt}`;

  const result = await fal.subscribe("fal-ai/flux-lora", {
    input: {
      prompt: fullPrompt,
      loras: [{ path: LORA_URL, scale: 0.85 }],
      num_inference_steps: 35,
      image_size: { width: 1024, height: 1024 },
    },
  });

  const imageUrl = result.data.images[0].url;
  await bot.sendPhoto(chatId, imageUrl, { caption: "✨ Фото Динары" });
  console.log("Photo sent:", imageUrl);
}

// Кнопки выбора фото
function sendPhotoButtons(chatId) {
  return bot.sendMessage(chatId, "📸 Хотите сгенерировать фото?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎯 Близко к теме", callback_data: "photo_topic" }],
        [{ text: "🏠 В кабинете", callback_data: "photo_office" }],
        [{ text: "✏️ Свой вариант", callback_data: "photo_custom" }],
      ],
    },
  });
}

// --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // Режим ожидания кастомного описания сцены
    const state = userState.get(chatId) || {};
    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const customScene = `${text}, bokeh background, photorealistic`;
      await generateImage(chatId, customScene);
      return;
    }

    console.log("Message:", text);

    // Сохраняем тему для кнопки "по теме"
    userState.set(chatId, { lastTopic: text, awaitingCustomScene: false });

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

    // Голос
    const shortPrompt = `Возьми главную мысль из текста ниже и перефразируй в 1-2 коротких предложения.
Требования:
- Строго до 160 символов суммарно
- Спокойный, негромкий тон — как будто говоришь доверительно, не читаешь по бумажке
- Добавь паузу через запятую или тире
- Без вопроса в конце
- Только текст, без пояснений

Текст:
${fullAnswer}

Результат:`;

    const shortCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: shortPrompt }],
      temperature: 0.4,
      max_tokens: 80,
    });

    let shortAnswer = shortCompletion.choices[0].message.content.trim();
    if (shortAnswer.length > 160) {
      shortAnswer = shortAnswer.substring(0, 157) + "...";
    }
    console.log("Short:", shortAnswer, "| Len:", shortAnswer.length);

    const audioBuffer = await generateVoice(shortAnswer);
    await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });
    console.log("Voice sent");

    // Кнопки выбора фото — показываем после голоса
    await sendPhotoButtons(chatId);

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера 😢"); } catch(e) {}
  }
});

// --- ОБРАБОТЧИК КНОПОК ---

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Убираем "часики" с кнопки
  await bot.answerCallbackQuery(query.id);

  try {
    if (data === "photo_topic") {
      const state = userState.get(chatId) || {};
      const topic = state.lastTopic || "психология";
      const scenePrompt = await buildTopicScenePrompt(topic);
      console.log("Topic scene prompt:", scenePrompt);
      await generateImage(chatId, scenePrompt);

    } else if (data === "photo_office") {
      await generateImage(chatId, `sitting in cozy therapist office, bookshelf background,
soft warm lamp light, wooden furniture, indoor plants,
shallow depth of field, bokeh background, warm cozy atmosphere,
wearing elegant professional blouse, warm neutral colors`);

    } else if (data === "photo_custom") {
      const state = userState.get(chatId) || {};
      userState.set(chatId, { ...state, awaitingCustomScene: true });
      await bot.sendMessage(chatId,
        "✏️ Опишите сцену на русском — я переведу и сгенерирую.\n\nНапример: \"я стою на набережной, весна, солнце, синее пальто\""
      );
    }
  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации фото 😢"); } catch(e) {}
  }
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
