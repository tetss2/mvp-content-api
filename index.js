import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const FAL_KEY = process.env.FALAI_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

console.log("Bot started in polling mode");
console.log("ENV CHECK:");
console.log(" TELEGRAM_TOKEN:", !!TELEGRAM_TOKEN);
console.log(" OPENAI_API_KEY:", !!OPENAI_API_KEY);
console.log(" FISH_AUDIO_API_KEY:", !!FISH_AUDIO_API_KEY);
console.log(" FALAI_KEY:", !!FAL_KEY, "| Length:", FAL_KEY ? FAL_KEY.length : 0);

// --- ТАРИФЫ ---
const PRICE = {
  audio: 0.000008,   // $0.008 за 1000 символов
  photo: 0.004,      // $0.004 за изображение (FLUX LoRA)
  video: 0.014,      // $0.014 за секунду (Kling LipSync)
};

// Реальные балансы на 30.04.2026
const BALANCE = {
  audio: 9.93,   // fish.audio
  photo: 16.61,  // fal.ai
};

const spent = { audio: 0, photo: 0, video: 0 };

function trackCost(type, amount) {
  spent[type] = (spent[type] || 0) + amount;
  BALANCE[type] = Math.max(0, (BALANCE[type] || 0) - amount);
}

function formatCostLine(emoji, label, cost, type) {
  const remaining = BALANCE[type] || 0;
  const unitsLeft = type === 'audio'
    ? Math.floor(remaining / PRICE.audio / 100) + " аудио"
    : type === 'photo'
    ? Math.floor(remaining / PRICE.photo) + " фото"
    : Math.floor(remaining / PRICE.video / 30) + " видео";
  return `${emoji} ${label}: $${cost.toFixed(4)}  (баланс $${remaining.toFixed(2)} ≈ ${unitsLeft})`;
}

// --- БАЗА ПРОМПТОВ ---

const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
minimal wrinkles, very smooth skin, smooth under eyes,
youthful but mature appearance, 40 years old,
asian features, flat cheekbones, no cheekbones, soft round face,
small nose, almond eyes, upturned eye corners, lifted eye corners,
no drooping eyes, no sad eyes`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

const userState = new Map();

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
  if (typeof val === 'boolean') return Buffer.from([val ? 0xc3 : 0xc2]);
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 0 && val <= 127) return Buffer.from([val]);
    const b = Buffer.alloc(5);
    b[0] = 0xd2;
    b.writeInt32BE(val, 1);
    return b;
  }
  if (typeof val === 'string') {
    const strBuf = Buffer.from(val, 'utf8');
    const len = strBuf.length;
    if (len <= 31) return Buffer.concat([Buffer.from([0xa0 | len]), strBuf]);
    if (len <= 255) return Buffer.concat([Buffer.from([0xd9, len]), strBuf]);
    return Buffer.concat([Buffer.from([0xda, len >> 8, len & 0xff]), strBuf]);
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
    text,
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
  if (!response.ok) throw new Error(`Fish Audio error: ${await response.text()}`);
  const cost = text.length * PRICE.audio;
  trackCost('audio', cost);
  return { buffer: Buffer.from(await response.arrayBuffer()), cost };
}

async function buildTopicScenePrompt(topic) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Topic of psychological consultation: "${topic}".
Describe one short scene (in English, 1-2 sentences) where a woman is in a place that fits this topic.
Rules:
- Only place and atmosphere description (no person description)
- Realistic, cozy location
- No word "psychologist"
- Only scene text, no explanations
Example: "sitting at outdoor cafe table, warm golden sunlight, cobblestone street background, bokeh background"
Answer:`
    }],
    temperature: 0.7,
    max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function translateScene(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `Translate this scene description to English for an image generation prompt. Keep it concise, descriptive, location/atmosphere only. No explanations, just the translated description:\n\n${text}`
    }],
    temperature: 0.3,
    max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function generateImage(chatId, scenePrompt) {
  await bot.sendMessage(chatId, "⏳ Генерирую фото, подождите ~60 секунд...");

  const fullPrompt = `${BASE_PROMPT}, soft natural smile, ${scenePrompt}`;

  const res = await fetch("https://fal.run/fal-ai/flux-lora", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      loras: [{ path: LORA_URL, scale: 0.85 }],
      num_inference_steps: 28,
      image_size: "square_hd",
    }),
  });

  const rawText = await res.text();
  console.log("fal.ai response status:", res.status);
  if (!res.ok) throw new Error(`fal.ai error ${res.status}: ${rawText}`);

  const result = JSON.parse(rawText);
  const imageUrl = result.images[0].url;
  await bot.sendPhoto(chatId, imageUrl);
  console.log("Photo sent:", imageUrl);

  trackCost('photo', PRICE.photo);
  return PRICE.photo;
}

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

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    const state = userState.get(chatId) || {};
    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const translatedScene = await translateScene(text);
      const customScene = `${translatedScene}, bokeh background, photorealistic`;
      const photoCost = await generateImage(chatId, customScene);
      const photoLine = formatCostLine("🖼", "Фото", photoCost, 'photo');
      await bot.sendMessage(chatId,
        `✅ Готово\n${photoLine}\n💰 Итого: $${photoCost.toFixed(4)}`);
      return;
    }

    console.log("Message:", text);
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

    const shortPrompt = `Возьми главную мысль из текста ниже и перефразируй в 1-2 коротких предложения.
Требования:
- Строго до 160 символов суммарно
- Спокойный, негромкий тон
- Добавь паузу через запятую или тире
- Без вопроса в конце
- Только текст

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
    if (shortAnswer.length > 160) shortAnswer = shortAnswer.substring(0, 157) + "...";

    const { buffer: audioBuffer, cost: audioCost } = await generateVoice(shortAnswer);
    await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });

    const audioLine = formatCostLine("🎙", "Аудио", audioCost, 'audio');
    await bot.sendMessage(chatId,
      `✅ Готово\n${audioLine}\n💰 Итого: $${audioCost.toFixed(4)}`);

    await sendPhotoButtons(chatId);

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера 😢"); } catch(e) {}
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  try {
    if (data === "photo_topic") {
      const state = userState.get(chatId) || {};
      const topic = state.lastTopic || "психология";
      const scenePrompt = await buildTopicScenePrompt(topic);
      const photoCost = await generateImage(chatId, scenePrompt);
      const photoLine = formatCostLine("🖼", "Фото", photoCost, 'photo');
      await bot.sendMessage(chatId,
        `✅ Готово\n${photoLine}\n💰 Итого: $${photoCost.toFixed(4)}`);

    } else if (data === "photo_office") {
      const photoCost = await generateImage(chatId, `sitting in cozy therapist office, bookshelf background,
soft warm lamp light, wooden furniture, indoor plants,
shallow depth of field, bokeh background, warm cozy atmosphere,
wearing elegant professional blouse, warm neutral colors`);
      const photoLine = formatCostLine("🖼", "Фото", photoCost, 'photo');
      await bot.sendMessage(chatId,
        `✅ Готово\n${photoLine}\n💰 Итого: $${photoCost.toFixed(4)}`);

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
