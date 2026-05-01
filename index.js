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
const MUSIC_LIBRARY = [
  { id: "lofi1", name: "Acoustic Breeze", genre: "Lo-fi / Acoustic", mood: "уютный, мечтательный", tags: ["lofi", "chill", "усталость", "принятие"], url: "https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3" },
  { id: "ambient1", name: "Relaxing", genre: "Ambient", mood: "медитативный, спокойный", tags: ["ambient", "тревога", "страх", "принятие"], url: "https://www.bensound.com/bensound-music/bensound-relaxing.mp3" },
  { id: "piano1", name: "Sweet", genre: "Piano / Soft", mood: "нежный, тёплый", tags: ["piano", "отношения", "грусть", "принятие"], url: "https://www.bensound.com/bensound-music/bensound-sweet.mp3" },
  { id: "chill1", name: "Sunny", genre: "Chill / Uplifting", mood: "лёгкий, вдохновляющий", tags: ["chill", "рост"], url: "https://www.bensound.com/bensound-music/bensound-sunny.mp3" },
  { id: "dreamy1", name: "Dreams", genre: "Dreamy / Soft", mood: "воздушный, созерцательный", tags: ["ambient", "грусть", "одиночество", "рост"], url: "https://www.bensound.com/bensound-music/bensound-dreams.mp3" },
  { id: "tender1", name: "Tender", genre: "Cinematic / Piano", mood: "кинематографичный, эмоциональный", tags: ["piano", "грусть", "отношения", "усталость"], url: "https://www.bensound.com/bensound-music/bensound-tender.mp3" },
  { id: "lofi2", name: "Memories", genre: "Lo-fi / Nostalgic", mood: "ностальгический, тёплый", tags: ["lofi", "грусть", "принятие", "одиночество"], url: "https://www.bensound.com/bensound-music/bensound-memories.mp3" },
  { id: "ambient2", name: "Slow Motion", genre: "Ambient / Cinematic", mood: "пространственный, глубокий", tags: ["ambient", "тревога", "страх"], url: "https://www.bensound.com/bensound-music/bensound-slowmotion.mp3" },
  { id: "inspire1", name: "Once Again", genre: "Inspirational / Soft", mood: "вдохновляющий, надежда", tags: ["piano", "рост", "принятие"], url: "https://www.bensound.com/bensound-music/bensound-onceagain.mp3" },
  { id: "folk1", name: "Creative Minds", genre: "Folk / Acoustic", mood: "творческий, живой", tags: ["guitar", "отношения", "рост"], url: "https://www.bensound.com/bensound-music/bensound-creativeminds.mp3" },
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  if (!res.ok) throw new Error(`Cloudinary error: ${resText}`);
  const url = JSON.parse(resText).secure_url;
  if (!url) throw new Error("Cloudinary: no URL");
  console.log("Audio uploaded to Cloudinary:", url);
  return url;
}

