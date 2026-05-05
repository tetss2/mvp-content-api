import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const ffmpegPath = "ffmpeg";
import ffmpeg from "fluent-ffmpeg";

ffmpeg.setFfmpegPath(ffmpegPath);

const __dirname = dirname(fileURLToPath(import.meta.url));
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
const LEADS_BOT_TOKEN = process.env.LEADS_BOT_TOKEN;
const TG_CHANNEL = process.env.TG_CHANNEL; // chat_id канала, напр. -1001234567890
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY;
const ADMIN_TG_ID = 109664871;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const articles = require("./articles.production.json");

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

console.log("Bot started");
console.log(" TELEGRAM_TOKEN:", !!TELEGRAM_TOKEN);
console.log(" OPENAI_API_KEY:", !!OPENAI_API_KEY);
console.log(" SUPABASE:", !!supabase);
console.log(" LEADS_BOT_TOKEN:", !!LEADS_BOT_TOKEN);
console.log(" TG_CHANNEL:", TG_CHANNEL || "NOT SET");

// ─── ДЕМО-ДОСТУП ─────────────────────────────────────────────────────────────

const DEMO_DB_PATH = join(__dirname, "demo-users.json");

async function loadDemoDB() {
  try {
    const raw = await fs.readFile(DEMO_DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch { return { users: {} }; }
}

async function saveDemoDB(db) {
  await fs.writeFile(DEMO_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

async function getDemoUserByTgId(tgId) {
  const db = await loadDemoDB();
  return Object.values(db.users).find(u => u.tg_id === tgId) || null;
}

async function checkDemoAccess(chatId) {
  if (chatId === ADMIN_TG_ID) return { allowed: true, user: null };
  const user = await getDemoUserByTgId(chatId);
  if (!user) return { allowed: false, reason: "not_registered" };

  const now = new Date();

  if (!user.activated_at) {
    const db = await loadDemoDB();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    db.users[user.phone].activated_at = now.toISOString();
    db.users[user.phone].expires_at = expires.toISOString();
    await saveDemoDB(db);
    user.activated_at = now.toISOString();
    user.expires_at = expires.toISOString();
  }

  if (user.expires_at && new Date(user.expires_at) < now) {
    return { allowed: false, reason: "expired", user };
  }

  return { allowed: true, user };
}

async function checkLimit(chatId, limitType) {
  const access = await checkDemoAccess(chatId);
  if (!access.allowed) return { ok: false, reason: access.reason, user: access.user };

  // Админ — без лимитов
  const user = access.user;
  if (!user) return { ok: true, user: null };

  const limit = user.limits[limitType];
  if (!limit) return { ok: true, user };

  if (limit.used >= limit.max) {
    return { ok: false, reason: "limit_exhausted", limitType, user };
  }
  return { ok: true, user };
}

async function incrementLimit(chatId, limitType, scenario, lengthMode) {
  const db = await loadDemoDB();
  const user = Object.values(db.users).find(u => u.tg_id === chatId);
  if (!user) return;

  db.users[user.phone].limits[limitType].used += 1;
  if (!db.users[user.phone].events) db.users[user.phone].events = [];
  db.users[user.phone].events.push({
    ts: new Date().toISOString(),
    scenario: scenario || "unknown",
    action: `generate_${limitType}`,
    length: lengthMode || null,
  });
  if (db.users[user.phone].events.length > 50) {
    db.users[user.phone].events = db.users[user.phone].events.slice(-50);
  }
  await saveDemoDB(db);
}

async function notifyLeadsBot(text, keyboard = null) {
  if (!LEADS_BOT_TOKEN) return;
  try {
    const body = { chat_id: ADMIN_TG_ID, text, parse_mode: "Markdown" };
    if (keyboard) body.reply_markup = JSON.stringify(keyboard);
    await fetch(`https://api.telegram.org/bot${LEADS_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Leads bot notify error:", e.message);
  }
}

async function handleLimitExhausted(chatId, limitType, user) {
  const labelMap = { text: "📝 Тексты", photo: "🖼 Фото", video: "🎬 Видео" };
  const label = labelMap[limitType] || limitType;

  await bot.sendMessage(chatId,
    `🚫 *Лимит исчерпан*\n\n${label}: использовано ${user.limits[limitType].used}/${user.limits[limitType].max}\n\nДля увеличения лимита нажмите кнопку:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "📩 Запросить увеличение лимита", callback_data: `req_limit_${limitType}` },
      ]]},
    }
  );

  await notifyLeadsBot(
    `⚠️ *Лимит исчерпан*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n🚫 Исчерпан: *${label}*`,
    { inline_keyboard: [[{ text: "💬 Написать пользователю", url: `tg://user?id=${user.tg_id}` }]] }
  );
}

async function handleNotRegistered(chatId) {
  await bot.sendMessage(chatId,
    `🔐 *Доступ закрыт*\n\nДля использования бота необходимо получить демо-доступ.\n\nОбратитесь к администратору: @tetss2`,
    { parse_mode: "Markdown" }
  );
}

