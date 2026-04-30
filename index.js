import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const FAL_KEY = process.env.FALAI_KEY;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

console.log("Bot started in polling mode");
console.log("ENV CHECK:");
console.log(" TELEGRAM_TOKEN:", !!TELEGRAM_TOKEN);
console.log(" OPENAI_API_KEY:", !!OPENAI_API_KEY);
console.log(" FISH_AUDIO_API_KEY:", !!FISH_AUDIO_API_KEY);
console.log(" FALAI_KEY:", !!FAL_KEY, "| Length:", FAL_KEY ? FAL_KEY.length : 0);
console.log(" CLOUDINARY:", !!CLOUDINARY_CLOUD, !!CLOUDINARY_API_KEY, !!CLOUDINARY_API_SECRET);

// --- ТАРИФЫ ---
const PRICE = { audio: 0.000008, photo: 0.004, video: 0.14 };
const BALANCE = { audio: 9.93, photo: 16.61 };
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
    : Math.floor(remaining / (PRICE.video * 5)) + " видео(5с)";
  return `${emoji} ${label}: $${cost.toFixed(4)} (баланс $${remaining.toFixed(2)} ≈ ${unitsLeft})`;
}

// --- ПРОМПТЫ ---

const AURORA_PROMPT = "4K studio interview, medium close-up (shoulders-up crop). Solid light-grey seamless backdrop, uniform soft key-light, no lighting change. Presenter faces lens, steady eye-contact. Hands remain below frame, body perfectly still. Ultra-sharp.";

const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
absolutely no wrinkles, perfectly smooth skin, smooth under eyes, no eye wrinkles,
no crow's feet, no laugh lines, no forehead lines,
youthful appearance, 33 years old, looks young,
asian features, flat cheekbones, no cheekbones, soft round face,
small nose, almond eyes, upturned eye corners, lifted eye corners,
no drooping eyes, no sad eyes, bright clear eyes`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

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

// Загрузка на Cloudinary — постоянное хранение, бесплатно до 25GB
async function uploadAudioToCloudinary(audioBuffer, filename = "voice.mp3") {
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary не настроен. Добавьте CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в Railway Variables.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `audio_${timestamp}`;

  // Подписываем запрос
  const crypto = await import('crypto');
  const signature = crypto.createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest('hex');

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("file", blob, filename);
  formData.append("public_id", publicId);
  formData.append("timestamp", timestamp.toString());
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("signature", signature);
  formData.append("resource_type", "video"); // Cloudinary использует "video" для аудио

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, {
    method: "POST",
    body: formData,
  });

  const resText = await res.text();
  console.log("Cloudinary upload status:", res.status, "body:", resText.substring(0, 200));
  if (!res.ok) throw new Error(`Cloudinary upload error: ${resText}`);

  const data = JSON.parse(resText);
  const url = data.secure_url;
  if (!url) throw new Error(`Cloudinary: no URL in response: ${resText}`);
  console.log("Audio uploaded to Cloudinary:", url);
  return url;
}

async function generateVoice(text) {
  const payload = writeMsgpack({
    text, reference_id: FISH_AUDIO_VOICE_ID,
    format: "mp3", mp3_bitrate: 128, normalize: true, latency: "normal",
  });
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { "Authorization": `Bearer ${FISH_AUDIO_API_KEY}`, "Content-Type": "application/msgpack" },
    body: payload,
  });
  if (!response.ok) throw new Error(`Fish Audio error: ${await response.text()}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const cost = text.length * PRICE.audio;
  trackCost('audio', cost);
  return { buffer, cost };
}

async function buildTopicScenePrompt(topic) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Topic of psychological consultation: "${topic}".
Describe one short scene (in English, 1-2 sentences) where a woman is in a place that fits this topic.
Rules: only place/atmosphere (no person), realistic cozy location, no word "psychologist", only scene text.
Example: "sitting at outdoor cafe table, warm golden sunlight, cobblestone street background, bokeh background"
Answer:` }],
    temperature: 0.7, max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function translateScene(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Translate to English for image prompt. Location/atmosphere only, concise:\n\n${text}` }],
    temperature: 0.3, max_tokens: 80,
  });
  return completion.choices[0].message.content.trim();
}

