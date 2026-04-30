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
  audio: 0.000008,  // $0.008 за 1000 символов
  photo: 0.004,     // $0.004 за фото (FLUX LoRA)
  video: 0.14,      // $0.14 за секунду Aurora 720p
};

// Реальные балансы на 30.04.2026
const BALANCE = {
  audio: 9.93,   // fish.audio
  photo: 16.61,  // fal.ai (фото + видео из одного баланса)
};

const spent = { audio: 0, photo: 0, video: 0 };

function trackCost(type, amount) {
  spent[type] = (spent[type] || 0) + amount;
  const balKey = type === 'video' ? 'photo' : type;
  BALANCE[balKey] = Math.max(0, (BALANCE[balKey] || 0) - amount);
}

function formatCostLine(emoji, label, cost, type) {
  const balKey = type === 'video' ? 'photo' : type;
  const remaining = BALANCE[balKey] || 0;
  const unitsLeft = type === 'audio'
    ? Math.floor(remaining / PRICE.audio / 100) + " аудио"
    : type === 'photo'
    ? Math.floor(remaining / PRICE.photo) + " фото"
    : Math.floor(remaining / (PRICE.video * 5)) + " видео(5сек)";
  return `${emoji} ${label}: $${cost.toFixed(4)}  (баланс $${remaining.toFixed(2)} ≈ ${unitsLeft})`;
}

// --- ПРОМПТ ДЛЯ AURORA ---
const AURORA_PROMPT = "4K studio interview, medium close-up (shoulders-up crop). Solid light-grey seamless backdrop, uniform soft key-light, no lighting change. Presenter faces lens, steady eye-contact. Hands remain below frame, body perfectly still. Ultra-sharp.";

