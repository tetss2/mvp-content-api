import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createRequire } from "module";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegPath);

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
console.log(" FFMPEG:", ffmpegPath);

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
no drooping eyes, no sad eyes, bright clear eyes,
subtle gentle closed-mouth smile, calm serene expression, no teeth showing,
soft lips slightly curved, peaceful confident expression`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

// --- БИБЛИОТЕКА МУЗЫКИ ---
// Бесплатные треки с Pixabay (royalty-free, CC0)
// Каждый трек: { name, url, mood, genre }
const MUSIC_LIBRARY = [
  {
    id: "chill1",
    name: "Soft Morning",
    genre: "Chill / Lo-fi",
    mood: "спокойный, мягкий, утренний",
    url: "https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3",
  },
  {
    id: "ambient1",
    name: "Peaceful Mind",
    genre: "Ambient",
    mood: "медитативный, расслабляющий, глубокий",
    url: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3",
  },
  {
    id: "lofi1",
    name: "Gentle Rain",
    genre: "Lo-fi",
    mood: "уютный, дождливый, вдумчивый",
    url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b1a8ade.mp3",
  },
  {
    id: "piano1",
    name: "Inner Calm",
    genre: "Piano / Cinematic",
    mood: "эмоциональный, тёплый, воодушевляющий",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3",
  },
  {
    id: "nature1",
    name: "Forest Whisper",
    genre: "Nature / Ambient",
    mood: "природный, освежающий, заземляющий",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
  },
];

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

async function uploadAudioToCloudinary(audioBuffer, filename = "voice.mp3") {
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary не настроен.");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `audio_${timestamp}`;
  const crypto = await import('crypto');
  const signature = crypto.createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest('hex');
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), filename);
  formData.append("public_id", publicId);
  formData.append("timestamp", timestamp.toString());
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, {
    method: "POST", body: formData,
  });
  const resText = await res.text();
  console.log("Cloudinary upload status:", res.status, resText.substring(0, 200));
  if (!res.ok) throw new Error(`Cloudinary error: ${resText}`);
  const url = JSON.parse(resText).secure_url;
  if (!url) throw new Error("Cloudinary: no URL");
  console.log("Audio uploaded to Cloudinary:", url);
  return url;
}

// Выбирает подходящие треки по смыслу текста через GPT
async function selectMusicTracks(text, count = 3) {
  const libraryDesc = MUSIC_LIBRARY.map(t =>
    `- ID: ${t.id} | Название: "${t.name}" | Жанр: ${t.genre} | Настроение: ${t.mood}`
  ).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `Ты подбираешь фоновую музыку для психологического поста.\n\nТема/текст поста:\n"${text.substring(0, 300)}"\n\nДоступные треки:\n${libraryDesc}\n\nВыбери ${count} наиболее подходящих трека по настроению темы. Верни ТОЛЬКО список ID через запятую, без пояснений.\nПример: chill1,piano1,ambient1` }],
    temperature: 0.3,
    max_tokens: 50,
  });

  const ids = completion.choices[0].message.content.trim().split(',').map(s => s.trim());
  const selected = ids
    .map(id => MUSIC_LIBRARY.find(t => t.id === id))
    .filter(Boolean)
    .slice(0, count);

  // Если GPT вернул что-то неверное — берём первые N треков
  if (selected.length === 0) return MUSIC_LIBRARY.slice(0, count);
  return selected;
}

// Микширует голос (buffer) с фоновой музыкой (URL) через ffmpeg
// Музыка: -18dB (тихий фон), голос: нормальный уровень
// Музыка обрезается по длине голоса + fade out последние 2 сек
async function mixAudioWithMusic(voiceBuffer, musicUrl) {
  const tmp = tmpdir();
  const voicePath = join(tmp, `voice_${Date.now()}.mp3`);
  const outputPath = join(tmp, `mixed_${Date.now()}.mp3`);

  try {
    // Сохраняем голос во временный файл
    await fs.writeFile(voicePath, voiceBuffer);

    // Получаем длину голосового файла через ffprobe
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(voicePath, (err, meta) => {
        if (err) reject(err);
        else resolve(meta.format.duration || 30);
      });
    });

    console.log("Voice duration:", duration, "sec");
    const fadeStart = Math.max(0, duration - 2);

    // Микшируем: голос + музыка с затуханием
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath)
        .input(musicUrl)
        .complexFilter([
          // Музыка: уменьшаем громкость до -18dB (~volume=0.13), обрезаем по длине голоса, fade out
          `[1:a]volume=0.13,atrim=duration=${duration},afade=t=out:st=${fadeStart}:d=2[music]`,
          // Голос: нормальная громкость
          `[0:a]volume=1.0[voice]`,
          // Смешиваем
          `[voice][music]amix=inputs=2:duration=first:dropout_transition=0[out]`,
        ], 'out')
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const mixedBuffer = await fs.readFile(outputPath);
    console.log("Mixed audio size:", mixedBuffer.length, "bytes");
    return mixedBuffer;

  } finally {
    // Чистим временные файлы
    await fs.unlink(voicePath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
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
    messages: [{ role: "user", content: `Topic of psychological consultation: "${topic}".\nDescribe one short scene (in English, 1-2 sentences) where a woman is in a place that fits this topic.\nRules: only place/atmosphere (no person), realistic cozy location, no word "psychologist", only scene text.\nExample: "sitting at outdoor cafe table, warm golden sunlight, cobblestone street background, bokeh background"\nAnswer:` }],
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
  await bot.sendMessage(chatId, "\u23F3 Генерирую фото ~60 сек...");
  const fullPrompt = `${BASE_PROMPT}, ${scenePrompt}`;
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

async function generateVideoAurora(chatId, imageUrl, audioUrl) {
  const statusMsg = await bot.sendMessage(chatId, "\uD83C\uDFAC Шаг 1/3 — Отправляю запрос...");
  const msgId = statusMsg.message_id;

  const submitRes = await fetch("https://queue.fal.run/fal-ai/creatify/aurora", {
    method: "POST",
    headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, prompt: AURORA_PROMPT, resolution: "720p" }),
  });

  const submitText = await submitRes.text();
  console.log("Aurora submit:", submitRes.status, submitText.substring(0, 300));

  if (!submitRes.ok) {
    await bot.editMessageText(`Ошибка запроса (${submitRes.status}):\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora submit error: ${submitText}`);
  }

  let submitData;
  try { submitData = JSON.parse(submitText); } catch(e) {
    await bot.editMessageText(`Неверный ответ:\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora JSON error: ${submitText}`);
  }

  const { request_id, status_url, response_url } = submitData;
  if (!request_id) {
    await bot.editMessageText(`Aurora не вернула request_id`, { chat_id: chatId, message_id: msgId });
    throw new Error("Aurora: no request_id");
  }

  await bot.editMessageText(
    "\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает видео...\n\u23F1 Обычно 2-4 минуты",
    { chat_id: chatId, message_id: msgId }
  );

  const pollUrl = status_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}/status`;
  const resultUrl = response_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`;

  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(pollUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const statusText = await statusRes.text();
    console.log(`Aurora poll [${i+1}] (${statusRes.status}):`, statusText.substring(0, 150));
    if (!statusText.trim()) continue;
    let status;
    try { status = JSON.parse(statusText); } catch(e) { continue; }
    if (i > 0 && i % 6 === 0) {
      const elapsed = Math.round((i + 1) * 5 / 60);
      await bot.editMessageText(
        `\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает...\n\u23F1 Прошло ~${elapsed} мин`,
        { chat_id: chatId, message_id: msgId }
      ).catch(() => {});
    }
    if (status.status === "COMPLETED") {
      await bot.editMessageText("\u2705 Шаг 3/3 — Видео готово!", { chat_id: chatId, message_id: msgId });
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const resultText = await resultRes.text();
      const result = JSON.parse(resultText);
      const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video_url;
      if (!videoUrl) throw new Error(`Aurora: no video URL: ${resultText.substring(0, 200)}`);
      const cost = 5 * PRICE.video;
      trackCost('video', cost);
      return { videoUrl, cost, durationSec: 5 };
    }
    if (status.status === "FAILED") {
      const errMsg = JSON.stringify(status).substring(0, 300);
      await bot.editMessageText(`Aurora ошибка:\n${errMsg}`, { chat_id: chatId, message_id: msgId });
      throw new Error(`Aurora failed: ${errMsg}`);
    }
  }
  await bot.editMessageText("Таймаут видео.", { chat_id: chatId, message_id: msgId });
  throw new Error("Aurora timeout");
}

// --- UI ФУНКЦИИ ---

// Показывает пользователю выбор треков
async function sendMusicSelection(chatId, tracks) {
  const keyboard = tracks.map(t => [
    { text: `\uD83C\uDFB5 ${t.name} — ${t.genre}`, callback_data: `music_pick:${t.id}` }
  ]);
  keyboard.push([{ text: "\u23ED Без музыки", callback_data: "music_skip" }]);
  await bot.sendMessage(chatId,
    "\uD83C\uDFB6 Выберите фоновую музыку для аудио:\n_(Музыка будет тихим фоном под голосом)_",
    { reply_markup: { inline_keyboard: keyboard }, parse_mode: "Markdown" }
  );
}

async function sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt) {
  const photoLine = formatCostLine("\uD83D\uDDBC", "Фото", photoCost, 'photo');
  const photoKey = `photo_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = { imageUrl, scenePrompt };
  state.lastImageUrl = imageUrl;
  state.lastScenePrompt = scenePrompt;
  userState.set(chatId, state);

  await bot.sendPhoto(chatId, imageUrl, {
    caption: `\u2705 ${photoLine}\n\uD83D\uDCB0 $${photoCost.toFixed(4)}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "\uD83D\uDD04 Ещё вариант", callback_data: `regen_photo:${photoKey}` },
          { text: "\uD83C\uDFAC Видео", callback_data: `make_video:${photoKey}` },
        ],
        [{ text: "\uD83D\uDCE4 Опубликовать", callback_data: "open_publish_menu" }],
      ],
    },
  });
}

async function sendVideoWithButtons(chatId, videoUrl, videoCost, durationSec) {
  const videoLine = formatCostLine("\uD83C\uDFAC", `Видео ~${durationSec}с`, videoCost, 'video');
  const videoKey = `video_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  userState.set(chatId, state);

  await bot.sendVideo(chatId, videoUrl, {
    caption: `\u2705 ${videoLine}\n\uD83D\uDCB0 $${videoCost.toFixed(4)}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "\u2705 Выбрать", callback_data: `confirm_video:${videoKey}` },
          { text: "\uD83D\uDD04 Ещё вариант", callback_data: "make_video_again" },
        ],
        [{ text: "\uD83D\uDCE4 Опубликовать", callback_data: "open_publish_menu" }],
      ],
    },
  });
}

function sendAudioChoiceButtons(chatId) {
  return bot.sendMessage(chatId, "\uD83C\uDF99 Выберите аудио:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "\uD83E\uDD16 ИИ-аудио", callback_data: "audio_generate" },
        { text: "\uD83C\uDF99 Своё голосовое", callback_data: "audio_record" },
      ]],
    },
  });
}

async function sendVoiceSelectionMenu(chatId) {
  const state = userState.get(chatId) || {};
  const voices = state.pendingVoices || [];
  if (voices.length === 0) { await bot.sendMessage(chatId, "Нет записанных голосовых."); return; }
  const rows = [];
  for (let i = 0; i < voices.length; i += 2) {
    const row = [{ text: `\u2705 Голосовое ${i + 1}`, callback_data: `confirm_voice:${i}` }];
    if (voices[i + 1]) row.push({ text: `\u2705 Голосовое ${i + 2}`, callback_data: `confirm_voice:${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: "\u2795 Записать ещё", callback_data: "add_more_voice" }]);
  await bot.sendMessage(chatId, `\uD83C\uDF99 Голосовых: ${voices.length}. Выберите нужное:`, { reply_markup: { inline_keyboard: rows } });
}

function sendPhotoButtons(chatId) {
  return bot.sendMessage(chatId, "\uD83D\uDCF8 Сгенерировать фото:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "\uD83C\uDFAF По теме", callback_data: "photo_topic" },
          { text: "\uD83C\uDFE0 Кабинет", callback_data: "photo_office" },
        ],
        [
          { text: "\u270F\uFE0F Свой вариант", callback_data: "photo_custom" },
          { text: "\uD83D\uDCE4 Опубликовать", callback_data: "open_publish_menu" },
        ],
      ],
    },
  });
}