async function generateImage(chatId, scenePrompt) {
  await bot.sendMessage(chatId, "⏳ Генерирую фото ~60 сек...");
  const fullPrompt = `${BASE_PROMPT}, soft natural smile, ${scenePrompt}`;
  const res = await fetch("https://fal.run/fal-ai/flux-lora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: fullPrompt, loras: [{ path: LORA_URL, scale: 0.85 }], num_inference_steps: 28, image_size: "square_hd" }),
  });
  const rawText = await res.text();
  if (!res.ok) throw new Error(`fal photo error ${res.status}: ${rawText}`);
  const imageUrl = JSON.parse(rawText).images[0].url;
  trackCost('photo', PRICE.photo);
  return { imageUrl, cost: PRICE.photo, scenePrompt };
}

// Aurora — с защитой от пустых ответов
async function generateVideoAurora(chatId, imageUrl, audioUrl) {
  const statusMsg = await bot.sendMessage(chatId, "🎬 Шаг 1/3 — Отправляю запрос...");
  const msgId = statusMsg.message_id;

  console.log("Aurora: image:", imageUrl);
  console.log("Aurora: audio:", audioUrl);

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

  const submitText = await submitRes.text();
  console.log("Aurora submit status:", submitRes.status, "body:", submitText.substring(0, 300));

  if (!submitRes.ok || !submitText.trim()) {
    await bot.editMessageText(`❌ Ошибка отправки запроса (${submitRes.status}):\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora submit error: ${submitText}`);
  }

  let submitData;
  try {
    submitData = JSON.parse(submitText);
  } catch(e) {
    await bot.editMessageText(`❌ Неверный ответ от Aurora:\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora submit JSON parse error: ${submitText}`);
  }

  const request_id = submitData.request_id;
  if (!request_id) {
    await bot.editMessageText(`❌ Aurora не вернула request_id:\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora: no request_id in response`);
  }
  console.log("Aurora request_id:", request_id);

  await bot.editMessageText(
    "⚙️ Шаг 2/3 — Запрос принят, Aurora обрабатывает видео...\n⏱ Обычно 2-4 минуты",
    { chat_id: chatId, message_id: msgId }
  );

  const statusUrl = `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}/status`;
  const resultUrl = `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`;

  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const statusRes = await fetch(statusUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const statusText = await statusRes.text();
    console.log(`Aurora status [${i + 1}] (${statusRes.status}):`, statusText.substring(0, 150));

    if (!statusText.trim()) {
      console.log("Aurora: empty status response, retrying...");
      continue;
    }

    let status;
    try {
      status = JSON.parse(statusText);
    } catch(e) {
      console.log("Aurora: status JSON parse error:", e.message);
      continue;
    }

    if (i > 0 && i % 6 === 0) {
      const elapsed = Math.round((i + 1) * 5 / 60);
      await bot.editMessageText(
        `⚙️ Шаг 2/3 — Aurora обрабатывает...\n⏱ Прошло ~${elapsed} мин, ожидайте ещё 1-2 мин`,
        { chat_id: chatId, message_id: msgId }
      ).catch(() => {});
    }

    if (status.status === "COMPLETED") {
      await bot.editMessageText("✅ Шаг 3/3 — Видео готово! Загружаю...", { chat_id: chatId, message_id: msgId });
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const resultText = await resultRes.text();
      console.log("Aurora result:", resultText.substring(0, 300));
      const result = JSON.parse(resultText);
      const videoUrl = result.video?.url || result.data?.video?.url;
      if (!videoUrl) throw new Error(`Aurora: no video URL. Response: ${resultText.substring(0, 200)}`);
      const durationSec = 5;
      const cost = durationSec * PRICE.video;
      trackCost('video', cost);
      return { videoUrl, cost, durationSec };
    }

    if (status.status === "FAILED") {
      const errMsg = JSON.stringify(status).substring(0, 300);
      await bot.editMessageText(`❌ Aurora не смогла сгенерировать видео.\n${errMsg}`, { chat_id: chatId, message_id: msgId });
      throw new Error(`Aurora failed: ${errMsg}`);
    }
  }

  await bot.editMessageText("⚠️ Таймаут — видео генерировалось слишком долго.", { chat_id: chatId, message_id: msgId });
  throw new Error("Aurora timeout");
}

