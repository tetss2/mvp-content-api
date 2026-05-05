import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

console.log("Bot started in polling mode");
console.log(" TELEGRAM_TOKEN:", !!TELEGRAM_TOKEN);
console.log(" OPENAI_API_KEY:", !!OPENAI_API_KEY);
console.log(" SUPABASE:", !!supabase);

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

// --- СИСТЕМНЫЕ ПРОМПТЫ ---

const PSYCHOLOGIST_SYSTEM_PROMPT = `Ты — Динара Качаева, практикующий психолог. Пишешь как живой человек — тепло, лично, с внутренней глубиной.

КТО ТЫ:
Ты пишешь посты в свой Telegram-канал. Не отвечаешь на вопрос — ты делишься живой мыслью, как будто она только что пришла к тебе. Иногда признаёшься в личном: "я сама долго с этим работала", "не знаю как у вас, а я...". Это создаёт близость.

СТИЛЬ:
— Тёплый разговорный язык, без академизма и канцелярита
— Короткие абзацы, разделённые пустой строкой
— Многоточия для создания паузы и раздумья…
— Длинное тире — вместо короткого
— Иногда начинаешь с обращения: "Дорогие," / "Друзья,"
— Риторические вопросы вовлекают читателя в диалог с собой
— Используешь метафоры: "мы едим и перевариваем эту жизнь", "закопанные радиоактивные отходы", "смотримся в разные зеркала"

ЭМОДЗИ: 💙 🌿 🍀 🌟 💫 🧚‍♀️ 🙏 ❗️ 🟢 🤗 ✨ 🌞 🫶 — 3-5 штук по смыслу.

СТРУКТУРА:
1. Принятие темы / эмпатия
2. Главная мысль — инсайт, метафора, разворот
3. Личный угол или практическая деталь
4. Мягкое завершение или вопрос читателю

ЗАПРЕЩЕНО: нумерованные списки, заголовки, слова "безусловно/следует отметить/таким образом/данный", повторы мысли.

ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы во 2-м абзаце. Эмодзи прямо в тексте.`;

// Стили подачи для сексолога
const SEXOLOGIST_STYLE_INSTRUCTIONS = {
  scientific: `СТИЛЬ ПОДАЧИ: Научный. Опирайся на конкретные исследования, термины, статистику. Академичный но доступный язык. Ссылайся на науку: "исследования показывают", "с точки зрения физиологии".`,
  friendly: `СТИЛЬ ПОДАЧИ: Простой разговорный. Пиши как будто объясняешь подруге — просто, без терминов, с примерами из жизни. Тепло и понятно.`,
  girlfriends: `СТИЛЬ ПОДАЧИ: Разговор подружек. Очень неформально, с юмором, как будто болтаешь с близкой подругой за кофе. Можно лёгкие шутки, разговорные выражения. Никакой официальности.`,
  educational: `СТИЛЬ ПОДАЧИ: Просветительский. Как интересная лекция — увлекательно, с историями, фактами, примерами. Читатель должен узнать что-то новое и удивиться.`,
  auto: `СТИЛЬ ПОДАЧИ: Выбери сам наиболее подходящий стиль для данной темы — между научным и разговорным.`,
};

const SEXOLOGIST_SYSTEM_PROMPT_BASE = `Ты — Динара Качаева, психолог-сексолог. Пишешь о сексуальности научно, но живым человеческим языком — без стыда, без табу, с теплом и уважением к читателю.

КТО ТЫ:
Ты специалист по сексологии. Опираешься на научные знания. Нормализуешь тему, снимаешь стыд и тревогу. Создаёшь безопасное пространство для разговора о сексуальности.

БАЗОВЫЙ СТИЛЬ:
— Профессиональный, но тёплый и человечный
— Без стыда и осуждения — любая тема нормальна
— Короткие абзацы, разделённые пустой строкой
— Многоточия для паузы…
— Длинное тире — вместо короткого
— Иногда начинаешь с "Дорогие," / "Друзья,"

ЭМОДЗИ: 💙 🌿 🌟 💫 🙏 ✨ 🫶 💜 🔬 — 2-4 штуки сдержанно.

СТРУКТУРА:
1. Принятие темы — нормализация, снятие стыда
2. Научный контекст из базы знаний
3. Практический взгляд — как работает в жизни
4. Мягкое завершение или вопрос читателю

ЗАПРЕЩЕНО: нумерованные списки, заголовки, осуждение, слова "безусловно/следует отметить/таким образом", повторы, явно эротический контент.

ВАЖНО: Отвечай строго на основе предоставленного контекста из базы знаний. Не выдумывай факты.

ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы во 2-м абзаце. Эмодзи прямо в тексте.`;