// --- БАЗА ПРОМПТОВ ДЛЯ ИЗОБРАЖЕНИЙ ---
const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
minimal wrinkles, very smooth skin, smooth under eyes,
youthful but mature appearance, 40 years old,
asian features, flat cheekbones, no cheekbones, soft round face,
small nose, almond eyes, upturned eye corners, lifted eye corners,
no drooping eyes, no sad eyes`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

// userState[chatId] = { lastTopic, awaitingCustomScene, lastAudioUrl, lastImageUrl }
const userState = new Map();

// --- УТИЛИТЫ ---

function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => { if (text.includes(word)) score += 1; });
  return score;
}

function writeMsgpack(val) {
  if (typeof val === 'boolean') return Buffer.from([val ? 0xc3 : 0xc2]);
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= 0 && val <= 127) return Buffer.from([val]);
    const b = Buffer.alloc(5); b[0] = 0xd2; b.writeInt32BE(val, 1); return b;
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
    for (const key of keys) { parts.push(writeMsgpack(key)); parts.push(writeMsgpack(val[key])); }
    return Buffer.concat(parts);
  }
  return Buffer.from([0xc0]);
}

// Загружаем mp3-буфер на fal.ai storage → получаем публичный URL
async function uploadAudioToFal(audioBuffer) {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, "voice.mp3");

  const res = await fetch("https://fal.run/storage/upload", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`fal storage upload error: ${await res.text()}`);
  const data = await res.json();
  console.log("Audio uploaded to fal:", data.url);
  return data.url;
}

// Генерация голоса → возвращает { buffer, cost, audioUrl }
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
  const buffer = Buffer.from(await response.arrayBuffer());
  const cost = text.length * PRICE.audio;
  trackCost('audio', cost);

  // Сразу загружаем на fal.ai storage для будущей видеогенерации
  const audioUrl = await uploadAudioToFal(buffer);
  return { buffer, cost, audioUrl };
}

async function buildTopicScenePrompt(topic) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Topic of psychological consultation: "${topic}".
Describe one short scene (in English, 1-2 sentences) where a woman is in a place that fits this topic.
Rules:
- Only place and atmosphere description (no person description)
- Realistic, cozy location
- No word "psychologist"
- Only scene text, no explanations
Example: "sitting at outdoor cafe table, warm golden sunlight, cobblestone street background, bokeh background"
Answer:` }],
    temperature: 0.7,
    max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function translateScene(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Translate this scene description to English for an image generation prompt. Keep it concise, descriptive, location/atmosphere only. No explanations, just the translated description:\n\n${text}` }],
    temperature: 0.3,
    max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

// Генерация фото → возвращает { imageUrl, cost }
async function generateImage(chatId, scenePrompt) {
  await bot.sendMessage(chatId, "⏳ Генерирую фото, подождите ~60 секунд...");

  const fullPrompt = `${BASE_PROMPT}, soft natural smile, ${scenePrompt}`;
  const res = await fetch("https://fal.run/fal-ai/flux-lora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: fullPrompt,
      loras: [{ path: LORA_URL, scale: 0.85 }],
      num_inference_steps: 28,
      image_size: "square_hd",
    }),
  });

  const rawText = await res.text();
  console.log("fal.ai photo status:", res.status);
  if (!res.ok) throw new Error(`fal.ai photo error ${res.status}: ${rawText}`);

  const result = JSON.parse(rawText);
  const imageUrl = result.images[0].url;
  trackCost('photo', PRICE.photo);
  return { imageUrl, cost: PRICE.photo };
}

// Генерация видео Aurora → возвращает { videoUrl, cost, durationSec }
async function generateVideoAurora(chatId, imageUrl, audioUrl) {
  await bot.sendMessage(chatId, "🎬 Генерирую видео Aurora, подождите ~2-3 минуты...");
  console.log("Aurora: image:", imageUrl, "audio:", audioUrl);

  // Шаг 1: отправляем задачу в очередь
  const submitRes = await fetch("https://queue.fal.run/fal-ai/creatify/aurora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: AURORA_PROMPT,
      resolution: "720p",
    }),
  });

  if (!submitRes.ok) throw new Error(`Aurora submit error: ${await submitRes.text()}`);
  const { request_id } = await submitRes.json();
  console.log("Aurora request_id:", request_id);

  // Шаг 2: polling статуса (до 4 минут)
  const statusUrl = `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}/status`;
  const resultUrl = `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`;

  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(statusUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const status = await statusRes.json();
    console.log(`Aurora status [${i + 1}]:`, status.status);

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const result = await resultRes.json();
      const videoUrl = result.video?.url || result.data?.video?.url;
      if (!videoUrl) throw new Error("Aurora: no video URL in response");

      // Примерная стоимость: ~5 секунд × $0.14
      const durationSec = 5;
      const cost = durationSec * PRICE.video;
      trackCost('video', cost);
      return { videoUrl, cost, durationSec };
    }

    if (status.status === "FAILED") throw new Error(`Aurora failed: ${JSON.stringify(status)}`);
  }

  throw new Error("Aurora timeout: generation took too long");
}

// Отправляем фото с кнопкой "🎬 Сделать видео"
async function sendPhotoWithVideoButton(chatId, imageUrl, photoCost) {
  const photoLine = formatCostLine("🖼", "Фото", photoCost, 'photo');

  // Сохраняем URL фото в уникальный ключ для callback
  const photoKey = `photo_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = imageUrl;
  userState.set(chatId, state);

  await bot.sendPhoto(chatId, imageUrl, {
    caption: `✅ Готово\n${photoLine}\n💰 Итого: $${photoCost.toFixed(4)}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎬 Сделать видео из этого фото", callback_data: `make_video:${photoKey}` }],
      ],
    },
  });
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

// --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    // Обработка пересланного/загруженного фото
    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId);
      const imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;

      // Сохраняем URL пересланного фото
      const photoKey = `forwarded_${Date.now()}`;
      if (!state.photos) state.photos = {};
      state.photos[photoKey] = imageUrl;
      userState.set(chatId, state);

      await bot.sendMessage(chatId, "📷 Фото получено! Хотите сделать из него видео?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎬 Сделать видео из этого фото", callback_data: `make_video:${photoKey}` }],
          ],
        },
      });
      return;
    }

    const text = msg.text;
    if (!text) return;

    // Режим ожидания описания сцены
    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const translatedScene = await translateScene(text);
      const customScene = `${translatedScene}, bokeh background, photorealistic`;
      const { imageUrl, cost: photoCost } = await generateImage(chatId, customScene);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithVideoButton(chatId, imageUrl, photoCost);
      return;
    }

    console.log("Message:", text);
    userState.set(chatId, { ...state, lastTopic: text, awaitingCustomScene: false });

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

    const { buffer: audioBuffer, cost: audioCost, audioUrl } = await generateVoice(shortAnswer);
    await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });

    // Сохраняем audioUrl для видеогенерации
    const currentState = userState.get(chatId) || {};
    currentState.lastAudioUrl = audioUrl;
    userState.set(chatId, currentState);

    const audioLine = formatCostLine("🎙", "Аудио", audioCost, 'audio');
    await bot.sendMessage(chatId,
      `✅ Готово\n${audioLine}\n💰 Итого: $${audioCost.toFixed(4)}`);

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
  await bot.answerCallbackQuery(query.id);

  try {
    // --- КНОПКА "СДЕЛАТЬ ВИДЕО" ---
    if (data.startsWith("make_video:")) {
      const photoKey = data.replace("make_video:", "");
      const state = userState.get(chatId) || {};
      const imageUrl = state.photos?.[photoKey];
      const audioUrl = state.lastAudioUrl;

      if (!imageUrl) {
        await bot.sendMessage(chatId, "❌ Фото не найдено. Сгенерируйте новое.");
        return;
      }
      if (!audioUrl) {
        await bot.sendMessage(chatId, "❌ Нет аудио для видео. Сначала напишите запрос — бот сгенерирует текст и аудио.");
        return;
      }

      const { videoUrl, cost: videoCost, durationSec } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      const videoLine = formatCostLine("🎬", `Видео (~${durationSec}сек)`, videoCost, 'video');
      await bot.sendVideo(chatId, videoUrl, {
        caption: `✅ Видео готово!\n${videoLine}\n💰 Итого: $${videoCost.toFixed(4)}`,
      });
      console.log("Video sent:", videoUrl);
      return;
    }

    // --- КНОПКИ ФОТО ---
    if (data === "photo_topic") {
      const state = userState.get(chatId) || {};
      const topic = state.lastTopic || "психология";
      const scenePrompt = await buildTopicScenePrompt(topic);
      const { imageUrl, cost: photoCost } = await generateImage(chatId, scenePrompt);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithVideoButton(chatId, imageUrl, photoCost);

    } else if (data === "photo_office") {
      const { imageUrl, cost: photoCost } = await generateImage(chatId,
        `sitting in cozy therapist office, bookshelf background,
soft warm lamp light, wooden furniture, indoor plants,
shallow depth of field, bokeh background, warm cozy atmosphere,
wearing elegant professional blouse, warm neutral colors`);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithVideoButton(chatId, imageUrl, photoCost);

    } else if (data === "photo_custom") {
      const state = userState.get(chatId) || {};
      userState.set(chatId, { ...state, awaitingCustomScene: true });
      await bot.sendMessage(chatId,
        "✏️ Опишите сцену на русском — я переведу и сгенерирую.\n\nНапример: \"я стою на набережной, весна, солнце, синее пальто\""
      );
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации 😢"); } catch(e) {}
  }
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