// --- UI ФУНКЦИИ ---

async function sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt) {
  const photoLine = formatCostLine("🖼", "Фото", photoCost, 'photo');
  const photoKey = `photo_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = { imageUrl, scenePrompt };
  state.lastImageUrl = imageUrl;
  state.lastScenePrompt = scenePrompt;
  userState.set(chatId, state);

  await bot.sendPhoto(chatId, imageUrl, {
    caption: `✅ ${photoLine}\n💰 $${photoCost.toFixed(4)}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔄 Ещё вариант", callback_data: `regen_photo:${photoKey}` },
          { text: "🎬 Видео", callback_data: `make_video:${photoKey}` },
        ],
        [{ text: "📤 Опубликовать", callback_data: "open_publish_menu" }],
      ],
    },
  });
}

async function sendVideoWithButtons(chatId, videoUrl, videoCost, durationSec) {
  const videoLine = formatCostLine("🎬", `Видео ~${durationSec}с`, videoCost, 'video');
  const videoKey = `video_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  userState.set(chatId, state);

  await bot.sendVideo(chatId, videoUrl, {
    caption: `✅ ${videoLine}\n💰 $${videoCost.toFixed(4)}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Выбрать", callback_data: `confirm_video:${videoKey}` },
          { text: "🔄 Ещё вариант", callback_data: "make_video_again" },
        ],
        [{ text: "📤 Опубликовать", callback_data: "open_publish_menu" }],
      ],
    },
  });
}

function sendAudioChoiceButtons(chatId) {
  return bot.sendMessage(chatId, "🎙 Выберите аудио:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "🤖 ИИ-аудио", callback_data: "audio_generate" },
        { text: "🎤 Своё голосовое", callback_data: "audio_record" },
      ]],
    },
  });
}