async function handleExpired(chatId, user) {
  await bot.sendMessage(chatId,
    `⏰ *Срок демо-доступа истёк*\n\nВаш 7-дневный демо-период завершён.\n\n` +
    `📊 Итого использовано:\n` +
    `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
    `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
    `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}\n\n` +
    `Для продления обратитесь к администратору:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "📩 Запросить продление", callback_data: "req_extend" },
        { text: "💬 Написать @tetss2", url: "https://t.me/tetss2" },
      ]]},
    }
  );
}

// ─── ПУБЛИКАЦИЯ В КАНАЛ ───────────────────────────────────────────────────────

async function publishToChannel(type, state) {
  if (!TG_CHANNEL) {
    console.error("TG_CHANNEL не задан в переменных Railway");
    return { ok: false, error: "Канал не настроен" };
  }

  const text = state.lastFullAnswer || "";
  const cleanFull = text.replace(/[*_]/g, '');

  try {
    if (type === "text_photo" && state.lastImageUrl) {
      await bot.sendPhoto(TG_CHANNEL, state.lastImageUrl, { caption: cleanFull });
    } else if (type === "text_video" && state.lastVideoUrl) {
      await bot.sendVideo(TG_CHANNEL, state.lastVideoUrl, { caption: cleanFull });
    } else {
      await bot.sendMessage(TG_CHANNEL, text.substring(0, 4096));
    }
    return { ok: true };
  } catch (err) {
    console.error("Publish to channel error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ─── СИСТЕМНЫЕ ПРОМПТЫ ───────────────────────────────────────────────────────

const AURORA_PROMPT = "4K studio interview, medium close-up. Solid light-grey seamless backdrop, uniform soft key-light. Presenter faces lens, steady eye-contact. Hands below frame, body still. Ultra-sharp.";

const BASE_PROMPT = `portrait of dinara_psych woman, professional psychologist,
fair light skin tone, soft warm skin, dark straight hair, photorealistic,
absolutely no wrinkles, perfectly smooth skin, youthful appearance, 33 years old,
asian features, soft round face, small nose, almond eyes, upturned eye corners,
subtle gentle closed-mouth smile, calm serene expression`;

const LORA_URL = "https://v3b.fal.media/files/b/0a972654/A_18FqqSaUR0LlZegGtS0_pytorch_lora_weights.safetensors";

const PSYCHOLOGIST_SYSTEM_PROMPT = `Ты — Динара Качаева, практикующий психолог. Пишешь как живой человек — тепло, лично, с внутренней глубиной.

КТО ТЫ:
Пишешь посты в Telegram-канал. Делишься живой мыслью, как будто она только что пришла. Признаёшься в личном: "я сама долго с этим работала", "не знаю как у вас, а я...".

СТИЛЬ:
— Тёплый разговорный язык, без академизма
— Короткие абзацы, разделённые пустой строкой
— Многоточия для паузы и раздумья…
— Длинное тире — вместо короткого
— Иногда начинаешь с "Дорогие," / "Друзья,"
— Риторические вопросы вовлекают читателя
— Метафоры: "мы едим и перевариваем эту жизнь", "смотримся в разные зеркала"

ЭМОДЗИ: Используй ОБЯЗАТЕЛЬНО 10-15 эмодзи в тексте, расставляй их щедро по всему тексту!
Доступные: 💙 🌿 🍀 🌟 💫 🧚‍♀️ 🙏 ❗️ 🟢 🤗 ✨ 🌞 🫶 💛 🌸 🦋 🌈 💝 🔥 👀 💭 🌻 🪴 💪 🎯

СТРУКТУРА:
1. Принятие темы / эмпатия
2. Главная мысль — инсайт, метафора, разворот
3. Личный угол или практическая деталь
4. Мягкое завершение или вопрос читателю

ЗАПРЕЩЕНО: нумерованные списки, заголовки, слова "безусловно/следует отметить/таким образом/данный", повторы.
ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы. Эмодзи щедро по всему тексту — минимум 10 штук!`;

// ─── СТИЛИ СЕКСОЛОГА ─────────────────────────────────────────────────────────

const SEXOLOGIST_STYLE_META = {
  scientific: {
    label: "🔬 Научный",
    hint: "Термины, исследования, физиология — академично но доступно",
    instruction: `СТИЛЬ: Строго научный. Используй термины, ссылайся на исследования: "исследования показывают", "с точки зрения физиологии", "согласно научным данным". Академичный тон. Структурированно. Никакого юмора — только факты и наука. Текст должен звучать как статья в научно-популярном журнале.`,
  },
  friendly: {
    label: "💬 Простой",
    hint: "Как объяснение подруге — без терминов, с примерами из жизни",
    instruction: `СТИЛЬ: Максимально простой и понятный. Объясняй как будто подруге — никаких терминов, всё через примеры из жизни. "Представь что...", "Это как когда...". Тепло и просто. Никакой науки — только жизнь.`,
  },
  girlfriends: {
    label: "👯 Разговор подружек",
    hint: "Неформально, с юмором — как болтовня за кофе!",
    instruction: `СТИЛЬ: Разговор близких подружек! Максимально неформально, живо, с юмором и восклицаниями! "Ой, это вообще огонь!", "Слушай, ну ты знаешь как это бывает!", "Девочки, давайте честно!", "Это вообще тема!". Смеёмся вместе, поддерживаем друг друга. Никакой официальности — только живой болтливый разговор за чашкой кофе! Можно использовать разговорные слова и лёгкий сленг.`,
  },
  educational: {
    label: "📚 Просветительский",
    hint: "Как интересный подкаст — увлекательно, с фактами и историями",
    instruction: `СТИЛЬ: Просветительский — как захватывающий подкаст или TED-talk. "А знаешь ли ты что...", "Это удивительно, но...", "История об этом началась...". Увлекательно, с интересными фактами, историями, неожиданными поворотами. Читатель должен воскликнуть "Ого, я этого не знала!". Интригующее начало, интересные факты, вдохновляющий конец.`,
  },
  auto: {
    label: "✨ Авто",
    hint: "Бот выберет лучший стиль для темы",
    instruction: `СТИЛЬ: Выбери наиболее подходящий стиль для данной темы.`,
  },
};

const SEXOLOGIST_SYSTEM_PROMPT_BASE = `Ты — Динара Качаева, психолог-сексолог. Пишешь о сексуальности без стыда, без табу, с теплом и уважением.

КТО ТЫ:
Специалист по сексологии. Нормализуешь тему, снимаешь стыд. Создаёшь безопасное пространство.

БАЗОВЫЙ СТИЛЬ:
— Без осуждения — любая тема нормальна
— Короткие абзацы, разделённые пустой строкой
— Длинное тире — вместо короткого

ЭМОДЗИ: Используй ОБЯЗАТЕЛЬНО 10-15 эмодзи, расставляй щедро по всему тексту!
Доступные: 💙 🌿 🌟 💫 🙏 ✨ 🫶 💜 🔬 💝 🌸 🔥 👀 💭 💪 🎯 ❗️ 🤗 🌈

СТРУКТУРА:
1. Принятие темы — нормализация, снятие стыда
2. Контекст из базы знаний
3. Практический взгляд
4. Мягкое завершение или вопрос

ЗАПРЕЩЕНО: нумерованные списки, заголовки, осуждение, повторы, явно эротический контент.
ВАЖНО: Отвечай строго на основе контекста из базы знаний. Не выдумывай факты.
ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы. Минимум 10 эмодзи по всему тексту!`;

function buildSexologistPrompt(styleKey = "auto") {
  const style = SEXOLOGIST_STYLE_META[styleKey] || SEXOLOGIST_STYLE_META.auto;
  return `${SEXOLOGIST_SYSTEM_PROMPT_BASE}\n\n${style.instruction}`;
}

// ─── ПРЕСЕТЫ ─────────────────────────────────────────────────────────────────

function getPresets(chatId) {
  return (userState.get(chatId) || {}).presets || [];
}

function savePreset(chatId, preset) {
  const state = userState.get(chatId) || {};
  const presets = state.presets || [];
  const exists = presets.findIndex(p =>
    p.scenario === preset.scenario && p.lengthMode === preset.lengthMode && p.styleKey === preset.styleKey
  );
  if (exists >= 0) presets.splice(exists, 1);
  presets.unshift(preset);
  if (presets.length > 3) presets.pop();
  state.presets = presets;
  userState.set(chatId, state);
}


// ─── ТЕМЫ ПО СЦЕНАРИЯМ ───────────────────────────────────────────────────────

const QUICK_TOPICS_PSYCH = [
  "тревога и страхи",
  "отношения и любовь",
  "выгорание и усталость",
  "принятие себя",
];

const QUICK_TOPICS_SEX = [
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

const MUSIC_LIBRARY = [
  { id:"789302", name:"Peaceful Nature", genre:"Ambient", mood:"спокойный", tags:["ambient","тревога","принятие"], url:"https://freesound.org/data/previews/789/789302_17549092-hq.mp3" },
  { id:"797700", name:"Meditation Calm", genre:"Медитация", mood:"медитативный", tags:["ambient","страх","усталость"], url:"https://freesound.org/data/previews/797/797700_17549092-hq.mp3" },
  { id:"795983", name:"Hypnotic Ambient", genre:"Ambient", mood:"гипнотический", tags:["ambient","рост","принятие"], url:"https://freesound.org/data/previews/795/795983_17549092-hq.mp3" },
  { id:"712222", name:"For Meditation", genre:"Медитация", mood:"расслабляющий", tags:["piano","грусть","одиночество"], url:"https://freesound.org/data/previews/712/712222_14416977-hq.mp3" },
  { id:"365659", name:"Dive Deep", genre:"Ambient", mood:"глубокий", tags:["ambient","отношения","принятие"], url:"https://freesound.org/data/previews/365/365659_5615960-hq.mp3" },
  { id:"612095", name:"Calm Piano", genre:"Фортепиано", mood:"нежный", tags:["piano","грусть","одиночество"], url:"https://freesound.org/data/previews/612/612095_5674468-hq.mp3" },
  { id:"728927", name:"Serene", genre:"Ambient", mood:"безмятежный", tags:["ambient","усталость","тревога"], url:"https://freesound.org/data/previews/728/728927_11861866-hq.mp3" },
  { id:"741153", name:"Soft Ambient", genre:"Ambient", mood:"мягкий", tags:["ambient","рост","принятие"], url:"https://freesound.org/data/previews/741/741153_11861866-hq.mp3" },
  { id:"798164", name:"Calm Background", genre:"Медитация", mood:"спокойный", tags:["ambient","страх","тревога"], url:"https://freesound.org/data/previews/798/798164_13819838-hq.mp3" },
  { id:"105497", name:"Relaxation Music", genre:"Релакс", mood:"расслабляющий", tags:["piano","отношения","грусть"], url:"https://freesound.org/data/previews/105/105497_862210-hq.mp3" },
];

async function selectMusicTracks(text, count = 3) {
  return shuffleArray(MUSIC_LIBRARY).slice(0, count);
}

async function downloadTrack(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "audio/mpeg,audio/webm,audio/ogg,audio/*;q=0.9,*/*;q=0.5",
        "Referer": "https://freesound.org/",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function mixAudioWithMusic(voiceBuffer, musicUrl) {
  const tmp = tmpdir();
  const voicePath = join(tmp, `voice_${Date.now()}.mp3`);
  const musicPath = join(tmp, `music_${Date.now()}.mp3`);
  const outputPath = join(tmp, `mixed_${Date.now()}.mp3`);
  try {
    await fs.writeFile(voicePath, voiceBuffer);
    const musicBuffer = await downloadTrack(musicUrl).catch(e => { throw new Error(`Загрузка трека: ${e.message}`); });
    await fs.writeFile(musicPath, musicBuffer);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(voicePath).input(musicPath)
        .complexFilter([
          `[1:a]volume=0.12[music_vol]`,
          `[music_vol]apad[music_pad]`,
          `[0:a]volume=1.0[voice]`,
          `[voice][music_pad]amix=inputs=2:duration=first:dropout_transition=3[out]`,
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
    messages: [{ role: "user", content: `Topic: "${topic}".\nDescribe one short scene (English, 1-2 sentences) where a woman is in a place fitting this topic.\nOnly place/atmosphere, no person, realistic, cozy.\nExample: "sitting at outdoor cafe table, warm golden sunlight, bokeh background"\nAnswer:` }],
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
    await bot.editMessageText(`Ошибка (${submitRes.status}):\n${submitText.substring(0, 200)}`, { chat_id: chatId, message_id: msgId });
    throw new Error(`Aurora submit error: ${submitText}`);
  }
  let submitData;
  try { submitData = JSON.parse(submitText); } catch(e) { throw new Error(`Aurora JSON error`); }
  const { request_id, status_url, response_url } = submitData;
  if (!request_id) throw new Error("Aurora: no request_id");
  await bot.editMessageText("\u2699\uFE0F Шаг 2/3 — Aurora обрабатывает...\n\u23F1 Обычно 2-4 минуты", { chat_id: chatId, message_id: msgId });
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
      await bot.editMessageText(`\u2699\uFE0F Шаг 2/3...\n\u23F1 Прошло ~${elapsed} мин`, { chat_id: chatId, message_id: msgId }).catch(() => {});
    }
    if (status.status === "COMPLETED") {
      await bot.editMessageText("\u2705 Шаг 3/3 — Видео готово!", { chat_id: chatId, message_id: msgId });
      const resultRes = await fetch(resultUrl, { headers: { "Authorization": `Key ${FAL_KEY}` } });
      const result = JSON.parse(await resultRes.text());
      const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video_url;
      if (!videoUrl) throw new Error(`Aurora: no video URL`);
      return { videoUrl, cost: result.cost ?? result.data?.cost ?? 1.47 };
    }
    if (status.status === "FAILED") throw new Error(`Aurora failed`);
  }
  throw new Error("Aurora timeout");
}

// ─── UI ФУНКЦИИ ──────────────────────────────────────────────────────────────

async function sendOnboarding(chatId, step = 1) {
  const skipRow = [
    { text: "⏭ Пропустить", callback_data: "skip_onboard" },
    { text: "🚫 Больше не показывать", callback_data: "dis_onboard" },
  ];
  if (step === 1) {
    await bot.sendMessage(chatId,
      `\u{1F331} *Привет! Я — контент-помощник Динары Качаевой*\n\nСоздаю профессиональные посты для Instagram и Telegram.\n\n*Что умею:*\n✨ Текст в стиле психолога\n🎙 Аудио голосом Динары\n🎵 Музыка по настроению\n🖼 Фото с ИИ\n🎬 Видео`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "➡️ Как это работает?", callback_data: "onboard_2" }],
          skipRow,
        ]},
      }
    );
  } else if (step === 2) {
    await bot.sendMessage(chatId,
      `💡 *Как это работает:*\n\n*1.* Выберите сценарий: Психолог или Сексолог\n*2.* Выберите тему из списка или напишите свою\n*3.* Выберите длину и стиль\n*4.* Получите готовый текст\n*5.* Добавьте аудио, фото, видео\n*6.* Опубликуйте в канал ✅`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "← Назад", callback_data: "onboard_1" }, { text: "➡️ Попробовать", callback_data: "onboard_3" }],
          skipRow,
        ]},
      }
    );
  } else {
    await sendTopicMenu(chatId);
  }
}

async function sendTopicMenu(chatId) {
  const state = userState.get(chatId) || {};
  const presets = state.presets || [];
  const keyboard = [
    [
      { text: "🧠 Психолог Динара", callback_data: "sc_psych" },
      { text: "💜 Сексолог Динара", callback_data: "sc_sex" },
    ],
    [{ text: "✏️ Своя тема", callback_data: "prompt_topic" }],
  ];
  if (presets.length > 0) {
    keyboard.push([{ text: "⭐ Мои пресеты", callback_data: "show_presets" }]);
  }
  await bot.sendMessage(chatId, `🌟 *С чего начнём?*\n\nВыберите сценарий:`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendTopicsForScenario(chatId, scenario) {
  const topics = scenario === "sexologist" ? QUICK_TOPICS_SEX : QUICK_TOPICS_PSYCH;
  const prefix = scenario === "sexologist" ? "qs" : "qp";
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог Динара" : "🧠 Психолог Динара";

  const keyboard = [
    [{ text: topics[0], callback_data: `${prefix}:0` }, { text: topics[1], callback_data: `${prefix}:1` }],
    [{ text: topics[2], callback_data: `${prefix}:2` }, { text: topics[3], callback_data: `${prefix}:3` }],
    [{ text: "✏️ Своя тема", callback_data: `prompt_topic_sc:${scenario}` }],
    [{ text: "← Назад", callback_data: "back_to_topics" }],
  ];

  await bot.sendMessage(chatId, `${scenarioLabel}\n\nВыберите тему или напишите свою:`, {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendPresetsMenu(chatId) {
  const presets = getPresets(chatId);
  if (presets.length === 0) {
    await bot.sendMessage(chatId, "Пресетов пока нет. Создайте после генерации текста.");
    return;
  }
  const rows = presets.map((p, i) => ([{ text: p.label, callback_data: `use_preset:${i}` }]));
  rows.push([{ text: "← Назад", callback_data: "back_to_topics" }]);
  await bot.sendMessage(chatId, "⭐ *Мои пресеты:*\n\nНажми — и сразу к генерации!", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `ℹ️ *Справка*\n\n*Флоу:* сценарий → тема → длина → стиль → текст → аудио → фото → видео → публикация в канал\n\n*Вопросы?* @tetss2`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "🔄 Начать заново", callback_data: "back_to_topics" },
      ]]},
    }
  );
}

async function sendScenarioChoice(chatId, topic) {
  const state = userState.get(chatId) || {};
  state.pendingTopic = topic;
  userState.set(chatId, state);
  await bot.sendMessage(chatId, `📝 Тема: *${topic}*\n\nКто будет отвечать?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[
      { text: "🧠 Психолог Динара", callback_data: "sc_psych_t" },
      { text: "💜 Сексолог Динара", callback_data: "sc_sex_t" },
    ]]},
  });
}