function buildSexologistPrompt(styleKey = "auto") {
  const styleInstruction = SEXOLOGIST_STYLE_INSTRUCTIONS[styleKey] || SEXOLOGIST_STYLE_INSTRUCTIONS.auto;
  return `${SEXOLOGIST_SYSTEM_PROMPT_BASE}\n\n${styleInstruction}`;
}

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

// Темы для быстрого старта (сексология)
const SEXOLOGY_QUICK_TOPICS = [
  "либидо и как на него влиять",
  "оргазм: мифы и реальность",
  "сексуальные фантазии — норма или нет",
  "боль во время секса — что делать",
];

const START_KEYBOARD = {
  keyboard: [[{ text: "\uD83D\uDE80 Старт" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const REMOVE_KEYBOARD = { remove_keyboard: true };

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const userState = new Map();

// --- ПОИСК ---

function scoreArticle(article, query) {
  const text = (article.title + " " + article.content).toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  q.split(" ").forEach(word => { if (text.includes(word)) score += 1; });
  return score;
}

async function vectorSearch(query, scenario, limit = 5) {
  if (!supabase) return null;
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.slice(0, 8000),
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: queryEmbedding,
      match_scenario: scenario,
      match_count: limit,
    });
    if (error) { console.error("Vector search error:", error.message); return null; }
    console.log(`Vector search [${scenario}]: found ${data?.length || 0} chunks`);
    return data;
  } catch (err) {
    console.error("Vector search failed:", err.message);
    return null;
  }
}

// --- УТИЛИТЫ ---

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
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new Error("Cloudinary не настроен.");
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
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: "POST", body: formData });
  const resText = await res.text();
  if (!res.ok) throw new Error(`Cloudinary error: ${resText}`);
  const url = JSON.parse(resText).secure_url;
  if (!url) throw new Error("Cloudinary: no URL");
  return url;
}

async function selectMusicTracks(text, count = 3) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Определи настроение текста для подбора фоновой музыки. Текст:\n"${text.substring(0, 300)}"\n\nВыбери подходящие теги из списка (только из этого списка, через запятую):\nlofi, ambient, piano, guitar, chill, тревога, грусть, одиночество, отношения, злость, рост, усталость, принятие, страх\n\nВерни только теги, без пояснений.` }],
      temperature: 0.3, max_tokens: 50,
    });
    const tags = completion.choices[0].message.content.trim().toLowerCase().split(',').map(s => s.trim());
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.bensound.com/",
      "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.5",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
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
    return await fs.readFile(outputPath);
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
  if (!request_id) { await bot.editMessageText(`Aurora не вернула request_id`, { chat_id: chatId, message_id: msgId }); throw new Error("Aurora: no request_id"); }
  await bot.editMessageText("\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает видео...\n\u23F1 Обычно 2-4 минуты", { chat_id: chatId, message_id: msgId });
  const pollUrl = status_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}/status`;
  const resultUrl = response_url || `https://queue.fal.run/fal-ai/creatify/aurora/requests/${request_id}`;
  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(pollUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
    const statusText = await statusRes.text();
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
      const result = JSON.parse(await resultRes.text());
      const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video_url;
      if (!videoUrl) throw new Error(`Aurora: no video URL`);
      return { videoUrl, cost: result.cost ?? result.data?.cost ?? 1.47 };
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

// ─── UI ФУНКЦИИ ──────────────────────────────────────────────────────────────

// ПРАВКА 1+2: онбординг с кнопками "Пропустить" и "Больше не показывать"
async function sendOnboarding(chatId, step = 1) {
  const skipRow = [
    { text: "⏭ Пропустить", callback_data: "skip_onboarding" },
    { text: "🚫 Больше не показывать", callback_data: "disable_onboarding" },
  ];

  if (step === 1) {
    await bot.sendMessage(chatId,
      `\u{1F331} *Привет! Я — контент-помощник Динары Качаевой*\n\nЯ помогаю создавать профессиональные посты для Instagram и Telegram.\n\n*Что я умею:*\n✨ Генерирую текст в живом стиле психолога\n🎙 Создаю аудио голосом Динары\n🎵 Подбираю фоновую музыку по настроению\n🖼 Генерирую фото с ИИ\n🎬 Создаю короткое видео\n📤 Готовлю пост к публикации`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➡️ Как это работает?", callback_data: "onboard_step2" }],
            skipRow,
          ],
        },
      }
    );
  } else if (step === 2) {
    await bot.sendMessage(chatId,
      `💡 *Как это работает:*\n\n*1.* Напишите тему поста\n*2.* Выберите сценарий: Психолог или Сексолог\n*3.* Выберите длину и стиль\n*4.* Получите готовый текст\n*5.* Добавьте голос, музыку, фото, видео\n*6.* Опубликуйте ✅`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "← Назад", callback_data: "onboard_step1" },
              { text: "➡️ Попробовать", callback_data: "onboard_step3" },
            ],
            skipRow,
          ],
        },
      }
    );
  } else if (step === 3) {
    await sendTopicMenu(chatId);
  }
}