function getPublishButtons(state) {
  const buttons = [];
  const row1 = [];
  if (state.lastImageUrl && state.lastFullAnswer) row1.push({ text: "\uD83D\uDDBC Текст+Фото", callback_data: "publish:text_photo" });
  if (state.lastVideoUrl && state.lastFullAnswer) row1.push({ text: "\uD83C\uDFAC Текст+Видео", callback_data: "publish:text_video" });
  if (row1.length > 0) buttons.push(row1);
  if (state.lastFullAnswer) buttons.push([{ text: "\uD83D\uDCDD Только текст", callback_data: "publish:text_only" }]);
  return buttons;
}

async function sendPublishMenu(chatId) {
  const state = userState.get(chatId) || {};
  const buttons = getPublishButtons(state);
  if (buttons.length === 0) { await bot.sendMessage(chatId, "Нечего публиковать."); return; }
  await bot.sendMessage(chatId, "\uD83D\uDCE4 Формат публикации:", { reply_markup: { inline_keyboard: buttons } });
}

async function showFinalPost(chatId, type) {
  const state = userState.get(chatId) || {};
  const text = state.lastFullAnswer || "";
  const cleanText = text.replace(/[*_]/g, '').substring(0, 1024);
  if (type === "text_photo") {
    if (!state.lastImageUrl) { await bot.sendMessage(chatId, "Нет фото."); return; }
    await bot.sendPhoto(chatId, state.lastImageUrl, { caption: cleanText });
    await bot.sendMessage(chatId, "\u2705 Пост: Текст + Фото\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_video") {
    if (!state.lastVideoUrl) { await bot.sendMessage(chatId, "Нет видео."); return; }
    await bot.sendVideo(chatId, state.lastVideoUrl, { caption: cleanText });
    await bot.sendMessage(chatId, "\u2705 Пост: Текст + Видео\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_only") {
    await bot.sendMessage(chatId, `\uD83D\uDCDD Текст для публикации:\n\n${text}`);
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
      const processingMsg = await bot.sendMessage(chatId, "\u23F3 Загружаю голосовое...");
      const voiceBuffer = Buffer.from(await (await fetch(voiceFileUrl)).arrayBuffer());
      // Для своего голосового — сразу предлагаем музыку
      await bot.editMessageText("\u2705 Голосовое принято!", { chat_id: chatId, message_id: processingMsg.message_id });
      const voices = state.pendingVoices || [];
      voices.push({ voiceBuffer: voiceBuffer.toString('base64') });
      state.pendingVoices = voices;
      state.awaitingVoiceRecord = false;
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
      await bot.sendMessage(chatId, "\uD83D\uDCF7 Фото получено!", {
        reply_markup: { inline_keyboard: [[
          { text: "\uD83C\uDFAC Видео", callback_data: `make_video:${photoKey}` },
          { text: "\uD83D\uDCE4 Опубликовать", callback_data: "open_publish_menu" },
        ]] },
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

    const prompt = `Ты — Динара, практикующий психолог. Пишешь как живой человек, тепло и лично.\n\nСТРУКТУРА — строго 3 абзаца, разделённых пустой строкой:\n1. Первый абзац: эмодзи в начале + признание чувств, покажи что слышишь человека\n2. Второй абзац: инсайт — *выдели ключевую мысль жирным* (через звёздочки *вот так*)\n3. Третий абзац: мягкое направление + один вопрос\n\nОФОРМЛЕНИЕ — строго обязательно:\n- Эмодзи: 4-5 штук, ставь прямо в текст где уместно (не только в начале)\n- Жирный текст: одна ключевая фраза в абзаце 2, через *звёздочки*\n- Тире через — (длинное)\n- Разговорный тон, без канцелярита\n- НЕ используй: списки, решётки #, подчёркивания\n\nЭМОДЗИ — используй только эти (надёжно отображаются в Telegram):\n\u{1F49A} \u{1F499} \u{1F90D} \u{1F9E1} \u{1F49B} \u{1F497} \u{1FAF6} \u{1F331} \u{1F98B} \u{2728} \u{1F525} \u{1F30A} \u{1F33A} \u{1F319} \u{1F4AB}\n\nПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:\n"\u{1F9E1} Знаешь, тревога — это не враг, даже если так ощущается. Она появляется там, где для тебя что-то важно, где есть что терять или о чём заботиться \u{1F90D}\n\n*Тревога сигналит, что ты неравнодушна* — и в этом её смысл, даже когда она мешает жить \u{1F331} Это просто твой внутренний радар, который иногда чуть перегревается. Она не значит, что ты слабая или что всё пойдёт плохо.\n\nПопробуй спросить себя: о чём именно беспокоится эта часть меня? Что сейчас важно? \u{2728} Как ты обычно справляешься, когда тревога накрывает?"\n\nКонтекст:\n${context}\n\nВопрос пользователя:\n${text}\n\nОтвет (строго по структуре, с эмодзи и жирным):`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      max_tokens: 450,
    });

    const fullAnswer = completion.choices[0].message.content;

    await bot.sendMessage(chatId, fullAnswer, { parse_mode: "Markdown" }).catch(async () => {
      await bot.sendMessage(chatId, fullAnswer);
    });

    const shortPrompt = `Возьми главную мысль из текста ниже и перефразируй в 1-2 коротких предложения.\n- До 160 символов\n- Спокойный тон, пауза через запятую или тире\n- Без вопроса, без эмодзи, только текст\n- Убери markdown символы (* и _)\n\nТекст:\n${fullAnswer}\n\nРезультат:`;

    const shortCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: shortPrompt }],
      temperature: 0.4, max_tokens: 80,
    });

    let shortAnswer = shortCompletion.choices[0].message.content.trim().replace(/[*_]/g, '');
    if (shortAnswer.length > 160) shortAnswer = shortAnswer.substring(0, 157) + "...";

    const currentState = userState.get(chatId) || {};
    currentState.lastFullAnswer = fullAnswer;
    currentState.lastShortText = shortAnswer;
    currentState.lastAudioUrl = null;
    currentState.lastVideoUrl = null;
    currentState.pendingVoices = [];
    currentState.awaitingVoiceRecord = false;
    currentState.pendingMusicTracks = null;
    currentState.pendingVoiceBuffer = null;
    userState.set(chatId, currentState);

    // Выбираем треки заранее (в фоне, не ждём)
    selectMusicTracks(fullAnswer).then(tracks => {
      const s = userState.get(chatId) || {};
      s.suggestedTracks = tracks;
      userState.set(chatId, s);
    }).catch(() => {});

    await sendAudioChoiceButtons(chatId);

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера"); } catch(e) {}
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
      if (!scenePrompt) { await bot.sendMessage(chatId, "Не могу воспроизвести сцену."); return; }
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
      if (!videoUrl) { await bot.sendMessage(chatId, "Видео не найдено."); return; }
      const currentState = userState.get(chatId) || {};
      currentState.lastVideoUrl = videoUrl;
      userState.set(chatId, currentState);
      const cleanText = (currentState.lastFullAnswer || "").replace(/[*_]/g, '').substring(0, 1024);
      await bot.sendVideo(chatId, videoUrl, { caption: cleanText });
      await bot.sendMessage(chatId, "\u2705 Видео выбрано! Публиковать?", {
        reply_markup: {
          inline_keyboard: [[
            { text: "\uD83C\uDFAC Текст+Видео", callback_data: "publish:text_video" },
            { text: "\uD83D\uDDBC Текст+Фото", callback_data: "publish:text_photo" },
          ]],
        },
      });
      return;
    }

    if (data === "make_video_again") {
      const imageUrl = state.lastImageUrl;
      const audioUrl = state.lastAudioUrl;
      if (!imageUrl || !audioUrl) { await bot.sendMessage(chatId, "Нет фото или аудио."); return; }
      const { videoUrl, cost: videoCost, durationSec } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost, durationSec);
      return;
    }

    // --- ИИ АУДИО: сначала показываем выбор музыки ---
    if (data === "audio_generate") {
      const shortAnswer = state.lastShortText;
      if (!shortAnswer) { await bot.sendMessage(chatId, "Нет текста для аудио."); return; }

      // Генерируем голос сразу (для скорости)
      const genMsg = await bot.sendMessage(chatId, "\u23F3 Генерирую голос...");
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(shortAnswer);
      await bot.editMessageText("\u2705 Голос готов!", { chat_id: chatId, message_id: genMsg.message_id });

      // Сохраняем буфер и стоимость
      const currentState = userState.get(chatId) || {};
      currentState.pendingVoiceBuffer = audioBuffer.toString('base64');
      currentState.pendingAudioCost = audioCost;
      userState.set(chatId, currentState);

      // Показываем выбор музыки
      const tracks = state.suggestedTracks || MUSIC_LIBRARY.slice(0, 3);
      await sendMusicSelection(chatId, tracks);
      return;
    }

    // --- ВЫБОР МУЗЫКИ ---
    if (data.startsWith("music_pick:")) {
      const musicId = data.replace("music_pick:", "");
      const track = MUSIC_LIBRARY.find(t => t.id === musicId);
      const voiceB64 = state.pendingVoiceBuffer;
      if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса. Попробуйте снова."); return; }

      const voiceBuffer = Buffer.from(voiceB64, 'base64');
      const statusMsg = await bot.sendMessage(chatId, `\uD83C\uDFB5 Микширую с треком "${track?.name || musicId}"...`);

      let finalBuffer;
      try {
        finalBuffer = await mixAudioWithMusic(voiceBuffer, track.url);
        await bot.editMessageText("\u2705 Аудио с музыкой готово!", { chat_id: chatId, message_id: statusMsg.message_id });
      } catch(err) {
        console.error("Mix error:", err.message);
        // Если микширование не удалось — используем чистый голос
        finalBuffer = voiceBuffer;
        await bot.editMessageText("\u26A0\uFE0F Микширование не удалось, используем голос без музыки.", { chat_id: chatId, message_id: statusMsg.message_id });
      }

      // Отправляем результат пользователю
      await bot.sendVoice(chatId, finalBuffer, {}, { filename: "voice_music.mp3", contentType: "audio/mpeg" });

      // Загружаем на Cloudinary
      const uploadMsg = await bot.sendMessage(chatId, "\uD83D\uDD04 Загружаю на сервер...");
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(finalBuffer);
        await bot.editMessageText("\u2705 Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
      } catch(err) {
        console.error("Cloudinary error:", err.message);
        await bot.editMessageText(`Ошибка загрузки: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
      }

      const currentState = userState.get(chatId) || {};
      currentState.lastAudioUrl = audioUrl;
      currentState.pendingVoiceBuffer = null;
      userState.set(chatId, currentState);

      const audioCost = state.pendingAudioCost || 0;
      await bot.sendMessage(chatId, `\u2705 ${formatCostLine("\uD83C\uDF99", "Аудио ИИ", audioCost, 'audio')}`);
      await sendPhotoButtons(chatId);
      return;
    }

    // --- БЕЗ МУЗЫКИ ---
    if (data === "music_skip") {
      const voiceB64 = state.pendingVoiceBuffer;
      if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса. Попробуйте снова."); return; }
      const voiceBuffer = Buffer.from(voiceB64, 'base64');

      await bot.sendVoice(chatId, voiceBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });

      const uploadMsg = await bot.sendMessage(chatId, "\uD83D\uDD04 Загружаю на сервер...");
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(voiceBuffer);
        await bot.editMessageText("\u2705 Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
      } catch(err) {
        await bot.editMessageText(`Ошибка загрузки: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
      }

      const currentState = userState.get(chatId) || {};
      currentState.lastAudioUrl = audioUrl;
      currentState.pendingVoiceBuffer = null;
      userState.set(chatId, currentState);

      const audioCost = state.pendingAudioCost || 0;
      await bot.sendMessage(chatId, `\u2705 ${formatCostLine("\uD83C\uDF99", "Аудио ИИ", audioCost, 'audio')}`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data === "audio_record") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "\uD83C\uDF99 Запишите голосовое.\nМожно несколько — потом выберете лучшее.");
      return;
    }

    if (data === "add_more_voice") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "\uD83C\uDF99 Запишите ещё одно голосовое:");
      return;
    }

    if (data.startsWith("confirm_voice:")) {
      const index = parseInt(data.replace("confirm_voice:", ""));
      const voices = state.pendingVoices || [];
      const chosen = voices[index];
      if (!chosen) { await bot.sendMessage(chatId, "Голосовое не найдено."); return; }

      const currentState = userState.get(chatId) || {};
      // Предлагаем музыку и для своего голосового тоже
      currentState.pendingVoiceBuffer = chosen.voiceBuffer;
      currentState.pendingAudioCost = 0;
      currentState.awaitingVoiceRecord = false;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);

      const tracks = state.suggestedTracks || MUSIC_LIBRARY.slice(0, 3);
      await bot.sendMessage(chatId, `\u2705 Голосовое ${index + 1} выбрано!`);
      await sendMusicSelection(chatId, tracks);
      return;
    }

    if (data.startsWith("make_video:")) {
      const photoKey = data.replace("make_video:", "");
      const photoData = state.photos?.[photoKey];
      const imageUrl = photoData?.imageUrl || (typeof photoData === 'string' ? photoData : null);
      const audioUrl = state.lastAudioUrl;
      if (!imageUrl) { await bot.sendMessage(chatId, "Фото не найдено."); return; }
      if (!audioUrl) { await bot.sendMessage(chatId, "Нет аудио. Сначала выберите аудио."); return; }
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
      await bot.sendMessage(chatId, "\u270F\uFE0F Опишите сцену на русском:\nНапример: \"набережная, весна, солнце, синее пальто\"");
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации"); } catch(e) {}
  }
});

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