async function sendLengthChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);
  const label = scenario === "sexologist" ? "💜 Сексолог Динара" : "🧠 Психолог Динара";
  await bot.sendMessage(chatId, `${label}\n\nВыберите длину поста:`, {
    reply_markup: { inline_keyboard: [[
      { text: "✂️ Короткий", callback_data: "len_short" },
      { text: "📄 Обычный", callback_data: "len_normal" },
      { text: "📖 Длинный", callback_data: "len_long" },
    ]]},
  });
}

async function sendStyleChoice(chatId) {
  const entries = Object.entries(SEXOLOGIST_STYLE_META);
  const pairedRows = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const [k1, m1] = entries[i];
    const [k2, m2] = entries[i + 1];
    pairedRows.push([
      { text: m1.label, callback_data: `sty_${k1}` },
      { text: m2.label, callback_data: `sty_${k2}` },
    ]);
  }
  if (entries.length % 2 !== 0) {
    const [k, m] = entries[entries.length - 1];
    pairedRows.push([{ text: m.label, callback_data: `sty_${k}` }]);
  }
  const hintsText = entries.map(([, m]) => `${m.label} — _${m.hint}_`).join("\n");
  await bot.sendMessage(chatId, `🎨 *Стиль подачи текста:*\n\n${hintsText}`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: pairedRows },
  });
}