// ПРАВКА 3: меню с темами вместо пустого поля
async function sendTopicMenu(chatId) {
  await bot.sendMessage(chatId,
    `🌟 *Готово! Выберите тему или напишите свою:*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💊 Либидо и как на него влиять", callback_data: "quick_topic:либидо и как на него влиять" },
            { text: "🔥 Оргазм: мифы и реальность", callback_data: "quick_topic:оргазм мифы и реальность" },
          ],
          [
            { text: "💭 Сексуальные фантазии", callback_data: "quick_topic:сексуальные фантазии норма или нет" },
            { text: "⚡ Боль во время секса", callback_data: "quick_topic:боль во время секса что делать" },
          ],
          [{ text: "✏️ Своя тема", callback_data: "prompt_topic" }],
        ],
      },
    }
  );
}

async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `ℹ️ *Справка*\n\n*Как начать:*\nНапишите тему поста — слово или фразу\n\n*Флоу:*\nТема → сценарий → длина → стиль → текст → аудио → фото → видео → публикация\n\n*Вопросы?* Напишите @tetss2`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "📝 Написать тему", callback_data: "prompt_topic" },
          { text: "🔄 Начать заново", callback_data: "onboard_step1" },
        ]],
      },
    }
  );
}

// Выбор сценария
async function sendScenarioChoice(chatId, topic) {
  const state = userState.get(chatId) || {};
  state.pendingTopic = topic;
  userState.set(chatId, state);

  await bot.sendMessage(chatId, `📝 Тема: *${topic}*\n\nКто будет отвечать?`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "🧠 Психолог Динара", callback_data: "scenario_psychologist" },
        { text: "💜 Сексолог Динара", callback_data: "scenario_sexologist" },
      ]],
    },
  });
}

// Выбор длины
async function sendLengthChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);

  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог Динара" : "🧠 Психолог Динара";

  await bot.sendMessage(chatId, `${scenarioLabel}\n\nВыберите длину поста:`, {
    reply_markup: {
      inline_keyboard: [[
        { text: "✂️ Короткий", callback_data: "length_short" },
        { text: "📄 Обычный", callback_data: "length_normal" },
        { text: "📖 Длинный", callback_data: "length_long" },
      ]],
    },
  });
}

// ПРАВКА 5: выбор стиля (только для сексолога)
async function sendStyleChoice(chatId) {
  await bot.sendMessage(chatId, `🎨 *Стиль подачи текста:*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔬 Научный", callback_data: "style_scientific" },
          { text: "💬 Простой", callback_data: "style_friendly" },
        ],
        [
          { text: "👯 Разговор подружек", callback_data: "style_girlfriends" },
          { text: "📚 Просветительский", callback_data: "style_educational" },
        ],
        [{ text: "✨ Авто (бот выберет)", callback_data: "style_auto" }],
      ],
    },
  });
}