async function selectMusicTracks(text, count = 3) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Определи настроение текста для подбора фоновой музыки. Текст:\n"${text.substring(0, 300)}"\n\nВыбери подходящие теги из списка (только из этого списка, через запятую):\nlofi, ambient, piano, guitar, chill, тревога, грусть, одиночество, отношения, злость, рост, усталость, принятие, страх\n\nВерни только теги, без пояснений. Пример: lofi,ambient,тревога` }],
      temperature: 0.3, max_tokens: 50,
    });
    const tags = completion.choices[0].message.content.trim().toLowerCase().split(',').map(s => s.trim());
    console.log("Music tags selected:", tags);
    const matching = MUSIC_LIBRARY.filter(t => t.tags.some(tag => tags.includes(tag)));
    const pool = matching.length >= count ? matching : MUSIC_LIBRARY;
    return shuffleArray(pool).slice(0, count);
  } catch(e) {
    return shuffleArray(MUSIC_LIBRARY).slice(0, count);
  }
}

async function downloadTrack(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.bensound.com/",
      "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.5",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`Track downloaded: ${buffer.length} bytes`);
  return buffer;
}

async function mixAudioWithMusic(voiceBuffer, musicUrl) {
  const tmp = tmpdir();
  const voicePath = join(tmp, `voice_${Date.now()}.mp3`);
  const musicPath = join(tmp, `music_${Date.now()}.mp3`);
  const outputPath = join(tmp, `mixed_${Date.now()}.mp3`);
  try {
    await fs.writeFile(voicePath, voiceBuffer);
    const musicBuffer = await downloadTrack(musicUrl);
    await fs.writeFile(musicPath, musicBuffer);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath).input(musicPath)
        .complexFilter([
          `[1:a]volume=0.13[music_vol]`,
          `[music_vol]apad[music_pad]`,
          `[0:a]volume=1.0[voice]`,
          `[voice][music_pad]amix=inputs=2:duration=first:dropout_transition=2[out]`,
        ], 'out')
        .audioCodec('libmp3lame').audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve).on('error', reject).run();
    });
    const mixedBuffer = await fs.readFile(outputPath);
    console.log("Mixed audio size:", mixedBuffer.length, "bytes");
    return mixedBuffer;
  } finally {
    await fs.unlink(voicePath).catch(() => {});
    await fs.unlink(musicPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

const AUDIO_PRICE_PER_CHAR = 0.000008;

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
  return { buffer, cost: text.length * AUDIO_PRICE_PER_CHAR };
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
  const data = JSON.parse(rawText);
  const imageUrl = data.images[0].url;
  const costHeader = res.headers.get('x-fal-cost') || res.headers.get('x-fal-billing-cost');
  const photoCost = costHeader ? parseFloat(costHeader) : 0.035;
  console.log(`Photo cost: $${photoCost}`);
  return { imageUrl, cost: photoCost, scenePrompt };
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
  await bot.editMessageText("\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает видео...\n\u23F1 Обычно 2-4 минуты", { chat_id: chatId, message_id: msgId });

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
      await bot.editMessageText(`\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает...\n\u23F1 Прошло ~${elapsed} мин`, { chat_id: chatId, message_id: msgId }).catch(() => {});
    }
    if (status.status === "COMPLETED") {
      await bot.editMessageText("\u2705 Шаг 3/3 — Видео готово!", { chat_id: chatId, message_id: msgId });
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const resultText = await resultRes.text();
      const result = JSON.parse(resultText);
      const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video_url;
      if (!videoUrl) throw new Error(`Aurora: no video URL: ${resultText.substring(0, 200)}`);
      let videoCost = result.cost ?? result.data?.cost ?? 1.47;
      if (!videoCost) {
        try {
          const costRes = await fetch(`https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`, { headers: { "Authorization": `Key ${FAL_KEY}` } });
          if (costRes.ok) { const cd = JSON.parse(await costRes.text()); videoCost = cd.cost ?? cd.billing?.cost ?? 1.47; }
        } catch(e) { videoCost = 1.47; }
      }
      console.log(`Video cost: $${videoCost}`);
      return { videoUrl, cost: videoCost };
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

// /start онбординг — 3 шага
async function sendOnboarding(chatId, step = 1) {
  const name = "\u{1F331}"; // росток

  if (step === 1) {
    await bot.sendMessage(chatId,
      `\u{1F331} *Привет! Я — контент-помощник Динары Качаевой*\n\nЯ помогаю создавать профессиональные посты для Instagram и Telegram в стиле психолога.\n\n*Что я умею:*\n\u2728 Генерирую текст в живом стиле психолога\n\uD83C\uDF99 Создаю аудио голосом Динары\n\uD83C\uDFB5 Подбираю фоновую музыку по настроению\n\uD83D\uDDBC Генерирую фото с ИИ\n\uD83C\uDFAC Создаю короткое видео (talking head)\n\uD83D\uDCE4 Готовлю пост к публикации`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "\u27A1\uFE0F Как это работает?", callback_data: "onboard_step2" },
          ]],
        },
      }
    );

  } else if (step === 2) {
    await bot.sendMessage(chatId,
      `\uD83D\uDCA1 *Как это работает:*\n\n*1.* Напишите тему поста — любым словом или фразой\n_Например: "тревога", "страх одиночества", "выгорание"_\n\n*2.* Я сгенерирую текст в стиле Динары\n\n*3.* Выберите голос и музыку для аудио\n\n*4.* Сгенерируйте фото или видео\n\n*5.* Опубликуйте готовый пост \u2705`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "\u2190 Назад", callback_data: "onboard_step1" },
              { text: "\u27A1\uFE0F Попробовать", callback_data: "onboard_step3" },
            ],
          ],
        },
      }
    );

  } else if (step === 3) {
    await bot.sendMessage(chatId,
      `\uD83C\uDF1F *Готово! Давайте начнём*\n\nПросто напишите тему — и я создам пост.\n\n*Примеры тем:*\n\u2022 страх одиночества\n\u2022 как справиться с тревогой\n\u2022 отношения с собой\n\u2022 выгорание на работе\n\u2022 принятие себя\n\nНапишите свою тему прямо сейчас \u{1F447}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "\u2190 Назад", callback_data: "onboard_step2" },
            { text: "\u2139\uFE0F Помощь", callback_data: "show_help" },
          ]],
        },
      }
    );
  }
}