async function sendAudioLengthChoice(chatId) {
  await bot.sendMessage(chatId,
    "🎙 *Выберите длину аудио:*\n\n✂️ *Короткое* — ~8-10 сек, одна ключевая мысль\n📻 *Длинное* — ~13-15 сек, развёрнутая мысль",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "✂️ Короткое ~8-10 сек", callback_data: "audlen_short" },
        { text: "📻 Длинное ~13-15 сек", callback_data: "audlen_long" },
      ]]},
    }
  );
}

async function sendAudioChoiceButtons(chatId) {
  return bot.sendMessage(chatId, "🎙 Выберите аудио:", {
    reply_markup: { inline_keyboard: [[
      { text: "🤖 ИИ-аудио", callback_data: "audio_gen" },
      { text: "🎙 Своё голосовое", callback_data: "audio_rec" },
    ]]},
  });
}

async function sendTrackPreview(chatId, tracks, currentIndex = 0) {
  const track = tracks[currentIndex];
  if (!track || !track.url) {
    await bot.sendMessage(chatId, "🎵 Музыка недоступна. Продолжаем без неё.");
    await sendPhotoButtons(chatId);
    return;
  }
  const total = tracks.length;
  const loadMsg = await bot.sendMessage(chatId, `🎵 Загружаю трек ${currentIndex + 1} из ${total}...`);
  try {
    const trackBuffer = await downloadTrack(track.url);
    await bot.deleteMessage(chatId, loadMsg.message_id).catch(() => {});
    await bot.sendAudio(chatId, trackBuffer, {
      caption: `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\n\nТрек ${currentIndex + 1} из ${total}`,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [
          { text: "⏭ Без музыки", callback_data: "music_skip" },
          { text: "✅ Выбрать", callback_data: `mc:${track.id}` },
          ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `mn:${currentIndex + 1}` }] : []),
        ],
      ]},
    }, { filename: `${track.id}.mp3`, contentType: "audio/mpeg" });
  } catch(err) {
    console.error("Track preview error:", err.message);
    await bot.editMessageText(
      `🎵 *${track.name}* — ${track.genre}\n_${track.mood}_\nТрек ${currentIndex + 1} из ${total}\n_(превью недоступно)_`,
      {
        chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [
            { text: "⏭ Без музыки", callback_data: "music_skip" },
            { text: "✅ Выбрать", callback_data: `mc:${track.id}` },
            ...(currentIndex + 1 < total ? [{ text: "⏭ Следующий", callback_data: `mn:${currentIndex + 1}` }] : []),
          ],
        ]},
      }
    ).catch(() => {});
  }
}