async function sendTrackPreview(chatId, tracks, currentIndex = 0) {
  const track = tracks[currentIndex];
  const total = tracks.length;
  const loadMsg = await bot.sendMessage(chatId, `🎵 Загружаю трек ${currentIndex + 1} из ${total}...`);
  try {
    const trackBuffer = await downloadTrack(track.url);
    await bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});
    await bot.sendAudio(chatId, trackBuffer, {
      caption: `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Выбрать этот трек", callback_data: `music_confirm:${track.id}` },
            ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `music_next:${currentIndex + 1}` }] : []),
          ],
          [{ text: "⏭ Без музыки", callback_data: "music_skip" }],
        ],
      },
    }, { filename: `${track.id}.mp3`, contentType: "audio/mpeg" });
  } catch(err) {
    await bot.editMessageText(
      `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}\n_(превью недоступно)_`,
      {
        chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Выбрать", callback_data: `music_confirm:${track.id}` },
              ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `music_next:${currentIndex + 1}` }] : []),
            ],
            [{ text: "⏭ Без музыки", callback_data: "music_skip" }],
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
    caption: `✅ 🖼 Фото сгенерировано\n💰 Стоимость: $${photoCost.toFixed(3)}`,
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

async function sendVideoWithButtons(chatId, videoUrl, videoCost) {
  const videoKey = `video_${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  userState.set(chatId, state);
  await bot.sendVideo(chatId, videoUrl, {
    caption: `✅ 🎬 Видео сгенерировано\n💰 Стоимость: $${videoCost.toFixed(2)}`,
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
        { text: "🎙 Своё голосовое", callback_data: "audio_record" },
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
    const row = [{ text: `✅ Голосовое ${i + 1}`, callback_data: `confirm_voice:${i}` }];
    if (voices[i + 1]) row.push({ text: `✅ Голосовое ${i + 2}`, callback_data: `confirm_voice:${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: "➕ Записать ещё", callback_data: "add_more_voice" }]);
  await bot.sendMessage(chatId, `🎙 Голосовых: ${voices.length}. Выберите нужное:`, { reply_markup: { inline_keyboard: rows } });
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
  if (state.lastFullAnswer) buttons.push([{ text: "📝 Только текст", callback_data: "publish:text_only" }]);
  return buttons;
}

async function sendPublishMenu(chatId) {
  const state = userState.get(chatId) || {};
  const buttons = getPublishButtons(state);
  if (buttons.length === 0) { await bot.sendMessage(chatId, "Нечего публиковать."); return; }
  await bot.sendMessage(chatId, "📤 Формат публикации:", { reply_markup: { inline_keyboard: buttons } });
}

async function showFinalPost(chatId, type) {
  const state = userState.get(chatId) || {};
  const text = state.lastFullAnswer || "";
  const cleanText = text.replace(/[*_]/g, '').substring(0, 1024);
  if (type === "text_photo") {
    if (!state.lastImageUrl) { await bot.sendMessage(chatId, "Нет фото."); return; }
    await bot.sendPhoto(chatId, state.lastImageUrl, { caption: cleanText });
    await bot.sendMessage(chatId, "✅ Пост: Текст + Фото\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_video") {
    if (!state.lastVideoUrl) { await bot.sendMessage(chatId, "Нет видео."); return; }
    await bot.sendVideo(chatId, state.lastVideoUrl, { caption: cleanText });
    await bot.sendMessage(chatId, "✅ Пост: Текст + Видео\nСкопируйте для Instagram/Telegram.");
  } else if (type === "text_only") {
    await bot.sendMessage(chatId, `📝 Текст для публикации:\n\n${text}`);
  }
}

async function processAudioWithTrack(chatId, trackId) {
  const state = userState.get(chatId) || {};
  const track = MUSIC_LIBRARY.find(t => t.id === trackId);
  const voiceB64 = state.pendingVoiceBuffer;
  if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса. Попробуйте снова."); return; }
  const voiceBuffer = Buffer.from(voiceB64, 'base64');
  const statusMsg = await bot.sendMessage(chatId, `🎵 Микширую с треком "${track?.name || trackId}"...`);
  let finalBuffer;
  try {
    finalBuffer = await mixAudioWithMusic(voiceBuffer, track.url);
    await bot.editMessageText("✅ Аудио с музыкой готово!", { chat_id: chatId, message_id: statusMsg.message_id });
  } catch(err) {
    finalBuffer = voiceBuffer;
    await bot.editMessageText("⚠️ Микширование не удалось, используем голос без музыки.", { chat_id: chatId, message_id: statusMsg.message_id });
  }
  await bot.sendVoice(chatId, finalBuffer, {}, { filename: "voice_music.mp3", contentType: "audio/mpeg" });
  const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
  let audioUrl = null;
  try {
    audioUrl = await uploadAudioToCloudinary(finalBuffer);
    await bot.editMessageText("✅ Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
  } catch(err) {
    await bot.editMessageText(`Ошибка загрузки: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
  }
  const currentState = userState.get(chatId) || {};
  currentState.lastAudioUrl = audioUrl;
  currentState.pendingVoiceBuffer = null;
  userState.set(chatId, currentState);
  const audioCost = state.pendingAudioCost || 0;
  await bot.sendMessage(chatId, `✅ 🎙 Аудио ИИ готово\n💰 Стоимость: $${audioCost.toFixed(4)}`);
  await sendPhotoButtons(chatId);
}

// --- ГЕНЕРАЦИЯ ТЕКСТА ---

async function generatePostText(chatId, topic, scenario, lengthMode = "normal", styleKey = "auto") {
  let context = "";
  const chunks = await vectorSearch(topic, scenario, 5);
  if (chunks && chunks.length > 0) {
    context = chunks.map(c => c.chunk_text).join("\n\n");
  } else if (scenario === "psychologist") {
    const topArticles = articles
      .map(a => ({ ...a, score: scoreArticle(a, topic) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    context = topArticles.map(a => `Статья: ${a.title}\n${a.content}`).join("\n\n");
  } else {
    context = "Используй общие знания по данной теме.";
  }

  const tokenLimits = { short: 250, normal: 500, long: 750 };
  const maxTokens = tokenLimits[lengthMode] || 500;

  const lengthInstruction = {
    short: "Напиши КОРОТКИЙ пост: строго 2 абзаца, до 600 символов.",
    normal: "Напиши пост: строго 3-4 абзаца, до 1200 символов.",
    long: "Напиши РАЗВЁРНУТЫЙ пост: 5-6 абзацев, до 1800 символов.",
  }[lengthMode] || "Напиши пост: строго 3-4 абзаца, до 1200 символов.";

  const systemPrompt = scenario === "sexologist"
    ? buildSexologistPrompt(styleKey)
    : PSYCHOLOGIST_SYSTEM_PROMPT;

  const userPrompt = `Тема: "${topic}"\n\nКонтекст из базы знаний:\n${context}\n\n${lengthInstruction} С эмодзи и одной жирной фразой.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.78,
    max_tokens: maxTokens,
  });

  return completion.choices[0].message.content;
}

// ПРАВКА 4+6+7: кнопки после текста с метаданными сценария
async function sendGeneratedText(chatId, text, scenario) {
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";

  await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(async () => {
    await bot.sendMessage(chatId, text);
  });

  // ПРАВКА 7: показываем какой сценарий использовался
  await bot.sendMessage(chatId, `Сгенерировано: *${scenarioLabel}*\n\nЧто дальше?`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✏️ Редактировать", callback_data: "text_edit" },
          { text: "✅ Текст готов", callback_data: "text_ready" },
        ],
        [
          // ПРАВКА 4: новый запрос
          { text: "🔄 Новый запрос", callback_data: "new_topic" },
          // ПРАВКА 6: тот же запрос другой текст
          { text: "♻️ Другой текст", callback_data: "regen_text" },
        ],
      ],
    },
  });
}

// --- КОМАНДЫ ---

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  userState.set(chatId, {});
  await bot.sendMessage(chatId,
    `👋 Добро пожаловать!\n\nЯ — ИИ-помощник для создания контента.\n\nНажмите кнопку ниже чтобы начать 👇`,
    { reply_markup: START_KEYBOARD }
  );
});

bot.onText(/\/help/, async (msg) => {
  await sendHelp(msg.chat.id);
});

// --- ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    if (msg.text && msg.text.startsWith('/')) return;

    if (msg.text === "\uD83D\uDE80 Старт") {
      await bot.sendMessage(chatId, "🌟 Отлично, начинаем!", { reply_markup: REMOVE_KEYBOARD });
      // Если онбординг отключён — сразу к меню тем
      if (state.onboardingDisabled) {
        await sendTopicMenu(chatId);
      } else {
        await sendOnboarding(chatId, 1);
      }
      return;
    }

    if (msg.voice) {
      if (!state.awaitingVoiceRecord) return;
      const fileId = msg.voice.file_id;
      const fileInfo = await bot.getFile(fileId);
      const voiceFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
      const processingMsg = await bot.sendMessage(chatId, "⏳ Загружаю голосовое...");
      const voiceBuffer = Buffer.from(await (await fetch(voiceFileUrl)).arrayBuffer());
      await bot.editMessageText("✅ Голосовое принято!", { chat_id: chatId, message_id: processingMsg.message_id });
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
      await bot.sendMessage(chatId, "📷 Фото получено!", {
        reply_markup: { inline_keyboard: [[
          { text: "🎬 Видео", callback_data: `make_video:${photoKey}` },
          { text: "📤 Опубликовать", callback_data: "open_publish_menu" },
        ]] },
      });
      return;
    }

    const text = msg.text;
    if (!text) return;

    if (state.awaitingTextEdit) {
      const currentState = userState.get(chatId) || {};
      currentState.lastFullAnswer = text;
      currentState.awaitingTextEdit = false;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "✅ Текст обновлён!");
      await sendGeneratedText(chatId, text, currentState.lastScenario);
      return;
    }

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

    // Новая тема
    console.log("New topic:", text);
    await sendScenarioChoice(chatId, text);

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

    // ─── ОНБОРДИНГ ────────────────────────────────────────────────────────────
    if (data === "onboard_step1") { await sendOnboarding(chatId, 1); return; }
    if (data === "onboard_step2") { await sendOnboarding(chatId, 2); return; }
    if (data === "onboard_step3") { await sendOnboarding(chatId, 3); return; }

    // ПРАВКА 1+2: пропустить / отключить онбординг
    if (data === "skip_onboarding") {
      await sendTopicMenu(chatId);
      return;
    }
    if (data === "disable_onboarding") {
      const currentState = userState.get(chatId) || {};
      currentState.onboardingDisabled = true;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "✅ Обучение отключено. Теперь буду сразу показывать меню тем.");
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "show_help") { await sendHelp(chatId); return; }

    if (data === "prompt_topic") {
      await bot.sendMessage(chatId, "📝 Напишите тему поста — слово или фразу:\n\nНапример: _тревога_, _страх одиночества_, _выгорание_", { parse_mode: "Markdown" });
      return;
    }

    // ПРАВКА 3: быстрые темы
    if (data.startsWith("quick_topic:")) {
      const topic = data.replace("quick_topic:", "");
      await sendScenarioChoice(chatId, topic);
      return;
    }

    // ─── ВЫБОР СЦЕНАРИЯ ───────────────────────────────────────────────────────
    if (data === "scenario_psychologist" || data === "scenario_sexologist") {
      const scenario = data.replace("scenario_", "");
      await sendLengthChoice(chatId, scenario);
      return;
    }

    // ─── ВЫБОР ДЛИНЫ ──────────────────────────────────────────────────────────
    if (data === "length_short" || data === "length_normal" || data === "length_long") {
      const lengthMode = data.replace("length_", "");
      const currentState = userState.get(chatId) || {};
      currentState.pendingLengthMode = lengthMode;
      userState.set(chatId, currentState);

      const scenario = state.pendingScenario || "psychologist";

      // ПРАВКА 5: для сексолога показываем выбор стиля
      if (scenario === "sexologist") {
        await sendStyleChoice(chatId);
      } else {
        // Для психолога — сразу генерируем
        await runGeneration(chatId, scenario, lengthMode, "auto");
      }
      return;
    }

    // ПРАВКА 5: выбор стиля для сексолога
    if (data.startsWith("style_")) {
      const styleKey = data.replace("style_", "");
      const scenario = state.pendingScenario || "sexologist";
      const lengthMode = state.pendingLengthMode || "normal";
      await runGeneration(chatId, scenario, lengthMode, styleKey);
      return;
    }

    // ─── КНОПКИ ПОСЛЕ ТЕКСТА ──────────────────────────────────────────────────

    if (data === "text_edit") {
      const currentText = state.lastFullAnswer || "";
      const cleanText = currentText.replace(/[*_]/g, '');
      const currentState = userState.get(chatId) || {};
      currentState.awaitingTextEdit = true;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, cleanText, {
        reply_markup: { force_reply: true, input_field_placeholder: "Отредактируйте текст и отправьте..." },
      });
      return;
    }

    if (data === "text_ready") {
      await bot.sendMessage(chatId, "✅ Отлично! Теперь выберите аудио для поста:");
      await sendAudioChoiceButtons(chatId);
      return;
    }

    // ПРАВКА 4: новый запрос — сбросить и показать меню тем
    if (data === "new_topic") {
      const currentState = userState.get(chatId) || {};
      const onboardingDisabled = currentState.onboardingDisabled;
      userState.set(chatId, { onboardingDisabled });
      await sendTopicMenu(chatId);
      return;
    }

    // ПРАВКА 6: тот же запрос, другой текст
    if (data === "regen_text") {
      const topic = state.lastTopic;
      const scenario = state.lastScenario || "psychologist";
      const lengthMode = state.lastLengthMode || "normal";
      const styleKey = state.lastStyleKey || "auto";
      if (!topic) { await bot.sendMessage(chatId, "Тема не найдена. Напишите тему заново."); return; }
      await runGeneration(chatId, scenario, lengthMode, styleKey);
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
      await bot.sendMessage(chatId, "✅ Видео выбрано! Публиковать?", {
        reply_markup: {
          inline_keyboard: [[
            { text: "🎬 Текст+Видео", callback_data: "publish:text_video" },
            { text: "🖼 Текст+Фото", callback_data: "publish:text_photo" },
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
      const genMsg = await bot.sendMessage(chatId, "⏳ Генерирую голос...");
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(shortAnswer);
      await bot.editMessageText("✅ Голос готов! Выберите фоновую музыку:", { chat_id: chatId, message_id: genMsg.message_id });
      const currentState = userState.get(chatId) || {};
      currentState.pendingVoiceBuffer = audioBuffer.toString('base64');
      currentState.pendingAudioCost = audioCost;
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      currentState.previewTracks = tracks;
      userState.set(chatId, currentState);
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
      const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(voiceBuffer);
        await bot.editMessageText("✅ Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
      } catch(err) {
        await bot.editMessageText(`Ошибка загрузки: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
      }
      const currentState = userState.get(chatId) || {};
      currentState.lastAudioUrl = audioUrl;
      currentState.pendingVoiceBuffer = null;
      userState.set(chatId, currentState);
      const audioCost = state.pendingAudioCost || 0;
      await bot.sendMessage(chatId, `✅ 🎙 Аудио ИИ готово\n💰 Стоимость: $${audioCost.toFixed(4)}`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data === "audio_record") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      currentState.pendingVoices = [];
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "🎙 Запишите голосовое.\nМожно несколько — потом выберете лучшее.");
      return;
    }

    if (data === "add_more_voice") {
      const currentState = userState.get(chatId) || {};
      currentState.awaitingVoiceRecord = true;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, "🎙 Запишите ещё одно голосовое:");
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
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      currentState.previewTracks = tracks;
      userState.set(chatId, currentState);
      await bot.sendMessage(chatId, `✅ Голосовое ${index + 1} выбрано! Выберите фоновую музыку:`);
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
      await bot.sendMessage(chatId, "✏️ Опишите сцену на русском:\nНапример: \"набережная, весна, солнце, синее пальто\"");
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации"); } catch(e) {}
  }
});

// ─── ВЫНЕСЕННАЯ ФУНКЦИЯ ГЕНЕРАЦИИ ────────────────────────────────────────────

async function runGeneration(chatId, scenario, lengthMode, styleKey) {
  const state = userState.get(chatId) || {};
  const topic = state.pendingTopic;
  if (!topic) { await bot.sendMessage(chatId, "Тема не найдена. Напишите тему заново."); return; }

  const labelMap = { short: "короткий", normal: "обычный", long: "длинный" };
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";
  const genMsg = await bot.sendMessage(chatId, `⏳ Генерирую ${labelMap[lengthMode]} пост [${scenarioLabel}] по теме "${topic}"...`);

  const fullAnswer = await generatePostText(chatId, topic, scenario, lengthMode, styleKey);

  await bot.deleteMessage(chatId, genMsg.message_id).catch(() => {});

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
  currentState.lastTopic = topic;
  currentState.lastScenario = scenario;
  currentState.lastLengthMode = lengthMode;
  currentState.lastStyleKey = styleKey;
  currentState.lastAudioUrl = null;
  currentState.lastVideoUrl = null;
  currentState.pendingVoices = [];
  currentState.awaitingVoiceRecord = false;
  currentState.pendingVoiceBuffer = null;
  currentState.suggestedTracks = null;
  currentState.awaitingTextEdit = false;
  userState.set(chatId, currentState);

  selectMusicTracks(fullAnswer).then(tracks => {
    const s = userState.get(chatId) || {};
    s.suggestedTracks = tracks;
    userState.set(chatId, s);
  }).catch(() => {});

  await sendGeneratedText(chatId, fullAnswer, scenario);
}

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