async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `\u2139\uFE0F *Справка*\n\n*Как начать:*\nПросто напишите тему поста — слово или фразу\n\n*Что происходит дальше:*\n\uD83D\uDCDD Текст → выбор аудио → фото → видео → публикация\n\n*Доступные команды:*\n/start — начать заново\n/help — эта справка\n\n*Вопросы?* Напишите @tetss2`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "\uD83D\uDCDD Написать тему", callback_data: "prompt_topic" },
          { text: "\uD83D\uDD04 Начать заново", callback_data: "onboard_step1" },
        ]],
      },
    }
  );
}

async function sendTrackPreview(chatId, tracks, currentIndex = 0) {
  const track = tracks[currentIndex];
  const total = tracks.length;
  const loadMsg = await bot.sendMessage(chatId, `\uD83C\uDFB5 Загружаю трек ${currentIndex + 1} из ${total}...`);
  try {
    const trackBuffer = await downloadTrack(track.url);
    await bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});
    await bot.sendAudio(chatId, trackBuffer, {
      caption: `\uD83C\uDFB5 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "\u2705 Выбрать этот трек", callback_data: `music_confirm:${track.id}` },
            ...(currentIndex + 1 < total ? [{ text: "\u23ED Следующий", callback_data: `music_next:${currentIndex + 1}` }] : []),
          ],
          [{ text: "\u23ED Без музыки", callback_data: "music_skip" }],
        ],
      },
    }, { filename: `${track.id}.mp3`, contentType: "audio/mpeg" });
  } catch(err) {
    console.error("Track preview error:", err.message);
    await bot.editMessageText(
      `\uD83C\uDFB5 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}\n_(превью недоступно)_`,
      {
        chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "\u2705 Выбрать", callback_data: `music_confirm:${track.id}` },
              ...(currentIndex + 1 < total ? [{ text: "\u23ED Следующий", callback_data: `music_next:${currentIndex + 1}` }] : []),
            ],
            [{ text: "\u23ED Без музыки", callback_data: "music_skip" }],
          ],
        },
      }
    ).catch(() => {});
  }
}

async function sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt) {
  const photoKey = `photo_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = { imageUrl, scenePrompt };
  state.lastImageUrl = imageUrl;
  state.lastScenePrompt = scenePrompt;
  userState.set(chatId, state);
  await bot.sendPhoto(chatId, imageUrl, {
    caption: `\u2705 \uD83D\uDDBC Фото сгенерировано\n\uD83D\uDCB0 Стоимость: $${photoCost.toFixed(3)}`,
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

async function sendVideoWithButtons(chatId, videoUrl, videoCost) {
  const videoKey = `video_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  userState.set(chatId, state);
  await bot.sendVideo(chatId, videoUrl, {
    caption: `\u2705 \uD83C\uDFAC Видео сгенерировано\n\uD83D\uDCB0 Стоимость: $${videoCost.toFixed(2)}`,
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

async function processAudioWithTrack(chatId, trackId) {
  const state = userState.get(chatId) || {};
  const track = MUSIC_LIBRARY.find(t => t.id === trackId);
  const voiceB64 = state.pendingVoiceBuffer;
  if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса. Попробуйте снова."); return; }
  const voiceBuffer = Buffer.from(voiceB64, 'base64');
  const statusMsg = await bot.sendMessage(chatId, `\uD83C\uDFB5 Микширую с треком "${track?.name || trackId}"...`);
  let finalBuffer;
  try {
    finalBuffer = await mixAudioWithMusic(voiceBuffer, track.url);
    await bot.editMessageText("\u2705 Аудио с музыкой готово!", { chat_id: chatId, message_id: statusMsg.message_id });
  } catch(err) {
    console.error("Mix error:", err.message);
    finalBuffer = voiceBuffer;
    await bot.editMessageText("\u26A0\uFE0F Микширование не удалось, используем голос без музыки.", { chat_id: chatId, message_id: statusMsg.message_id });
  }
  await bot.sendVoice(chatId, finalBuffer, {}, { filename: "voice_music.mp3", contentType: "audio/mpeg" });
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
  await bot.sendMessage(chatId, `\u2705 \uD83C\uDF99 Аудио ИИ готово\n\uD83D\uDCB0 Стоимость: $${audioCost.toFixed(4)}`);
  await sendPhotoButtons(chatId);
}

// --- КОМАНДЫ ---

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  userState.set(chatId, {}); // сброс состояния
  await sendOnboarding(chatId, 1);
});

bot.onText(/\/help/, async (msg) => {
  await sendHelp(msg.chat.id);
});

// --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    // Пропускаем команды — они обрабатываются выше
    if (msg.text && msg.text.startsWith('/')) return;

    if (msg.voice) {
      if (!state.awaitingVoiceRecord) return;
      const fileId = msg.voice.file_id;
      const fileInfo = await bot.getFile(fileId);
      const voiceFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const processingMsg = await bot.sendMessage(chatId, "\u23F3 Загружаю голосовое...");
      const voiceBuffer = Buffer.from(await (await fetch(voiceFileUrl)).arrayBuffer());
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

    const prompt = `Ты — Динара, практикующий психолог. Пишешь как живой человек, тепло и лично.

СТРУКТУРА — строго 3 абзаца, разделённых пустой строкой:
1. Первый абзац: эмодзи в начале + признание чувств, покажи что слышишь человека
2. Второй абзац: инсайт — *выдели ключевую мысль жирным* (через звёздочки *вот так*)
3. Третий абзац: мягкое направление + один вопрос

ОФОРМЛЕНИЕ — строго обязательно:
- Эмодзи: 4-5 штук, ставь прямо в текст где уместно (не только в начале)
- Жирный текст: одна ключевая фраза в абзаце 2, через *звёздочки*
- Тире через — (длинное)
- Разговорный тон, без канцелярита
- НЕ используй: списки, решётки #, подчёркивания

ЭМОДЗИ — используй только эти (надёжно отображаются в Telegram):
\u{1F49A} \u{1F499} \u{1F90D} \u{1F9E1} \u{1F49B} \u{1F497} \u{1FAF6} \u{1F331} \u{1F98B} \u{2728} \u{1F525} \u{1F30A} \u{1F33A} \u{1F319} \u{1F4AB}

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:
"\u{1F9E1} Знаешь, тревога — это не враг, даже если так ощущается. Она появляется там, где для тебя что-то важно, где есть что терять или о чём заботиться \u{1F90D}

*Тревога сигналит, что ты неравнодушна* — и в этом её смысл, даже когда она мешает жить \u{1F331} Это просто твой внутренний радар, который иногда чуть перегревается. Она не значит, что ты слабая или что всё пойдёт плохо.

Попробуй спросить себя: о чём именно беспокоится эта часть меня? Что сейчас важно? \u{2728} Как ты обычно справляешься, когда тревога накрывает?"

Контекст:
${context}

Вопрос пользователя:
${text}

Ответ (строго по структуре, с эмодзи и жирным):`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75, max_tokens: 450,
    });

    const fullAnswer = completion.choices[0].message.content;

    await bot.sendMessage(chatId, fullAnswer, { parse_mode: "Markdown" }).catch(async () => {
      await bot.sendMessage(chatId, fullAnswer);
    });

    const shortPrompt = `Возьми главную мысль из текста ниже и перефразируй в 1-2 коротких предложения.
- До 160 символов
- Спокойный тон, пауза через запятую или тире
- Без вопроса, без эмодзи, только текст
- Убери markdown символы (* и _)

Текст:
${fullAnswer}

Результат:`;

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
    currentState.pendingVoiceBuffer = null;
    currentState.suggestedTracks = null;
    userState.set(chatId, currentState);

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

    // Онбординг навигация
    if (data === "onboard_step1") { await sendOnboarding(chatId, 1); return; }
    if (data === "onboard_step2") { await sendOnboarding(chatId, 2); return; }
    if (data === "onboard_step3") { await sendOnboarding(chatId, 3); return; }
    if (data === "show_help") { await sendHelp(chatId); return; }
    if (data === "prompt_topic") {
      await bot.sendMessage(chatId, "\uD83D\uDCDD Напишите тему поста — слово или фразу:\n\nНапример: _тревога_, _страх одиночества_, _выгорание_", { parse_mode: "Markdown" });
      return;
    }

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
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
      return;
    }

    if (data === "audio_generate") {
      const shortAnswer = state.lastShortText;
      if (!shortAnswer) { await bot.sendMessage(chatId, "Нет текста для аудио."); return; }
      const genMsg = await bot.sendMessage(chatId, "\u23F3 Генерирую голос...");
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(shortAnswer);
      await bot.editMessageText("\u2705 Голос готов! Выберите фоновую музыку:", { chat_id: chatId, message_id: genMsg.message_id });
      const currentState = userState.get(chatId) || {};
      currentState.pendingVoiceBuffer = audioBuffer.toString('base64');
      currentState.pendingAudioCost = audioCost;
      userState.set(chatId, currentState);
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      const currentStateAfter = userState.get(chatId) || {};
      currentStateAfter.previewTracks = tracks;
      userState.set(chatId, currentStateAfter);
      await sendTrackPreview(chatId, tracks, 0);
      return;
    }

    if (data.startsWith("music_next:")) {
      const nextIndex = parseInt(data.replace("music_next:", ""));
      const tracks = state.previewTracks;
      if (!tracks || nextIndex >= tracks.length) { await bot.sendMessage(chatId, "Треки закончились."); return; }
      await sendTrackPreview(chatId, tracks, nextIndex);
      return;
    }

    if (data.startsWith("music_confirm:")) {
      await processAudioWithTrack(chatId, data.replace("music_confirm:", ""));
      return;
    }

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
      await bot.sendMessage(chatId, `\u2705 \uD83C\uDF99 Аудио ИИ готово\n\uD83D\uDCB0 Стоимость: $${audioCost.toFixed(4)}`);
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
      currentState.pendingVoiceBuffer = chosen.voiceBuffer;
      currentState.pendingAudioCost = 0;
      currentState.awaitingVoiceRecord = false;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      const stateAfter = userState.get(chatId) || {};
      stateAfter.previewTracks = tracks;
      userState.set(chatId, stateAfter);
      await bot.sendMessage(chatId, `\u2705 Голосовое ${index + 1} выбрано! Выберите фоновую музыку:`);
      await sendTrackPreview(chatId, tracks, 0);
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
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, imageUrl, audioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
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