async function sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt) {
  const photoKey = `p${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.photos) state.photos = {};
  state.photos[photoKey] = { imageUrl, scenePrompt };
  state.lastImageUrl = imageUrl;
  state.lastScenePrompt = scenePrompt;
  userState.set(chatId, state);
  await bot.sendPhoto(chatId, imageUrl, {
    caption: `✅ 🖼 Фото сгенерировано\n💰 $${photoCost.toFixed(3)}`,
    reply_markup: { inline_keyboard: [
      [{ text: "🔄 Ещё вариант", callback_data: `rp:${photoKey}` }, { text: "🎬 Видео", callback_data: `mv:${photoKey}` }],
      [{ text: "📤 Опубликовать в канал", callback_data: "pub_menu" }],
    ]},
  });
}

async function sendVideoWithButtons(chatId, videoUrl, videoCost) {
  const videoKey = `v${Date.now()}`;
  const state = userState.get(chatId) || {};
  if (!state.videos) state.videos = {};
  state.videos[videoKey] = videoUrl;
  userState.set(chatId, state);
  await bot.sendVideo(chatId, videoUrl, {
    caption: `✅ 🎬 Видео сгенерировано\n💰 $${videoCost.toFixed(2)}`,
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Выбрать", callback_data: `cv:${videoKey}` }, { text: "🔄 Ещё вариант", callback_data: "vid_again" }],
      [{ text: "📤 Опубликовать в канал", callback_data: "pub_menu" }],
    ]},
  });
}

async function sendVoiceSelectionMenu(chatId) {
  const state = userState.get(chatId) || {};
  const voices = state.pendingVoices || [];
  if (voices.length === 0) { await bot.sendMessage(chatId, "Нет записанных голосовых."); return; }
  const rows = [];
  for (let i = 0; i < voices.length; i += 2) {
    const row = [{ text: `✅ Голосовое ${i + 1}`, callback_data: `vc:${i}` }];
    if (voices[i + 1]) row.push({ text: `✅ Голосовое ${i + 2}`, callback_data: `vc:${i + 1}` });
    rows.push(row);
  }
  rows.push([{ text: "➕ Записать ещё", callback_data: "voice_more" }]);
  await bot.sendMessage(chatId, `🎙 Голосовых: ${voices.length}. Выберите:`, { reply_markup: { inline_keyboard: rows } });
}

function sendPhotoButtons(chatId) {
  return bot.sendMessage(chatId, "📸 Сгенерировать фото:", {
    reply_markup: { inline_keyboard: [
      [{ text: "🎯 По теме", callback_data: "photo_topic" }, { text: "🏠 Кабинет", callback_data: "photo_office" }],
      [{ text: "✏️ Свой вариант", callback_data: "photo_custom" }, { text: "📤 Опубликовать в канал", callback_data: "pub_menu" }],
    ]},
  });
}

function getPublishButtons(state) {
  const buttons = [];
  const row1 = [];
  if (state.lastImageUrl && state.lastFullAnswer) row1.push({ text: "🖼 Текст+Фото → в канал", callback_data: "pub:text_photo" });
  if (state.lastVideoUrl && state.lastFullAnswer) row1.push({ text: "🎬 Текст+Видео → в канал", callback_data: "pub:text_video" });
  if (row1.length > 0) buttons.push(row1);
  if (state.lastFullAnswer) buttons.push([{ text: "📝 Только текст → в канал", callback_data: "pub:text_only" }]);
  return buttons;
}

async function sendPublishMenu(chatId) {
  const state = userState.get(chatId) || {};
  const buttons = getPublishButtons(state);
  if (buttons.length === 0) { await bot.sendMessage(chatId, "Нечего публиковать."); return; }
  await bot.sendMessage(chatId, "📤 Выберите формат публикации в канал:", { reply_markup: { inline_keyboard: buttons } });
}

// ПРАВКА 3+4: публикация всегда идёт в TG_CHANNEL
async function showFinalPost(chatId, type) {
  const state = userState.get(chatId) || {};

  if (!TG_CHANNEL) {
    await bot.sendMessage(chatId, "⚠️ Канал не настроен. Добавьте переменную TG_CHANNEL в Railway.\n\nПоложительный числовой chat_id канала, например: -1001234567890");
    return;
  }

  const publishMsg = await bot.sendMessage(chatId, "📤 Публикую в канал...");

  const result = await publishToChannel(type, state);

  await bot.deleteMessage(chatId, publishMsg.message_id).catch(() => {});

  if (result.ok) {
    const typeLabels = { text_photo: "Текст + Фото", text_video: "Текст + Видео", text_only: "Текст" };
    await bot.sendMessage(chatId,
      `✅ *Пост опубликован в канал!*\n\nФормат: ${typeLabels[type] || type}\n\n🔄 Создать новый пост?`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "✏️ Новый пост", callback_data: "new_topic" },
          { text: "♻️ Другой формат", callback_data: "pub_menu" },
        ]]},
      }
    );
  } else {
    await bot.sendMessage(chatId,
      `❌ Ошибка публикации: ${result.error}\n\nПроверьте что бот добавлен в канал как администратор.`
    );
  }
}

async function processAudioWithTrack(chatId, trackId) {
  const state = userState.get(chatId) || {};
  const track = (state.previewTracks || []).find(t => t.id === trackId);
  const voiceB64 = state.pendingVoiceBuffer;
  if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса."); return; }
  const voiceBuffer = Buffer.from(voiceB64, 'base64');
  const statusMsg = await bot.sendMessage(chatId, `🎵 Микширую с "${track?.name || trackId}"...`);
  let finalBuffer;
  try {
    finalBuffer = await mixAudioWithMusic(voiceBuffer, track.url);
    await bot.editMessageText("✅ Аудио с музыкой готово!", { chat_id: chatId, message_id: statusMsg.message_id });
  } catch(err) {
    console.error("Ошибка микширования:", err.message);
    finalBuffer = voiceBuffer;
    await bot.editMessageText(`⚠️ Микширование не удалось: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: statusMsg.message_id });
  }
  await bot.sendVoice(chatId, finalBuffer, {}, { filename: "voice_music.mp3", contentType: "audio/mpeg" });
  const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
  let audioUrl = null;
  try {
    audioUrl = await uploadAudioToCloudinary(finalBuffer);
    await bot.editMessageText("✅ Аудио готово для видео!", { chat_id: chatId, message_id: uploadMsg.message_id });
  } catch(err) {
    await bot.editMessageText(`Ошибка: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
  }
  const s = userState.get(chatId) || {};
  s.lastAudioUrl = audioUrl;
  s.pendingVoiceBuffer = null;
  userState.set(chatId, s);
  await bot.sendMessage(chatId, `✅ Аудио готово\n💰 $${(state.pendingAudioCost || 0).toFixed(4)}`);
  await sendPhotoButtons(chatId);
}

// ─── ГЕНЕРАЦИЯ ТЕКСТА ─────────────────────────────────────────────────────────

async function generatePostText(topic, scenario, lengthMode = "normal", styleKey = "auto") {
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
    const fallbackChunks = await vectorSearch(topic, "sexologist", 3);
    if (fallbackChunks && fallbackChunks.length > 0) {
      context = fallbackChunks.map(c => c.chunk_text).join("\n\n");
    } else {
      context = `Тема запроса: "${topic}". Отвечай на основе общих знаний психолога-сексолога, строго в рамках профессиональной этики. Не выдумывай исследования и статистику.`;
    }
  }

  const tokenLimits = { short: 280, normal: 560, long: 450 };
  const maxTokens = tokenLimits[lengthMode] || 560;
  const lengthInstruction = {
    short: "Напиши КОРОТКИЙ пост: строго 2 абзаца, до 600 символов. ОБЯЗАТЕЛЬНО 10-15 эмодзи!",
    normal: "Напиши пост: строго 3-4 абзаца, до 1200 символов. ОБЯЗАТЕЛЬНО 10-15 эмодзи!",
    long: "Напиши РАЗВЁРНУТЫЙ пост: 3-4 абзаца, СТРОГО до 1024 символов включая эмодзи. Текст должен быть смыслово завершён и не обрываться. ОБЯЗАТЕЛЬНО 10-15 эмодзи!",
  }[lengthMode] || "Напиши пост: 3-4 абзаца. ОБЯЗАТЕЛЬНО 10-15 эмодзи!";

  const systemPrompt = scenario === "sexologist"
    ? buildSexologistPrompt(styleKey)
    : PSYCHOLOGIST_SYSTEM_PROMPT;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Тема: "${topic}"\n\nКонтекст:\n${context}\n\n${lengthInstruction} С одной жирной фразой (*жирный*).` }
    ],
    temperature: 0.82,
    max_tokens: maxTokens,
  });

  return completion.choices[0].message.content;
}

// ПРАВКА 2: длина аудио — уменьшены лимиты для точного попадания в 13-15 сек
// Скорость речи ~14-16 символов/сек → 13-15 сек = 182-240 символов
// Ставим 200 симв для длинного (гарантированно 13-14 сек)
// Для короткого — 120 симв (~8 сек)
async function generateAudioText(fullAnswer, audioLength = "short") {
  const maxChars = audioLength === "long" ? 190 : 125;
  const maxTokens = audioLength === "long" ? 90 : 55;

  const wordLimit = audioLength === "long" ? "30-35 слов" : "18-20 слов";

  const instruction = audioLength === "long"
    ? `Возьми главную мысль из текста и перефразируй ровно в 2 ЗАКОНЧЕННЫХ предложения.
Требования:
- Ровно 2 предложения, каждое заканчивается точкой
- Строго ${wordLimit} суммарно (не больше!)
- Спокойный тон, без вопросов
- Без эмодзи, без markdown (* _)
- НЕЛЬЗЯ обрывать на полуслове`
    : `Возьми главную мысль из текста и перефразируй в ОДНО ЗАКОНЧЕННОЕ предложение.
Требования:
- Ровно 1 предложение, заканчивается точкой
- Строго ${wordLimit} (не больше!)
- Спокойный тон, без вопросов
- Без эмодзи, без markdown (* _)`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: `${instruction}\n\nТекст:\n${fullAnswer}\n\nРезультат (только текст, без пояснений):` }],
    temperature: 0.3,
    max_tokens: maxTokens,
  });

  let result = completion.choices[0].message.content.trim().replace(/[*_]/g, '');

  // Жёсткая обрезка по последней точке если превысили лимит
  if (result.length > maxChars) {
    const lastDot = result.lastIndexOf('.', maxChars);
    if (lastDot > maxChars * 0.4) {
      result = result.substring(0, lastDot + 1);
    } else {
      // Обрезаем по последнему пробелу перед лимитом
      const lastSpace = result.lastIndexOf(' ', maxChars - 1);
      result = result.substring(0, lastSpace > 0 ? lastSpace : maxChars) + ".";
    }
  }

  return result;
}