async function sendVoiceSelectionMenu(chatId) {
  const state = userState.get(chatId) || {};
  const voices = state.pendingVoices || [];
  if (voices.length === 0) { await bot.sendMessage(chatId, "❌ Нет записанных голосовых."); return; }
  const rows = [];
  for (let i = 0; i < voices.length; i += 2) {
    const row = [{ text: `✅ Голосовое ${i + 1}`, callback_data: `confirm_voice:${i}` }];
    if (voices[i + 1]) row.push({ text: `✅ Голосовое ${i + 2}`, callback_data: `confirm_voice:${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: "➕ Записать ещё", callback_data: "add_more_voice" }]);
  await bot.sendMessage(chatId, `🎤 Голосовых: ${voices.length}. Выберите нужное:`, { reply_markup: { inline_keyboard: rows } });
}

function sendPhotoButtons(chatId) {
  return bot.sendMessage(chatId, "📸 Сгенерировать фото:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎯 По теме", callback_data: "photo_topic" },
          { text: "🏠 Кабинет", callback_data: "photo_office" },
        ],
        [
          { text: "✏️ Свой вариант", callback_data: "photo_custom" },
          { text: "📤 Опубликовать", callback_data: "open_publish_menu" },
        ],
      ],
    },
  });
}

function getPublishButtons(state) {
  const buttons = [];
  const row1 = [];
  if (state.lastImageUrl && state.lastFullAnswer) row1.push({ text: "🖼 Текст+Фото", callback_data: "publish:text_photo" });
  if (state.lastVideoUrl && state.lastFullAnswer) row1.push({ text: "🎬 Текст+Видео", callback_data: "publish:text_video" });
  if (row1.length > 0) buttons.push(row1);
  if (state.lastFullAnswer) buttons.push([{ text: "📄 Только текст", callback_data: "publish:text_only" }]);
  return buttons;
}

async function sendPublishMenu(chatId) {
  const state = userState.get(chatId) || {};
  const buttons = getPublishButtons(state);
  if (buttons.length === 0) { await bot.sendMessage(chatId, "❌ Нечего публиковать."); return; }
  await bot.sendMessage(chatId, "📤 Формат публикации:", { reply_markup: { inline_keyboard: buttons } });
}

async function showFinalPost(chatId, type) {
  const state = userState.get(chatId) || {};
  const text = state.lastFullAnswer || "";
  if (type === "text_photo") {
    if (!state.lastImageUrl) { await bot.sendMessage(chatId, "❌ Нет фото."); return; }
    await bot.sendPhoto(chatId, state.lastImageUrl, { caption: text.substring(0, 1024) });
    await bot.sendMessage(chatId, "✅ Пост: Текст + Фото\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_video") {
    if (!state.lastVideoUrl) { await bot.sendMessage(chatId, "❌ Нет видео."); return; }
    await bot.sendVideo(chatId, state.lastVideoUrl, { caption: text.substring(0, 1024) });
    await bot.sendMessage(chatId, "✅ Пост: Текст + Видео\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_only") {
    await bot.sendMessage(chatId, `📄 Текст для публикации:\n\n${text}`);
  }
}

// --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    if (msg.voice) {
      if (!state.awaitingVoiceRecord) return;
      const fileId = msg.voice.file_id;
      const fileInfo = await bot.getFile(fileId);
      const voiceFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const processingMsg = await bot.sendMessage(chatId, "⏳ Загружаю голосовое...");
      const voiceRes = await fetch(voiceFileUrl);
      const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer());

      let audioUrl;
      try {
        audioUrl = await uploadAudioToCloudinary(voiceBuffer, "voice.ogg");
        await bot.editMessageText("✅ Голосовое принято!", { chat_id: chatId, message_id: processingMsg.message_id });
      } catch(err) {
        console.error("Voice upload error:", err.message);
        await bot.editMessageText(`⚠️ Ошибка: ${err.message.substring(0, 100)}`, { chat_id: chatId, message_id: processingMsg.message_id });
        return;
      }

      const voices = state.pendingVoices || [];
      voices.push({ audioUrl });
      state.pendingVoices = voices;
      userState.set(chatId, state);
      await sendVoiceSelectionMenu(chatId);
      return;
    }

    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId);
      const imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const photoKey = `forwarded_${Date.now()}`;
      if (!state.photos) state.photos = {};
      state.photos[photoKey] = { imageUrl, scenePrompt: null };
      state.lastImageUrl = imageUrl;
      userState.set(chatId, state);
      await bot.sendMessage(chatId, "📷 Фото получено!", {
        reply_markup: {
          inline_keyboard: [[
            { text: "🎬 Видео", callback_data: `make_video:${photoKey}` },
            { text: "📤 Опубликовать", callback_data: "open_publish_menu" },
          ]],
        },
      });
      return;
    }

    const text = msg.text;
    if (!text) return;

    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const translatedScene = await translateScene(text);
      const customScene = `${translatedScene}, bokeh background, photorealistic`;
      const { imageUrl, cost: photoCost, scenePrompt } = await generateImage(chatId, customScene);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);
      return;
    }

    console.log("Message:", text);
    userState.set(chatId, { ...state, lastTopic: text, awaitingCustomScene: false });

    const topArticles = articles
      .map(a => ({ ...a, score: scoreArticle(a, text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const context = topArticles.map(a => `Статья: ${a.title}\n${a.content}`).join("\n\n");

    // Правка 3: улучшенный промпт с чётким оформлением
    const prompt = `Ты — Динара, практикующий психолог. Пишешь как живой человек, тепло и лично.

СТРУКТУРА — строго 3 абзаца, разделённых пустой строкой:
1. Первый абзац: начни с эмодзи + признание чувств человека, покажи что слышишь его
2. Второй абзац: инсайт или объяснение — _выдели главную мысль курсивом_ (одинарные подчёркивания вокруг фразы)
3. Третий абзац: мягкое направление + один вопрос в конце

ОФОРМЛЕНИЕ — обязательно:
✦ Эмодзи: 3-4 штуки, по смыслу темы, не все подряд
✦ Курсив: ровно одна фраза во втором абзаце через _вот так_
✦ Тире через «—» (не через дефис)
✦ Разговорный тон, без канцелярита

ЗАПРЕЩЕНО: списки, заголовки, звёздочки **вот так**, решётки

ЭМОДЗИ ДЛЯ ТЕМ:
тревога → 🌿 💙 | грусть/одиночество → 🌧️ 💛 🫶 | отношения → 💕 🌸
злость → 🔥 🌊 | рост/изменения → 🌱 🦋 ✨ | усталость → 🕯️ 🌙

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА (на тему тревоги):
"🌿 Знаешь, тревога — это не враг, даже если так ощущается. Она появляется там, где для тебя что-то важно, где есть что терять или о чём заботиться.

_Тревога сигналит, что ты неравнодушна_ — и в этом её смысл, даже когда она мешает жить. Она не значит, что ты слабая или что всё пойдёт плохо. Это просто твой внутренний радар, который иногда чуть перегревается 💙

Попробуй в следующий раз, когда почувствуешь это, спросить себя: о чём именно беспокоится эта часть меня? Что для меня сейчас важно? Это помогает перейти от ощущения к пониманию. Как ты обычно справляешься, когда тревога накрывает?"

Контекст из базы знаний:
${context}

Вопрос пользователя:
${text}

Ответ (строго по структуре выше):`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      max_tokens: 400,
    });

    const fullAnswer = completion.choices[0].message.content;

    await bot.sendMessage(chatId, fullAnswer, { parse_mode: "Markdown" }).catch(async () => {
      await bot.sendMessage(chatId, fullAnswer);
    });

    const shortPrompt = `Возьми главную мысль из текста ниже и перефразируй в 1-2 коротких предложения.
- До 160 символов
- Спокойный тон, пауза через запятую или тире
- Без вопроса, без эмодзи, только текст

Текст:
${fullAnswer}

Результат:`;

    const shortCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: shortPrompt }],
      temperature: 0.4, max_tokens: 80,
    });

    let shortAnswer = shortCompletion.choices[0].message.content.trim();
    if (shortAnswer.length > 160) shortAnswer = shortAnswer.substring(0, 157) + "...";

    const currentState = userState.get(chatId) || {};
    currentState.lastFullAnswer = fullAnswer;
    currentState.lastShortText = shortAnswer;
    currentState.lastAudioUrl = null;
    currentState.lastVideoUrl = null;
    currentState.pendingVoices = [];
    currentState.awaitingVoiceRecord = false;
    userState.set(chatId, currentState);

    await sendAudioChoiceButtons(chatId);

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
    const state = userState.get(chatId) || {};

    if (data === "open_publish_menu") { await sendPublishMenu(chatId); return; }

    if (data.startsWith("publish:")) {
      await showFinalPost(chatId, data.replace("publish:", ""));
      return;
    }

    if (data.startsWith("regen_photo:")) {
      const photoKey = data.replace("regen_photo:", "");
      const photoData = state.photos?.[photoKey];
      const scenePrompt = photoData?.scenePrompt || state.lastScenePrompt;
      if (!scenePrompt) { await bot.sendMessage(chatId, "❌ Не могу воспроизвести сцену."); return; }
      const { imageUrl, cost: photoCost, scenePrompt: newScene } = await generateImage(chatId, scenePrompt);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, newScene);
      return;
    }

    if (data.startsWith("confirm_video:")) {
      const videoKey = data.replace("confirm_video:", "");
      const videoUrl = state.videos?.[videoKey];
      if (!videoUrl) { await bot.sendMessage(chatId, "❌ Видео не найдено."); return; }
      const currentState = userState.get(chatId) || {};
      currentState.lastVideoUrl = videoUrl;
      userState.set(chatId, currentState);
      const fullText = currentState.lastFullAnswer || "";
      await bot.sendVideo(chatId, videoUrl, { caption: fullText.substring(0, 1024) });
      await bot.sendMessage(chatId, "✅ Видео выбрано! Публиковать?", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎬 Текст+Видео", callback_data: "publish:text_video" },
              { text: "🖼 Текст+Фото", callback_data: "publish:text_photo" },
            ],
            [{ text: "📄 Только текст", callback_data: "publish:text_only" }],
          ],
        },
      });
      return;
    }

    if (data === "make_video_again") {
      const imageUrl = state.lastImageUrl;
      const audioUrl = state.lastAudioUrl;
      if (!imageUrl || !audioUrl) { await bot.sendMessage(chatId, "❌ Нет фото или аудио."); return; }
      const { videoUrl, cost: videoCost, durationSec } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost, durationSec);
      return;
    }

    if (data === "audio_generate") {
      const shortAnswer = state.lastShortText;
      if (!shortAnswer) { await bot.sendMessage(chatId, "❌ Нет текста для аудио."); return; }

      const statusMsg = await bot.sendMessage(chatId, "⏳ Генерирую аудио...");
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(shortAnswer);
      await bot.sendVoice(chatId, audioBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });

      await bot.editMessageText("🔄 Загружаю аудио на сервер...", { chat_id: chatId, message_id: statusMsg.message_id });
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(audioBuffer);
        await bot.editMessageText("✅ Аудио готово для видео!", { chat_id: chatId, message_id: statusMsg.message_id });
      } catch(err) {
        console.error("Cloudinary upload error:", err.message);
        await bot.editMessageText(`⚠️ ${err.message.substring(0, 100)}`, { chat_id: chatId, message_id: statusMsg.message_id });
      }

      const currentState = userState.get(chatId) || {};
      currentState.lastAudioUrl = audioUrl;
      userState.set(chatId, currentState);

      const audioLine = formatCostLine("🎙", "Аудио ИИ", audioCost, 'audio');
      await bot.sendMessage(chatId, `✅ ${audioLine}`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data === "audio_record") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "🎤 Запишите голосовое.\nМожно несколько — потом выберете лучшее.");
      return;
    }

    if (data === "add_more_voice") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "🎤 Запишите ещё одно голосовое:");
      return;
    }

    if (data.startsWith("confirm_voice:")) {
      const index = parseInt(data.replace("confirm_voice:", ""));
      const voices = state.pendingVoices || [];
      const chosen = voices[index];
      if (!chosen) { await bot.sendMessage(chatId, "❌ Голосовое не найдено."); return; }
      const currentState = userState.get(chatId) || {};
      currentState.lastAudioUrl = chosen.audioUrl;
      currentState.awaitingVoiceRecord = false;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, `✅ Голосовое ${index + 1} выбрано.\n✅ Готово для видео!`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data.startsWith("make_video:")) {
      const photoKey = data.replace("make_video:", "");
      const photoData = state.photos?.[photoKey];
      const imageUrl = photoData?.imageUrl || (typeof photoData === 'string' ? photoData : null);
      const audioUrl = state.lastAudioUrl;
      if (!imageUrl) { await bot.sendMessage(chatId, "❌ Фото не найдено."); return; }
      if (!audioUrl) { await bot.sendMessage(chatId, "❌ Нет аудио. Сначала выберите аудио."); return; }
      const currentState = userState.get(chatId) || {};
      currentState.lastImageUrl = imageUrl;
      userState.set(chatId, currentState);
      const { videoUrl, cost: videoCost, durationSec } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost, durationSec);
      return;
    }

    if (data === "photo_topic") {
      const topic = state.lastTopic || "психология";
      const scenePrompt = await buildTopicScenePrompt(topic);
      const { imageUrl, cost: photoCost } = await generateImage(chatId, scenePrompt);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);

    } else if (data === "photo_office") {
      const officeScene = `sitting in cozy therapist office, bookshelf background, soft warm lamp light, wooden furniture, indoor plants, shallow depth of field, bokeh background, warm cozy atmosphere, wearing elegant professional blouse, warm neutral colors`;
      const { imageUrl, cost: photoCost } = await generateImage(chatId, officeScene);
      const newState = userState.get(chatId) || {};
      newState.lastImageUrl = imageUrl;
      userState.set(chatId, newState);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, officeScene);

    } else if (data === "photo_custom") {
      userState.set(chatId, { ...state, awaitingCustomScene: true });
      await bot.sendMessage(chatId, "✏️ Опишите сцену на русском:\nНапример: \"набережная, весна, солнце, синее пальто\"");
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации 😢"); } catch(e) {}
  }
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