async function sendGeneratedText(chatId, text, scenario) {
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";

  await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(async () => {
    await bot.sendMessage(chatId, text);
  });

  await bot.sendMessage(chatId, `Сгенерировано: *${scenarioLabel}*\n\nЧто дальше?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [
      [{ text: "⭐ Сохранить этот сценарий", callback_data: "save_preset" }, { text: "🔄 Новый запрос", callback_data: "new_topic" }],
      [{ text: "✏️ Редактировать", callback_data: "txt_edit" }, { text: "♻️ Другой текст", callback_data: "regen_txt" }],
      [{ text: "✅ Текст готов", callback_data: "txt_ready" }],
    ]},
  });
}

// ─── КОМАНДЫ ─────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const inviteCode = text.replace("/start", "").trim();

  if (inviteCode) {
    const db = await loadDemoDB();
    const user = Object.values(db.users).find(u => u.invite_code === inviteCode);
    if (user) {
      if (user.tg_id !== chatId) {
        await bot.sendMessage(chatId, "🔐 Этот инвайт-код уже использован. Обратитесь к @tetss2 для получения нового доступа.");
        return;
      }
    }
  }

  userState.set(chatId, {});

  if (chatId === ADMIN_TG_ID) {
    userState.set(chatId, {});
    await bot.sendMessage(chatId, `👋 Добро пожаловать, *Дмитрий*! 🔑 Полный доступ.\n\nНажмите кнопку чтобы начать 👇`, { parse_mode: "Markdown", reply_markup: START_KEYBOARD });
    return;
  }

  const demoUser = await getDemoUserByTgId(chatId);
  if (demoUser) {
    const access = await checkDemoAccess(chatId);
    if (!access.allowed) {
      if (access.reason === "expired") {
        await handleExpired(chatId, access.user);
      } else {
        await handleNotRegistered(chatId);
      }
      return;
    }
    await bot.sendMessage(chatId,
      `👋 Добро пожаловать, *${demoUser.name}*!\n\n` +
      `📊 Ваш демо-доступ:\n` +
      `📝 Текст: ${demoUser.limits.text.used}/${demoUser.limits.text.max}\n` +
      `🖼 Фото: ${demoUser.limits.photo.used}/${demoUser.limits.photo.max}\n` +
      `🎬 Видео: ${demoUser.limits.video.used}/${demoUser.limits.video.max}\n\n` +
      `Нажмите кнопку чтобы начать 👇`,
      { parse_mode: "Markdown", reply_markup: START_KEYBOARD }
    );
  } else {
    await handleNotRegistered(chatId);
  }
});

bot.onText(/\/help/, async (msg) => { await sendHelp(msg.chat.id); });

// ─── ОБРАБОТЧИК СООБЩЕНИЙ ────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const state = userState.get(chatId) || {};

    if (msg.text && msg.text.startsWith('/')) return;

    if (msg.text === "\uD83D\uDE80 Старт") {
      const access = await checkDemoAccess(chatId);
      if (!access.allowed) {
        if (access.reason === "expired") { await handleExpired(chatId, access.user); }
        else { await handleNotRegistered(chatId); }
        return;
      }
      await bot.sendMessage(chatId, "🌟 Начинаем!", { reply_markup: REMOVE_KEYBOARD });
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
      const photoKey = `pf${Date.now()}`;
      if (!state.photos) state.photos = {};
      state.photos[photoKey] = { imageUrl, scenePrompt: null };
      state.lastImageUrl = imageUrl;
      userState.set(chatId, state);
      await bot.sendMessage(chatId, "📷 Фото получено!", {
        reply_markup: { inline_keyboard: [[
          { text: "🎬 Видео", callback_data: `mv:${photoKey}` },
          { text: "📤 Опубликовать в канал", callback_data: "pub_menu" },
        ]]},
      });
      return;
    }

    const text = msg.text;
    if (!text) return;

    if (state.awaitingTextEdit) {
      const s = userState.get(chatId) || {};
      s.lastFullAnswer = text;
      s.awaitingTextEdit = false;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Текст обновлён!");
      await sendGeneratedText(chatId, text, s.lastScenario);
      return;
    }

    if (state.awaitingCustomScene) {
      userState.set(chatId, { ...state, awaitingCustomScene: false });
      const translatedScene = await translateScene(text);
      const customScene = `${translatedScene}, bokeh background, photorealistic`;
      const { imageUrl, cost: photoCost, scenePrompt } = await generateImage(chatId, customScene);
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);
      return;
    }

    if (state.usingPreset) {
      const s = userState.get(chatId) || {};
      s.pendingTopic = text;
      s.usingPreset = false;
      userState.set(chatId, s);
      await runGeneration(chatId, s.pendingScenario, s.pendingLengthMode, s.presetStyleKey || "auto");
      return;
    }

    if (state.pendingScenario && !state.pendingTopic) {
      const s = userState.get(chatId) || {};
      s.pendingTopic = text;
      userState.set(chatId, s);
      await sendLengthChoice(chatId, state.pendingScenario);
      return;
    }

    console.log("New topic:", text);
    await sendScenarioChoice(chatId, text);

  } catch (error) {
    console.error("Error:", error.message);
    try { bot.sendMessage(msg.chat.id, "Ошибка сервера"); } catch(e) {}
  }
});

// ─── ОБРАБОТЧИК КНОПОК ───────────────────────────────────────────────────────

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  try {
    const state = userState.get(chatId) || {};

    if (data.startsWith("req_limit_")) {
      const limitType = data.replace("req_limit_", "");
      const user = await getDemoUserByTgId(chatId);
      if (user) {
        const labelMap = { text: "📝 Тексты", photo: "🖼 Фото", video: "🎬 Видео" };
        await notifyLeadsBot(
          `📩 *Запрос на увеличение лимита*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n📊 Хочет больше: *${labelMap[limitType] || limitType}*`,
          { inline_keyboard: [[{ text: "💬 Написать пользователю", url: `tg://user?id=${user.tg_id}` }]] }
        );
      }
      await bot.sendMessage(chatId, "✅ Запрос отправлен администратору. Он свяжется с вами в ближайшее время.");
      return;
    }

    if (data === "req_extend") {
      const user = await getDemoUserByTgId(chatId);
      if (user) {
        await notifyLeadsBot(
          `📩 *Запрос на продление демо*\n\n👤 ${user.name}, ${user.city}\n📱 ${user.phone}\n📊 Текст: ${user.limits.text.used}/${user.limits.text.max} | Фото: ${user.limits.photo.used}/${user.limits.photo.max} | Видео: ${user.limits.video.used}/${user.limits.video.max}`,
          { inline_keyboard: [[
            { text: "💬 Написать", url: `tg://user?id=${user.tg_id}` },
            { text: "➕ Продлить на 3 дня", callback_data: `extend_${user.phone}` },
          ]] }
        );
      }
      await bot.sendMessage(chatId, "✅ Запрос на продление отправлен. Администратор свяжется с вами.");
      return;
    }

    if (data === "onboard_1") { await sendOnboarding(chatId, 1); return; }
    if (data === "onboard_2") { await sendOnboarding(chatId, 2); return; }
    if (data === "onboard_3") { await sendTopicMenu(chatId); return; }
    if (data === "skip_onboard") { await sendTopicMenu(chatId); return; }
    if (data === "dis_onboard") {
      const s = userState.get(chatId) || {};
      s.onboardingDisabled = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Обучение отключено.");
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "show_help") { await sendHelp(chatId); return; }
    if (data === "back_to_topics") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = null;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "prompt_topic") {
      const s = userState.get(chatId) || {};
      if (s.pendingScenario) {
        await bot.sendMessage(chatId, "📝 Напишите тему:\n\nНапример: _тревога_, _выгорание_, _одиночество_", { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(chatId, "📝 Сначала выберите сценарий:", {
          reply_markup: { inline_keyboard: [[
            { text: "🧠 Психолог", callback_data: "sc_psych" },
            { text: "💜 Сексолог", callback_data: "sc_sex" },
          ]]},
        });
      }
      return;
    }

    if (data.startsWith("prompt_topic_sc:")) {
      const scenario = data.replace("prompt_topic_sc:", "");
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenario;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "📝 Напишите тему:\n\nНапример: _тревога_, _выгорание_, _одиночество_", { parse_mode: "Markdown" });
      return;
    }

    if (data.startsWith("qp:")) {
      const idx = parseInt(data.replace("qp:", ""));
      const topic = QUICK_TOPICS_PSYCH[idx];
      if (!topic) return;
      const s = userState.get(chatId) || {};
      s.pendingTopic = topic;
      s.pendingScenario = "psychologist";
      userState.set(chatId, s);
      await sendLengthChoice(chatId, "psychologist");
      return;
    }

    if (data.startsWith("qs:")) {
      const idx = parseInt(data.replace("qs:", ""));
      const topic = QUICK_TOPICS_SEX[idx];
      if (!topic) return;
      const s = userState.get(chatId) || {};
      s.pendingTopic = topic;
      s.pendingScenario = "sexologist";
      userState.set(chatId, s);
      await sendLengthChoice(chatId, "sexologist");
      return;
    }

    if (data === "show_presets") { await sendPresetsMenu(chatId); return; }

    if (data === "save_preset") {
      const s = userState.get(chatId) || {};
      if (!s.lastScenario) { await bot.sendMessage(chatId, "Нет данных для сохранения."); return; }
      const styleLabel = SEXOLOGIST_STYLE_META[s.lastStyleKey]?.label || "✨ Авто";
      const scLabel = s.lastScenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";
      const lenLabel = { short: "✂️ Короткий", normal: "📄 Обычный", long: "📖 Длинный" }[s.lastLengthMode] || "📄";
      savePreset(chatId, {
        scenario: s.lastScenario,
        lengthMode: s.lastLengthMode || "normal",
        styleKey: s.lastStyleKey || "auto",
        label: `${scLabel} · ${lenLabel} · ${styleLabel}`,
      });
      await bot.sendMessage(chatId, `⭐ Пресет сохранён!\n\n${scLabel} · ${lenLabel} · ${styleLabel}`);
      return;
    }

    if (data.startsWith("use_preset:")) {
      const idx = parseInt(data.replace("use_preset:", ""));
      const presets = getPresets(chatId);
      const preset = presets[idx];
      if (!preset) return;
      const s = userState.get(chatId) || {};
      s.pendingScenario = preset.scenario;
      s.pendingLengthMode = preset.lengthMode;
      s.usingPreset = true;
      s.presetStyleKey = preset.styleKey;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `⚡ Пресет: ${preset.label}\n\nНапишите тему поста:`);
      return;
    }

    if (data === "sc_psych") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = "psychologist";
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, "psychologist");
      return;
    }
    if (data === "sc_sex") {
      const s = userState.get(chatId) || {};
      s.pendingScenario = "sexologist";
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, "sexologist");
      return;
    }

    if (data === "sc_psych_t") { await sendLengthChoice(chatId, "psychologist"); return; }
    if (data === "sc_sex_t") { await sendLengthChoice(chatId, "sexologist"); return; }

    if (data === "len_short" || data === "len_normal" || data === "len_long") {
      const lengthMode = data.replace("len_", "");
      const s = userState.get(chatId) || {};
      s.pendingLengthMode = lengthMode;
      userState.set(chatId, s);
      const scenario = state.pendingScenario || "psychologist";
      if (scenario === "sexologist") {
        await sendStyleChoice(chatId);
      } else {
        await runGeneration(chatId, scenario, lengthMode, "auto");
      }
      return;
    }

    if (data.startsWith("sty_")) {
      await runGeneration(chatId, state.pendingScenario || "sexologist", state.pendingLengthMode || "normal", data.replace("sty_", ""));
      return;
    }

    if (data === "txt_edit") {
      const s = userState.get(chatId) || {};
      s.awaitingTextEdit = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, (state.lastFullAnswer || "").replace(/[*_]/g, ''), {
        reply_markup: { force_reply: true, input_field_placeholder: "Отредактируйте и отправьте..." },
      });
      return;
    }

    if (data === "txt_ready") { await sendAudioChoiceButtons(chatId); return; }

    if (data === "new_topic") {
      const s = userState.get(chatId) || {};
      userState.set(chatId, { onboardingDisabled: s.onboardingDisabled, presets: s.presets });
      await sendTopicMenu(chatId);
      return;
    }

    if (data === "regen_txt") {
      if (!state.lastTopic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
      await runGeneration(chatId, state.lastScenario || "psychologist", state.lastLengthMode || "normal", state.lastStyleKey || "auto");
      return;
    }

    if (data === "pub_menu") { await sendPublishMenu(chatId); return; }
    if (data.startsWith("pub:")) { await showFinalPost(chatId, data.replace("pub:", "")); return; }

    if (data.startsWith("rp:")) {
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const scenePrompt = state.photos?.[data.replace("rp:", "")]?.scenePrompt || state.lastScenePrompt;
      if (!scenePrompt) { await bot.sendMessage(chatId, "Не могу воспроизвести сцену."); return; }
      const { imageUrl, cost: photoCost, scenePrompt: newScene } = await generateImage(chatId, scenePrompt);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, newScene);
      return;
    }

    if (data.startsWith("cv:")) {
      const videoUrl = state.videos?.[data.replace("cv:", "")];
      if (!videoUrl) { await bot.sendMessage(chatId, "Видео не найдено."); return; }
      const s = userState.get(chatId) || {};
      s.lastVideoUrl = videoUrl;
      userState.set(chatId, s);
      const cleanText = (s.lastFullAnswer || "").replace(/[*_]/g, '').substring(0, 1024);
      await bot.sendVideo(chatId, videoUrl, { caption: cleanText });
      await bot.sendMessage(chatId, "✅ Видео выбрано! Публиковать в канал?", {
        reply_markup: { inline_keyboard: [[
          { text: "🎬 Текст+Видео → канал", callback_data: "pub:text_video" },
          { text: "🖼 Текст+Фото → канал", callback_data: "pub:text_photo" },
        ]]},
      });
      return;
    }

    if (data === "vid_again") {
      if (!state.lastImageUrl || !state.lastAudioUrl) { await bot.sendMessage(chatId, "Нет фото или аудио."); return; }
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, state.lastImageUrl, state.lastAudioUrl);
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
      return;
    }

    if (data === "audio_gen") { await sendAudioLengthChoice(chatId); return; }

    if (data === "audlen_short" || data === "audlen_long") {
      const audioLength = data === "audlen_long" ? "long" : "short";
      const fullAnswer = state.lastFullAnswer;
      if (!fullAnswer) { await bot.sendMessage(chatId, "Нет текста для аудио."); return; }
      const genMsg = await bot.sendMessage(chatId, "⏳ Генерирую голос...");
      const audioText = await generateAudioText(fullAnswer, audioLength);
      console.log(`Audio text (${audioLength}): ${audioText.length} chars: "${audioText}"`);
      const { buffer: audioBuffer, cost: audioCost } = await generateVoice(audioText);
      await bot.editMessageText("✅ Голос готов! Выберите музыку:", { chat_id: chatId, message_id: genMsg.message_id });
      const s = userState.get(chatId) || {};
      s.pendingVoiceBuffer = audioBuffer.toString('base64');
      s.pendingAudioCost = audioCost;
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      s.previewTracks = tracks;
      userState.set(chatId, s);
      await sendTrackPreview(chatId, tracks, 0);
      return;
    }

    if (data.startsWith("mn:")) {
      const nextIndex = parseInt(data.replace("mn:", ""));
      const tracks = state.previewTracks;
      if (!tracks || nextIndex >= tracks.length) { await bot.sendMessage(chatId, "Треки закончились."); return; }
      await sendTrackPreview(chatId, tracks, nextIndex);
      return;
    }

    if (data.startsWith("mc:")) { await processAudioWithTrack(chatId, data.replace("mc:", "")); return; }

    if (data === "music_skip") {
      const voiceB64 = state.pendingVoiceBuffer;
      if (!voiceB64) { await bot.sendMessage(chatId, "Нет голоса."); return; }
      const voiceBuffer = Buffer.from(voiceB64, 'base64');
      await bot.sendVoice(chatId, voiceBuffer, {}, { filename: "voice.mp3", contentType: "audio/mpeg" });
      const uploadMsg = await bot.sendMessage(chatId, "🔄 Загружаю на сервер...");
      let audioUrl = null;
      try {
        audioUrl = await uploadAudioToCloudinary(voiceBuffer);
        await bot.editMessageText("✅ Аудио готово!", { chat_id: chatId, message_id: uploadMsg.message_id });
      } catch(err) {
        await bot.editMessageText(`Ошибка: ${err.message.substring(0, 80)}`, { chat_id: chatId, message_id: uploadMsg.message_id });
      }
      const s = userState.get(chatId) || {};
      s.lastAudioUrl = audioUrl;
      s.pendingVoiceBuffer = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Аудио готово\n💰 $${(state.pendingAudioCost || 0).toFixed(4)}`);
      await sendPhotoButtons(chatId);
      return;
    }

    if (data === "audio_rec") {
      const s = userState.get(chatId) || {};
      s.awaitingVoiceRecord = true;
      s.pendingVoices = [];
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "🎙 Запишите голосовое.");
      return;
    }

    if (data === "voice_more") {
      const s = userState.get(chatId) || {};
      s.awaitingVoiceRecord = true;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "🎙 Запишите ещё одно:");
      return;
    }

    if (data.startsWith("vc:")) {
      const index = parseInt(data.replace("vc:", ""));
      const voices = state.pendingVoices || [];
      const chosen = voices[index];
      if (!chosen) { await bot.sendMessage(chatId, "Голосовое не найдено."); return; }
      const s = userState.get(chatId) || {};
      s.pendingVoiceBuffer = chosen.voiceBuffer;
      s.pendingAudioCost = 0;
      s.awaitingVoiceRecord = false;
      s.pendingVoices = [];
      const tracks = state.suggestedTracks || shuffleArray(MUSIC_LIBRARY).slice(0, 3);
      s.previewTracks = tracks;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Голосовое ${index + 1} выбрано!`);
      await sendTrackPreview(chatId, tracks, 0);
      return;
    }

    if (data.startsWith("mv:")) {
      const videoCheck = await checkLimit(chatId, "video");
      if (!videoCheck.ok) {
        if (videoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (videoCheck.reason === "expired") { await handleExpired(chatId, videoCheck.user); return; }
        await handleLimitExhausted(chatId, "video", videoCheck.user); return;
      }
      const photoKey = data.replace("mv:", "");
      const imageUrl = state.photos?.[photoKey]?.imageUrl || null;
      if (!imageUrl) { await bot.sendMessage(chatId, "Фото не найдено."); return; }
      if (!state.lastAudioUrl) { await bot.sendMessage(chatId, "Нет аудио."); return; }
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      const { videoUrl, cost: videoCost } = await generateVideoAurora(chatId, imageUrl, state.lastAudioUrl);
      await incrementLimit(chatId, "video", state.lastScenario, null);
      await sendVideoWithButtons(chatId, videoUrl, videoCost);
      return;
    }

    if (data === "photo_topic") {
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const scenePrompt = await buildTopicScenePrompt(state.lastTopic || "психология");
      const { imageUrl, cost: photoCost } = await generateImage(chatId, scenePrompt);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, scenePrompt);
    } else if (data === "photo_office") {
      const photoCheck = await checkLimit(chatId, "photo");
      if (!photoCheck.ok) {
        if (photoCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
        if (photoCheck.reason === "expired") { await handleExpired(chatId, photoCheck.user); return; }
        await handleLimitExhausted(chatId, "photo", photoCheck.user); return;
      }
      const officeScene = `sitting in cozy therapist office, bookshelf background, soft warm lamp light, wooden furniture, indoor plants, bokeh background`;
      const { imageUrl, cost: photoCost } = await generateImage(chatId, officeScene);
      await incrementLimit(chatId, "photo", state.lastScenario, null);
      const s = userState.get(chatId) || {};
      s.lastImageUrl = imageUrl;
      userState.set(chatId, s);
      await sendPhotoWithButtons(chatId, imageUrl, photoCost, officeScene);
    } else if (data === "photo_custom") {
      userState.set(chatId, { ...state, awaitingCustomScene: true });
      await bot.sendMessage(chatId, "✏️ Опишите сцену на русском:");
    }

  } catch (error) {
    console.error("Callback error:", error.message);
    try { bot.sendMessage(chatId, "Ошибка при генерации"); } catch(e) {}
  }
});

// ─── ГЕНЕРАЦИЯ ────────────────────────────────────────────────────────────────

async function runGeneration(chatId, scenario, lengthMode, styleKey) {
  const textCheck = await checkLimit(chatId, "text");
  if (!textCheck.ok) {
    if (textCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
    if (textCheck.reason === "expired") { await handleExpired(chatId, textCheck.user); return; }
    await handleLimitExhausted(chatId, "text", textCheck.user); return;
  }

  const state = userState.get(chatId) || {};
  const topic = state.pendingTopic;
  if (!topic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }

  const labelMap = { short: "короткий", normal: "обычный", long: "длинный" };
  const scenarioLabel = scenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";
  const styleLabel = scenario === "sexologist" && styleKey !== "auto"
    ? ` · ${SEXOLOGIST_STYLE_META[styleKey]?.label || ""}` : "";
  const genMsg = await bot.sendMessage(chatId,
    `⏳ Генерирую ${labelMap[lengthMode]} пост [${scenarioLabel}${styleLabel}]\nТема: "${topic}"...`
  );

  const fullAnswer = await generatePostText(topic, scenario, lengthMode, styleKey);
  await bot.deleteMessage(chatId, genMsg.message_id).catch(() => {});

  await incrementLimit(chatId, "text", scenario, lengthMode);

  const s = userState.get(chatId) || {};
  s.lastFullAnswer = fullAnswer;
  s.lastTopic = topic;
  s.lastScenario = scenario;
  s.lastLengthMode = lengthMode;
  s.lastStyleKey = styleKey;
  s.lastAudioUrl = null;
  s.lastVideoUrl = null;
  s.pendingVoices = [];
  s.awaitingVoiceRecord = false;
  s.pendingVoiceBuffer = null;
  s.suggestedTracks = null;
  s.awaitingTextEdit = false;
  userState.set(chatId, s);

  selectMusicTracks(fullAnswer).then(tracks => {
    const cur = userState.get(chatId) || {};
    cur.suggestedTracks = tracks;
    userState.set(chatId, cur);
  }).catch(() => {});

  await sendGeneratedText(chatId, fullAnswer, scenario);
}

process.on('uncaughtException', err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', err));
