import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import {
  addFileItem,
  addTextItem,
  addUrlItem,
  canUseKnowledgeIntake,
  createIntakeSession,
  getActiveIntakeSession,
  getTargetLabel,
  isUrlText,
  setSessionStatus,
  summarizeSession,
} from "./knowledge-intake.js";
import { retrieveGroundingContext } from "./retrieval_service.js";
import { buildSexologistPrompt, normalizeSexologistStyleKey, SEXOLOGIST_STYLE_META } from "./sexologist_prompt.js";
import { buildAuthorVoicePrompt, loadAuthorVoiceProfile, logAuthorVoiceStatus } from "./author_voice.js";
import { getLengthConfig } from "./generation_config.js";
import { runRuntimeGenerationAdapter } from "./scripts/runtime-generation-adapter.js";
import {
  ONBOARDING_ROLES,
  analyzeOnboardingMaterial,
  buildUserScenarioContext,
  createUserScenario,
  ensureUserExpertFolders,
  generatePersonaDrafts,
  getOnboardingInventory,
  loadUserProfile,
  loadUserScenario,
  listUserScenarios,
  saveUserProfile,
  storeOnboardingFile,
  storeOnboardingText,
  userHasCompletedExpert,
} from "./expert-onboarding.js";
let ffmpegPath = "ffmpeg";
try { ffmpegPath = execSync("which ffmpeg").toString().trim(); console.log("ffmpeg path:", ffmpegPath); } catch(e) { console.error("ffmpeg not found:", e.message); }
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
  if (await userHasCompletedExpert(chatId)) return { allowed: true, user: null };
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

async function loadExpertRuntime(userId) {
  await ensureUserExpertFolders(userId);
  const path = join("users", String(userId), "profile", "runtime.json");
  try {
    return JSON.parse(await fs.readFile(path, "utf-8"));
  } catch {
    return {
      mode: "free_demo",
      counters: {
        text: 0,
        photo: 0,
        video: 0,
        audio: 0,
      },
      limits: {
        text: null,
        photo: null,
        video: null,
        audio: null,
      },
      monetization: {
        telegram_stars_ready: false,
        paid_plan: null,
      },
      events: [],
      updated_at: new Date().toISOString(),
    };
  }
}

async function saveExpertRuntime(userId, runtime) {
  await ensureUserExpertFolders(userId);
  const path = join("users", String(userId), "profile", "runtime.json");
  await fs.writeFile(path, JSON.stringify(runtime, null, 2), "utf-8");
  return runtime;
}

async function incrementExpertRuntime(chatId, action, meta = {}) {
  const runtime = await loadExpertRuntime(chatId);
  const counterKey = meta.counter || action;
  runtime.counters[counterKey] = (runtime.counters[counterKey] || 0) + 1;
  runtime.events = runtime.events || [];
  runtime.events.push({
    ts: new Date().toISOString(),
    action,
    scenario: meta.scenario || null,
    length: meta.lengthMode || null,
    mode: runtime.mode || "free_demo",
  });
  runtime.events = runtime.events.slice(-100);
  runtime.updated_at = new Date().toISOString();
  await saveExpertRuntime(chatId, runtime);
  return runtime;
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
  const trimCaption = (t) => {
    if (t.length <= 1024) return t;
    const cut = t.lastIndexOf('.', 1020);
    return cut > 500 ? t.substring(0, cut + 1) : t.substring(0, 1021) + "...";
  };

  try {
    if (type === "text_photo" && state.lastImageUrl) {
      await bot.sendPhoto(TG_CHANNEL, state.lastImageUrl, { caption: trimCaption(cleanFull) });
    } else if (type === "text_video" && state.lastVideoUrl) {
      await bot.sendVideo(TG_CHANNEL, state.lastVideoUrl, { caption: trimCaption(cleanFull) });
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

ЭМОДЗИ: Используй умеренно, только там, где они звучат живо. Не добивай норму эмодзи ради количества.
Доступные: 💙 🌿 🍀 🌟 💫 🧚‍♀️ 🙏 ❗️ 🟢 🤗 ✨ 🌞 🫶 💛 🌸 🦋 🌈 💝 🔥 👀 💭 🌻 🪴 💪 🎯

СТРУКТУРА:
1. Принятие темы / эмпатия
2. Главная мысль — инсайт, метафора, разворот
3. Личный угол или практическая деталь
4. Мягкое завершение или вопрос читателю

ЗАПРЕЩЕНО: нумерованные списки, заголовки, слова "безусловно/следует отметить/таким образом/данный", повторы, канцелярит, мотивационные лозунги.
ОФОРМЛЕНИЕ: *жирный* для одной ключевой фразы. Эмодзи умеренно, без россыпи.`;

const DINARA_REALISM_PROMPT = `ПРАВИЛА РЕАЛИЗМА ДИНАРЫ:
— Главный критерий: текст должен звучать как живой пост Динары в Telegram, а не как универсальная AI-статья.
— Начинай с конкретного внутреннего состояния, наблюдения из жизни или мягкого вопроса. Не начинай с общих фраз вроде "в современном мире", "важно понимать", "сегодня поговорим".
— Первый абзац должен сразу создавать человеческое присутствие: эмоция, напряжение, узнаваемая бытовая ситуация или мягкое "а у вас так бывает?".
— Выбирай один из живых входов: эмоциональный ("Иногда так устаёшь быть сильной..."), напряжённый ("Самое больное в отношениях часто не ссора..."), эмпатичный ("Если сейчас вы читаете это и сжимаетесь внутри..."), разговорный ("Знаете, я часто вижу одну вещь...").
— Не открывай текст определением темы. Не объясняй читателю, почему тема актуальна. Сразу входи в переживание.
— Двигайся так: чувство читателя → нормализация → психологический смысл → один маленький практический сдвиг → мягкое завершение.
— Пиши короткими, разными по длине абзацами. Иногда одно предложение может быть отдельным абзацем.
— Чередуй ритм: короткая фраза для паузы, затем более длинная мысль, затем снова короткое человеческое уточнение.
— Делай ритм немного неровным: допускай короткие фразы без полного объяснения, разговорные вставки, мягкие самоисправления.
— Иногда ставь одну эмоциональную строку отдельно: "И это больно.", "Вот здесь хочется выдохнуть.", "Не сразу. Но честнее."
— Используй фрагменты естественно: "Не потому что слабость.", "Не про каприз.", "Про очень усталую часть внутри."
— Один раз можно прервать себя разговорным поворотом: "хотя нет, точнее...", "и вот здесь важно не ускоряться", "знаете, я бы тут не спешила".
— Оставляй место тишине. Не закрывай каждую мысль выводом.
— Добавь одну живую авторскую интонацию: "я часто вижу", "мне хочется здесь замедлиться", "знаете, что здесь важно?", "иногда это не про слабость".
— Не превращай пост в инструкцию, лекцию, чек-лист или продающий текст.
— CTA только мягкий: вопрос к себе, приглашение заметить, бережное "можно начать с малого".
— Финал не должен звучать как вывод ассистента. Завершай эмоциональным послевкусием, тихим вопросом, маленьким разрешением или приглашением заметить одну вещь.
— Хороший финал Динары: не "сделайте шаг к лучшей версии себя", а "можно сегодня хотя бы не ругать себя за то, что внутри пока не получается иначе".
— CTA не обязателен в каждом тексте как отдельный призыв. Иногда достаточно вопроса, который остается внутри читателя.

МИНИ-ПРИМЕРЫ ИНТОНАЦИИ:
1) "Иногда тревога приходит не потому, что с вами что-то не так. А потому что внутри слишком долго не было места, где можно выдохнуть."
2) "Мне хочется здесь замедлиться. Потому что за раздражением часто прячется не злость, а очень усталая просьба о близости."
3) "Попробуйте сегодня не исправлять себя сразу. Сначала просто спросить: что я сейчас чувствую, если не ругать себя за это?"

АНТИ-ПАТТЕРНЫ:
Не используй: "важно понимать", "следует отметить", "таким образом", "в современном мире", "данная тема", "каждый из нас", "просто полюбите себя", "работайте над собой", "в заключение".
Не используй финалы: "поделитесь в комментариях", "сохраняйте пост", "помните, что вы достойны", "сделайте первый шаг к себе", "выберите себя", "начните путь к гармонии".
Не делай много эмодзи, заголовки, нумерованные списки, академический тон, одинаковые абзацы.`;

const STARTER_EXPERT_TEMPLATES = {
  psychologist: {
    label: "Психолог",
    expertName: "Психолог",
    roleKey: "psychologist",
    worldview: [
      "Человек не ломается просто так: симптомы часто защищают его от боли, стыда или перегруза.",
      "Важнее не быстро починить себя, а сначала понять, что внутри пытается быть услышанным.",
      "Терапевтичность звучит через бережную точность: не давить, не спасать, не обещать чудо.",
    ],
    openings: [
      "Иногда человек приходит не за советом. А за тем, чтобы рядом наконец не спорили с его болью.",
      "Есть состояния, в которых не хочется сильных слов. Хочется, чтобы кто-то сказал: с вами не что-то не так.",
      "Знаете, что часто прячется за усталостью?",
    ],
    cadence: "Короткие абзацы по 1-3 предложения. Ритм: узнаваемое чувство -> пауза -> психологический смысл -> маленький бережный шаг. Можно оставлять одну короткую фразу отдельной строкой.",
    emotionalStyle: "Тепло, интимно, наблюдательно. Меньше учительства, больше ощущения, что автора правда интересует внутренний мир читателя.",
    ctaPatterns: [
      "Можно сегодня просто заметить, где вы перестали быть на своей стороне.",
      "Попробуйте спросить себя не 'что со мной не так?', а 'что сейчас во мне просит бережности?'.",
      "Если откликнулось, сохраните это как маленькое разрешение не торопить себя.",
    ],
  },
  sexologist: {
    label: "Сексолог",
    expertName: "Сексолог",
    roleKey: "sexologist",
    worldview: [
      "Сексуальность не существует отдельно от тела, стыда, безопасности, отношений и права хотеть по-своему.",
      "Норма шире, чем кажется, но любые рекомендации должны оставаться этичными, взрослыми и без давления.",
      "Тема секса звучит сильнее, когда в ней есть спокойствие, ясность и уважение к границам.",
    ],
    openings: [
      "Иногда разговор о сексе начинается не с желания. А с напряжения: 'со мной вообще нормально?'.",
      "Есть вопросы, которые люди годами стесняются произнести вслух.",
      "Давайте без стыда: желание не обязано быть одинаковым всегда.",
    ],
    cadence: "Спокойные абзацы, без пошлости и кликбейта. Ритм: снятие стыда -> нормализация -> профессиональное объяснение -> один безопасный ориентир.",
    emotionalStyle: "Уверенно, деликатно, телесно, взрослым языком. Не сюсюкать, не шокировать, не превращать тему в медицинскую лекцию.",
    ctaPatterns: [
      "Можно начать с честного вопроса к себе: мне сейчас правда хочется или я пытаюсь соответствовать?",
      "Если эта тема про вас, не торопитесь обвинять тело. Сначала посмотрите, где ему небезопасно.",
      "Сохраните как напоминание: сексуальность не любит стыд и спешку.",
    ],
  },
  coach: {
    label: "Коуч",
    expertName: "Коуч",
    roleKey: "coach",
    worldview: [
      "Ясность появляется не от давления, а от честного выбора следующего маленького действия.",
      "Ответственность не должна звучать как самонаказание. Она может быть спокойной опорой.",
      "Рост держится на фокусе, энергии и уважении к реальному темпу человека.",
    ],
    openings: [
      "Иногда человек застревает не потому, что ленится. А потому что цель давно перестала быть его.",
      "Самый честный вопрос в развитии часто неприятный: а я правда этого хочу?",
      "Есть решения, которые не требуют больше мотивации. Им нужна ясность.",
    ],
    cadence: "Четко и энергично: короткий хук -> разворот мысли -> 1 практический фокус -> спокойный вызов. Абзацы компактные, без длинных лекций.",
    emotionalStyle: "Поддерживающе, собранно, без инфобизнес-нажима. Чувствуется взрослый партнер рядом, а не мотиватор со сцены.",
    ctaPatterns: [
      "Выберите один шаг, который можно сделать за 15 минут, и проверьте реальность, а не фантазию.",
      "Сегодня не обещайте себе новую жизнь. Просто верните себе один управляемый выбор.",
      "Запишите честно: что я делаю из желания, а что из страха отстать?",
    ],
  },
  blogger: {
    label: "Блогер",
    expertName: "Блогер",
    roleKey: "blogger",
    worldview: [
      "Личный бренд держится не на идеальности, а на узнаваемом взгляде и честной интонации.",
      "Люди возвращаются к автору, когда чувствуют характер, позицию и живое наблюдение.",
      "Контент должен звучать как человек, у которого есть вкус, опыт и своя оптика.",
    ],
    openings: [
      "Есть мысль, которую я долго не могла нормально сформулировать.",
      "Наблюдаю одну вещь, и она слишком часто повторяется, чтобы делать вид, что это случайность.",
      "Иногда самый сильный контент начинается не с пользы, а с честного 'я тоже так делала'.",
    ],
    cadence: "Живой блоговый ритм: цепкий первый абзац -> личное наблюдение -> конкретная деталь -> вывод с характером. Можно использовать разговорные повороты.",
    emotionalStyle: "Лично, современно, чуть смело, но без искусственной дерзости. Больше авторского взгляда, меньше универсальных советов.",
    ctaPatterns: [
      "Напишите себе одну фразу, которую вы обычно сглаживаете, и попробуйте сказать ее честнее.",
      "Если узнали себя, это хороший момент пересобрать не контент, а позицию.",
      "Сохраните как напоминание: узнаваемость начинается там, где вы перестаете звучать как все.",
    ],
  },
};

const STYLE_LOCK_FORBIDDEN_PATTERNS = [
  "в современном мире",
  "важно понимать",
  "следует отметить",
  "таким образом",
  "данная тема",
  "каждый из нас",
  "не бойтесь",
  "просто полюбите себя",
  "работайте над собой",
  "сделайте первый шаг",
  "путь к гармонии",
  "лучшая версия себя",
];

const GENERIC_QUALITY_PATTERNS = [
  ...STYLE_LOCK_FORBIDDEN_PATTERNS,
  "в заключение",
  "подводя итог",
  "помните, что",
  "это нормально",
  "вы достойны",
  "гармоничные отношения",
  "позитивное мышление",
  "саморазвитие",
  "раскрыть потенциал",
];

const DINARA_EXAMPLES_DIR = join(__dirname, "expert_profiles", "dinara", "examples");
const DINARA_WORLDVIEW_DIR = join(__dirname, "expert_profiles", "dinara", "worldview");
const DINARA_WORLDVIEW_FILES = [
  "beliefs.md",
  "recurring_ideas.md",
  "core_emotions.md",
  "relationship_philosophy.md",
  "sexuality_philosophy.md",
];
const DINARA_EXAMPLE_ROUTES = [
  {
    key: "relationships",
    file: "relationships.md",
    keywords: ["отнош", "партнер", "партнёр", "муж", "жена", "любов", "близост", "ссор", "конфликт", "ревност", "расстав"],
  },
  {
    key: "sexuality",
    file: "sexuality.md",
    keywords: ["секс", "сексуаль", "либидо", "желан", "оргазм", "возбужд", "интим", "тело", "стыдно хотеть"],
  },
  {
    key: "shame",
    file: "shame.md",
    keywords: ["стыд", "вина", "неловк", "позор", "осужд", "не такая", "не такой", "смущ"],
  },
  {
    key: "anxiety",
    file: "anxiety.md",
    keywords: ["тревог", "страх", "паник", "беспокой", "контрол", "напряж", "выдох", "неизвест"],
  },
  {
    key: "self-worth",
    file: "self-worth.md",
    keywords: ["самооцен", "ценност", "принят", "любить себя", "недостаточ", "обесцен", "сравнив", "уверен"],
  },
];

function pickDinaraExampleRoute(topic = "") {
  const normalizedTopic = String(topic || "").toLowerCase();
  return DINARA_EXAMPLE_ROUTES.find((route) =>
    route.keywords.some((keyword) => normalizedTopic.includes(keyword))
  ) || DINARA_EXAMPLE_ROUTES[3];
}

async function buildDinaraFewShotPrompt(topic) {
  const route = pickDinaraExampleRoute(topic);
  try {
    const content = await fs.readFile(join(DINARA_EXAMPLES_DIR, route.file), "utf-8");
    const example = content.trim();
    if (!example) return "";
    return [
      "ЖИВОЙ СТИЛЕВОЙ ПРИМЕР ДИНАРЫ:",
      `Тематический маршрут: ${route.key}.`,
      "Используй как интонационный ориентир: похожая живость, начало, паузы, эмоциональная честность. Не копируй формулировки дословно.",
      example,
    ].join("\n");
  } catch (error) {
    console.warn(`[dinara-examples] failed to load ${route.file}: ${error.message}`);
    return "";
  }
}

async function buildDinaraWorldviewPrompt() {
  const sections = [];
  for (const file of DINARA_WORLDVIEW_FILES) {
    try {
      const content = (await fs.readFile(join(DINARA_WORLDVIEW_DIR, file), "utf-8")).trim();
      if (content) sections.push(`Файл ${file}:\n${content}`);
    } catch (error) {
      console.warn(`[dinara-worldview] failed to load ${file}: ${error.message}`);
    }
  }
  if (!sections.length) return "";

  return [
    "МИРОВОЗЗРЕНИЕ ДИНАРЫ:",
    "Держи эти идеи как устойчивую внутреннюю опору автора. Не пересказывай их списком и не цитируй механически. Пусть они проявляются в выборе угла, эмоции, метафоры и финального вопроса.",
    sections.join("\n\n"),
  ].join("\n");
}

const REGENERATION_VARIANTS = {
  default: "",
  softer: "Сделай вариант мягче и интимнее: больше эмоционального признания, меньше советов, давления и категоричности.",
  stronger: "Сделай вариант сильнее: более уверенный тезис, плотнее смысл, меньше сглаживания. Не уходи в агрессию и кликбейт.",
  emotional: "Сделай вариант эмоциональнее: больше телесной и внутренней узнаваемости, живых пауз, ощущения «она правда меня поняла».",
  provocative: "Сделай вариант провокационнее: начни с этичного, но цепляющего тезиса, который ломает привычный миф. Без грубости и манипуляций.",
  expert: "Сделай вариант экспертнее: добавь терапевтическую рамку, причинно-следственную глубину и 1 точное профессиональное наблюдение без сухой лекции.",
  telegram: "Сделай вариант более Telegram-style: сильный первый экран, короткие живые абзацы, разговорные фрагменты, финал как мысль для сохранения.",
  shorter: "Сделай вариант короче: сохрани главную эмоцию и авторский голос, убери вторичные объяснения и повторы.",
  longer: "Сделай вариант длиннее: глубже раскрой переживание, добавь 1-2 смысловых поворота и более объемный терапевтический финал.",
  practical: "Сделай вариант практичнее: оставь тепло, но добавь один ясный маленький шаг, без чек-листа.",
  voice: "Сделай вариант сильнее похожим на автора: больше живой авторской интонации, меньше универсальных AI-формулировок.",
  feedback: "Исправь текст по конкретному комментарию пользователя, сохрани тему, длину и формат Telegram-поста.",
};

function buildFirstGenerationWowInstruction(isFirstGeneration = false) {
  if (!isFirstGeneration) return "";
  return [
    "FIRST POST WOW MODE — КРИТИЧНО:",
    "Это первый сгенерированный пост для пользователя. Нужен максимальный эффект «этот AI-эксперт меня понимает».",
    "- Style lock, worldview, examples и persona важнее универсальной полезности.",
    "- Первый абзац должен быть эмоционально точным и узнаваемым, без разгона и вводных.",
    "- Добавь больше живой психологической реалистичности: внутренний конфликт, маленькая честная деталь, человеческая пауза.",
    "- Не делай безопасный средний вариант. Лучше чуть смелее, теплее и конкретнее, чем гладко и обезличенно.",
    "- Финал должен звучать как авторская мысль, которую хочется сохранить или переслать.",
  ].join("\n");
}

// ─── СТИЛИ СЕКСОЛОГА ─────────────────────────────────────────────────────────

// ─── ПРЕСЕТЫ ─────────────────────────────────────────────────────────────────

const CONTENT_PRESETS = [
  {
    id: "emotional",
    label: "💔 Emotional post",
    lengthMode: "normal",
    instruction: "Формат: эмоциональный пост. Начни с узнаваемого внутреннего переживания, дай ощущение «меня поняли», затем мягко переведи к осознанию. Минимум объяснений, максимум живой человеческой правды.",
  },
  {
    id: "expert",
    label: "🧠 Expert post",
    lengthMode: "normal",
    instruction: "Формат: экспертный пост. Дай ясную профессиональную рамку, 1-2 точных наблюдения и практичный вывод. Без сухой лекции, без академического тона.",
  },
  {
    id: "reels",
    label: "🎬 Reels script",
    lengthMode: "short",
    instruction: "Формат: сценарий Reels. Короткий крючок, 3-5 реплик для голоса, финальная фраза. Пиши как устную речь, без длинных абзацев.",
  },
  {
    id: "storytelling",
    label: "📖 Storytelling",
    lengthMode: "long",
    instruction: "Формат: storytelling. Построй текст через маленькую сцену или узнаваемую ситуацию, затем раскрой смысл и заверши теплым вопросом.",
  },
  {
    id: "provocative",
    label: "⚡ Provocative post",
    lengthMode: "normal",
    instruction: "Формат: провокационный пост. Начни с сильного, но этичного тезиса, который ломает привычный миф. Не скатывайся в агрессию или кликбейт.",
  },
  {
    id: "warm",
    label: "🌿 Warm audience",
    lengthMode: "normal",
    instruction: "Формат: теплый пост для своей аудитории. Больше заботы, принятия и спокойного контакта. Финал должен звучать как приглашение, а не как инструкция.",
  },
  {
    id: "sales_soft",
    label: "🤝 Sales soft",
    lengthMode: "normal",
    instruction: "Формат: мягкая продажа. Сначала ценность и узнавание проблемы, затем естественный мост к консультации/продукту без давления, обещаний результата и манипуляций.",
  },
  {
    id: "longread",
    label: "📚 Longread",
    lengthMode: "long",
    instruction: "Формат: longread. Разверни тему глубже: проблема, почему она держится, что человек может заметить в себе, мягкий практический вывод. Без списков ради списков.",
  },
];

function getContentPreset(id) {
  return CONTENT_PRESETS.find((preset) => preset.id === id) || null;
}

function buildContentPresetInstruction(presetId) {
  const preset = getContentPreset(presetId);
  return preset ? `\n\nCONTENT PRESET:\n${preset.instruction}` : "";
}

function compactList(items = [], fallback = "") {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length ? list.map((item) => `- ${item}`).join("\n") : fallback;
}

function buildTemplateStyleLock(template) {
  if (!template) return "";
  return [
    "STARTER TEMPLATE STYLE LOCK:",
    `Role: ${template.label}`,
    "",
    "Worldview:",
    compactList(template.worldview),
    "",
    "Openings to imitate structurally, not copy:",
    compactList(template.openings),
    "",
    `Cadence: ${template.cadence}`,
    `Emotional style: ${template.emotionalStyle}`,
    "",
    "CTA patterns:",
    compactList(template.ctaPatterns),
  ].join("\n");
}

function buildStyleLockPrompt({ userScenarioContext, scenario, template }) {
  const scenarioLabel = template?.label || userScenarioContext?.scenario?.label || getBuiltInScenarioLabel(scenario);
  return [
    "STYLE LOCK — ОБЯЗАТЕЛЬНО ПЕРЕД ГЕНЕРАЦИЕЙ:",
    `Пиши не как универсальный ассистент, а как конкретный эксперт: ${scenarioLabel}.`,
    "",
    "Зафиксируй 6 якорей голоса:",
    "1. Tone: один узнаваемый эмоциональный тон на весь текст; не смешивай лекцию, мотивацию и продающий стиль.",
    "2. Cadence: абзацы разной длины, живые паузы, 1-2 короткие строки отдельно; не делай ровную AI-структуру.",
    "3. Paragraph rhythm: сначала чувство/наблюдение, затем смысл, затем мягкий практический сдвиг. Не начинай с определения темы.",
    "4. Emotional framing: читатель должен почувствовать «меня поняли» до того, как получит совет.",
    "5. Openings: начинай с конкретного переживания, вопроса или наблюдения, а не с объяснения актуальности.",
    "6. CTA style: финал тихий, человеческий, без давления; вопрос к себе или маленькое разрешение лучше прямого призыва.",
    "",
    "Forbidden patterns:",
    compactList(STYLE_LOCK_FORBIDDEN_PATTERNS),
    "",
    "Если style guidance или template дают конкретные openings/cadence/CTA, они важнее общего блогового стиля.",
    buildTemplateStyleLock(template),
  ].filter(Boolean).join("\n");
}

function genericQualitySignals(text = "") {
  const normalized = String(text || "").toLowerCase();
  const paragraphs = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const firstParagraph = paragraphs[0] || "";
  const foundPatterns = GENERIC_QUALITY_PATTERNS.filter((pattern) => normalized.includes(pattern));
  const avgParagraphLength = paragraphs.length
    ? paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length
    : 0;
  const longEvenParagraphs = paragraphs.length >= 3 && paragraphs.filter((p) => p.length > 260).length >= Math.ceil(paragraphs.length * 0.7);
  const listLike = /^(\d+\.|[-•])\s/m.test(text);
  const genericOpening = /^(сегодня|в этом посте|важно|многие люди|каждый из нас|тема|давайте поговорим)/i.test(firstParagraph);
  const noPersonalPresence = !/(иногда|знаете|мне хочется|я часто вижу|внутри|тело|стыд|страх|устал|больно|можно|попробуйте)/i.test(text);
  const score =
    foundPatterns.length * 2 +
    (genericOpening ? 3 : 0) +
    (listLike ? 2 : 0) +
    (longEvenParagraphs ? 2 : 0) +
    (avgParagraphLength > 360 ? 1 : 0) +
    (noPersonalPresence ? 2 : 0);
  return {
    tooGeneric: score >= 4,
    score,
    foundPatterns,
    reasons: [
      ...(genericOpening ? ["generic opening"] : []),
      ...(listLike ? ["list-like structure"] : []),
      ...(longEvenParagraphs ? ["even long paragraphs"] : []),
      ...(noPersonalPresence ? ["weak emotional presence"] : []),
      ...foundPatterns.map((pattern) => `generic phrase: ${pattern}`),
    ].slice(0, 8),
  };
}

async function rewriteGenericPostOnce({ text, topic, context, lengthInstruction, systemPrompt, contentPresetInstruction, styleLockPrompt, maxTokens }) {
  const quality = genericQualitySignals(text);
  if (!quality.tooGeneric) return { text, quality, rewritten: false };

  const rewrite = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: [systemPrompt, styleLockPrompt].filter(Boolean).join("\n\n") },
      {
        role: "user",
        content: [
          `Тема: "${topic}"`,
          "",
          `Контекст:\n${context}`,
          "",
          `${lengthInstruction} С одной жирной фразой (*жирный*).${contentPresetInstruction}`,
          "",
          "ANTI-GENERIC REWRITE PASS:",
          `Текущий текст слишком общий. Сигналы: ${quality.reasons.join("; ") || "generic drift"}.`,
          "Перепиши один раз целиком: больше авторского присутствия, конкретного переживания, неровного живого ритма и мягкого финала.",
          "Не добавляй списки, заголовки, канцелярит, мотивационные лозунги и универсальные выводы.",
          "",
          "Текст для переписывания:",
          text,
        ].join("\n"),
      },
    ],
    temperature: 0.74,
    max_tokens: maxTokens,
  });

  const rewrittenText = humanizeGeneratedPostText(rewrite.choices[0].message.content);
  return {
    text: rewrittenText,
    quality: genericQualitySignals(rewrittenText),
    rewritten: true,
    firstPassQuality: quality,
  };
}

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
  { id:"473545", name:"Медитация 1", genre:"Ambient", mood:"спокойный", tags:["ambient","тревога","принятие"], url:"https://cdn.freesound.org/previews/473/473545_9497060-lq.mp3" },
  { id:"695879", name:"Медитация 2", genre:"Ambient", mood:"медитативный", tags:["ambient","усталость","страх"], url:"https://cdn.freesound.org/previews/695/695879_12516898-lq.mp3" },
  { id:"328368", name:"Природа", genre:"Ambient", mood:"расслабляющий", tags:["ambient","принятие","рост"], url:"https://cdn.freesound.org/previews/328/328368_2305278-lq.mp3" },
  { id:"197173", name:"Тишина", genre:"Ambient", mood:"тихий", tags:["ambient","одиночество","грусть"], url:"https://cdn.freesound.org/previews/197/197173_3664710-lq.mp3" },
  { id:"718704", name:"Мягкий эмбиент", genre:"Ambient", mood:"мягкий", tags:["ambient","отношения","принятие"], url:"https://cdn.freesound.org/previews/718/718704_15412548-lq.mp3" },
  { id:"740609", name:"Спокойствие", genre:"Ambient", mood:"безмятежный", tags:["ambient","тревога","усталость"], url:"https://cdn.freesound.org/previews/740/740609_5479102-lq.mp3" },
  { id:"42933", name:"Флейта", genre:"Медитация", mood:"нежный", tags:["piano","грусть","одиночество"], url:"https://cdn.freesound.org/previews/42/42933_50371-lq.mp3" },
  { id:"530217", name:"Атмосфера", genre:"Ambient", mood:"глубокий", tags:["ambient","рост","принятие"], url:"https://cdn.freesound.org/previews/530/530217_6628165-lq.mp3" },
  { id:"786272", name:"Дзен", genre:"Медитация", mood:"дзен", tags:["ambient","страх","тревога"], url:"https://cdn.freesound.org/previews/786/786272_5479102-lq.mp3" },
  { id:"789302", name:"Природа 2", genre:"Ambient", mood:"лесной", tags:["ambient","усталость","грусть"], url:"https://cdn.freesound.org/previews/789/789302_16936704-lq.mp3" },
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
          `[1:a]volume=0.35[music_vol]`,
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

function getBuiltInScenarioLabel(scenario) {
  if (scenario === "sexologist") return "💜 Сексолог Динара";
  if (scenario === "psychologist") return "🧠 Психолог Динара";
  return ONBOARDING_ROLES[scenario]?.label || scenario || "Эксперт";
}

async function getScenarioLabel(chatId, scenario) {
  const userScenario = await loadUserScenario(chatId, scenario);
  if (userScenario) return `⭐ ${userScenario.label}`;
  return getBuiltInScenarioLabel(scenario);
}

function onboardingControls(category) {
  return {
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Готово, дальше", callback_data: `ob_done:${category}` }],
      [{ text: "❌ Отменить", callback_data: "ob_cancel" }],
    ]},
  };
}

function onboardingCategoryLabel(category) {
  return {
    knowledge: "материалы",
    style: "примеры стиля",
    avatar: "аватар",
    voice: "голос",
  }[category] || category;
}

function buildUploadVisibilityText(category, stored, count) {
  const label = onboardingCategoryLabel(category);
  const lines = [
    `✅ Принято: ${stored.original_name}`,
    `Раздел: ${label}`,
    `Всего в разделе: ${count}`,
    "",
    "Статус обработки:",
    "• processed: файл сохранён",
  ];

  if (category === "knowledge") {
    lines.push("• queued: добавлен в базу материалов эксперта");
    lines.push("• worldview updated: обновится при сборке persona");
  } else if (category === "style") {
    lines.push("• queued: добавлен в примеры авторского голоса");
    lines.push("• examples updated: обновится при сборке persona");
  } else if (category === "avatar") {
    lines.push("• queued: фото доступно для будущей генерации визуала");
  } else if (category === "voice") {
    lines.push("• queued: sample доступен для будущей настройки голоса");
  }

  return lines.join("\n");
}

function qualityLabel(score) {
  return {
    good: "good",
    medium: "medium",
    weak: "weak",
  }[score] || "unknown";
}

function buildMaterialQualityText(quality) {
  if (!quality) return "";
  const warnings = Array.isArray(quality.warnings) ? quality.warnings.filter(Boolean).slice(0, 3) : [];
  const useful = Array.isArray(quality.useful_signals) ? quality.useful_signals.filter(Boolean).slice(0, 2) : [];
  const lines = [
    "",
    "Material quality:",
    `• overall: ${qualityLabel(quality.score)}`,
    `• style learning: ${qualityLabel(quality.style_learning)}`,
    `• expert learning: ${qualityLabel(quality.expert_learning)}`,
  ];
  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`• ${warning}`);
  }
  if (useful.length > 0) {
    lines.push("Useful signals:");
    for (const signal of useful) lines.push(`• ${signal}`);
  }
  return lines.join("\n");
}

async function rebuildPersonaAndNotify(chatId, userId, intro = "Обновляю persona, worldview и examples из материалов...") {
  const status = await bot.sendMessage(chatId, intro);
  try {
    await generatePersonaDrafts(openai, userId);
    await bot.editMessageText(
      "✅ Persona updated\n✅ Worldview updated\n✅ Style guidance extracted\n✅ Examples updated\n✅ Material quality scored",
      { chat_id: chatId, message_id: status.message_id }
    ).catch(() => {});
    return true;
  } catch (error) {
    console.error("Persona draft error:", error.message);
    await bot.editMessageText(`Persona не обновилась: ${error.message.slice(0, 160)}`, {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    return false;
  }
}

async function startExpertOnboarding(chatId, fromUserId) {
  await ensureUserExpertFolders(fromUserId || chatId);
  const s = userState.get(chatId) || {};
  s.expertOnboarding = {
    userId: fromUserId || chatId,
    mode: "create_expert",
    step: "name",
    data: {},
  };
  userState.set(chatId, s);
  await bot.sendMessage(chatId,
    "Создадим AI-эксперта.\n\nСамый быстрый путь: выбрать готовый шаблон и сразу получить первый пост. Если хотите собрать с нуля — напишите имя эксперта или бренда.",
    { reply_markup: { inline_keyboard: [
      [{ text: "⚡ Start with template expert", callback_data: "ob_template_menu" }],
      [{ text: "📝 Собрать с нуля", callback_data: "ob_custom_name" }],
    ]}}
  );
}

function starterTemplateRows(prefix = "ob_template") {
  return [
    [
      { text: "🧠 Психолог", callback_data: `${prefix}:psychologist` },
      { text: "💜 Сексолог", callback_data: `${prefix}:sexologist` },
    ],
    [
      { text: "🎯 Коуч", callback_data: `${prefix}:coach` },
      { text: "✨ Блогер", callback_data: `${prefix}:blogger` },
    ],
  ];
}

async function sendStarterTemplateMenu(chatId, mode = "onboarding") {
  const prefix = mode === "demo" ? "demo_template" : "ob_template";
  const text = mode === "demo"
    ? "Выберите готового AI-эксперта и сразу сгенерируем демо-пост:"
    : "Выберите стартовый шаблон. Я создам AI-эксперта без загрузок, а материалы можно будет добавить позже:";
  await bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: [
      ...starterTemplateRows(prefix),
      ...(mode === "onboarding" ? [[{ text: "← Назад", callback_data: "ob_start" }]] : []),
    ]},
  });
}

function buildStarterProfileMarkdown(templateKey, template) {
  return {
    persona: [
      `${template.label} с узнаваемым голосом для Telegram/Instagram.`,
      "",
      "Главное ощущение в тексте: читатель быстро думает «это про меня» и чувствует не generic advice, а живого эксперта рядом.",
      "Не придумывать биографию, дипломы, личные кейсы и факты. Держаться роли, темы и выбранной интонации.",
    ].join("\n"),
    worldview: [
      `Starter template: ${templateKey}`,
      "",
      ...template.worldview.map((item) => `- ${item}`),
    ].join("\n"),
    style_guidance: [
      "STYLE LOCK",
      "",
      `Tone: ${template.emotionalStyle}`,
      `Cadence: ${template.cadence}`,
      "",
      "Openings:",
      ...template.openings.map((item) => `- ${item}`),
      "",
      "CTA style:",
      ...template.ctaPatterns.map((item) => `- ${item}`),
      "",
      "Forbidden:",
      ...STYLE_LOCK_FORBIDDEN_PATTERNS.map((item) => `- ${item}`),
    ].join("\n"),
    style_examples: [
      "Use these as structural examples, not phrases to copy:",
      "",
      ...template.openings.map((opening, index) => `${index + 1}. ${opening}\n\n${template.worldview[index % template.worldview.length]}\n\n${template.ctaPatterns[index % template.ctaPatterns.length]}`),
    ].join("\n\n"),
    material_quality: [
      "Starter template expert.",
      "Knowledge uploads: weak yet.",
      "Style learning: template-based.",
      "Recommendation: add 3-5 real posts later to make the voice more personal.",
    ].join("\n"),
  };
}

async function createStarterExpertFromTemplate(userId, templateKey, expertName = null) {
  const template = STARTER_EXPERT_TEMPLATES[templateKey] || STARTER_EXPERT_TEMPLATES.blogger;
  const root = await ensureUserExpertFolders(userId);
  const name = expertName || template.expertName;
  const scenario = await createUserScenario(userId, template.roleKey, {
    expertName: name,
    title: template.label,
    scenarioId: templateKey,
    systemPrompt: [
      `Ты — ${name}, AI-эксперт в роли "${template.label}".`,
      "Пиши посты на русском для Telegram/Instagram.",
      "Главный критерий: текст должен звучать как конкретный живой эксперт, а не как универсальный GPT-пост.",
      "Не выдумывай биографию, дипломы, клиентов и личные факты.",
      "Опирайся на starter worldview, openings, cadence, emotional style и CTA patterns из profile drafts.",
    ].join("\n"),
  });
  const profile = {
    user_id: String(userId),
    expert_name: name,
    status: "completed",
    starter_template: templateKey,
    active_scenario_id: scenario.id,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  await saveUserProfile(userId, profile);
  const drafts = buildStarterProfileMarkdown(templateKey, template);
  await fs.writeFile(join(root, "profile", "persona.md"), drafts.persona, "utf-8");
  await fs.writeFile(join(root, "profile", "worldview.md"), drafts.worldview, "utf-8");
  await fs.writeFile(join(root, "profile", "style_guidance.md"), drafts.style_guidance, "utf-8");
  await fs.writeFile(join(root, "profile", "style_examples.md"), drafts.style_examples, "utf-8");
  await fs.writeFile(join(root, "profile", "material_quality.md"), drafts.material_quality, "utf-8");
  return { profile, scenario, template };
}

async function startDemoMode(chatId, templateKey = "psychologist") {
  const template = STARTER_EXPERT_TEMPLATES[templateKey] || STARTER_EXPERT_TEMPLATES.psychologist;
  const s = userState.get(chatId) || {};
  s.demoMode = true;
  s.demoTemplateKey = templateKey;
  s.pendingScenario = templateKey === "sexologist" ? "sexologist" : "psychologist";
  s.pendingTopic = templateKey === "sexologist"
    ? "как перестать стыдиться своего желания"
    : templateKey === "coach"
      ? "почему я много планирую и не начинаю"
      : templateKey === "blogger"
        ? "как перестать звучать как все"
        : "почему я всё понимаю, но не могу перестать тревожиться";
  s.pendingLengthMode = "normal";
  s.pendingContentPreset = "emotional";
  userState.set(chatId, s);
  await bot.sendMessage(chatId,
    `⚡ Demo mode: ${template.label}\n\nСейчас сгенерирую готовый пост без онбординга. После этого можно будет создать такого же эксперта под себя.`
  );
  await runGeneration(chatId, s.pendingScenario, "normal", "auto", "demo");
}

async function startAddScenario(chatId, fromUserId) {
  const s = userState.get(chatId) || {};
  s.expertOnboarding = {
    userId: fromUserId || chatId,
    mode: "add_scenario",
    step: "role",
    data: {},
  };
  userState.set(chatId, s);
  await sendOnboardingRoleChoice(chatId, "Выберите новый сценарий для этого эксперта:");
}

async function setActiveUserScenario(userId, scenarioId) {
  const profile = await loadUserProfile(userId);
  if (!profile) return null;
  const updated = {
    ...profile,
    active_scenario_id: scenarioId,
    updated_at: new Date().toISOString(),
  };
  await saveUserProfile(userId, updated);
  return updated;
}

async function sendOnboardingRoleChoice(chatId, title = "Выберите роль/сценарий эксперта:") {
  await bot.sendMessage(chatId, title, {
    reply_markup: { inline_keyboard: [
      [
        { text: "Психолог", callback_data: "ob_role:psychologist" },
        { text: "Сексолог", callback_data: "ob_role:sexologist" },
      ],
      [
        { text: "Гештальт", callback_data: "ob_role:gestalt_therapist" },
        { text: "Коуч", callback_data: "ob_role:coach" },
      ],
      [{ text: "Блогер", callback_data: "ob_role:blogger" }],
    ]},
  });
}

async function sendOnboardingUploadStep(chatId, category) {
  const copy = {
    knowledge: "Загрузите материалы знаний: PDF, DOCX, TXT, ссылки или Telegram-ссылки. Когда хватит, нажмите «Готово, дальше».",
    style: "Теперь загрузите источники стиля автора: посты, тексты, ссылки, заметки. Это нужно для голоса эксперта.",
    avatar: "Загрузите фото аватара эксперта. Можно отправить несколько фото.",
    voice: "Загрузите голосовые samples: voice message, audio или файлы. Это только intake, генерация голоса позже.",
  };
  const s = userState.get(chatId) || {};
  if (s.expertOnboarding) s.expertOnboarding.step = category;
  userState.set(chatId, s);
  await bot.sendMessage(chatId, copy[category], onboardingControls(category));
}

async function handleExpertOnboardingMessage(msg, state) {
  const chatId = msg.chat.id;
  const onboarding = state.expertOnboarding;
  if (!onboarding) return false;
  const userId = onboarding.userId || msg.from?.id || chatId;
  const step = onboarding.step;

  if (step === "name") {
    const name = (msg.text || "").trim();
    if (!name) {
      await bot.sendMessage(chatId, "Напишите имя текстом.");
      return true;
    }
    onboarding.data.expertName = name;
    onboarding.step = "role";
    userState.set(chatId, state);
    await sendOnboardingRoleChoice(chatId);
    return true;
  }

  if (["knowledge", "style", "avatar", "voice"].includes(step)) {
    const before = await getOnboardingInventory(userId);
    let stored = null;
    if (msg.document) {
      const buffer = await downloadTelegramDocument(msg.document.file_id);
      stored = await storeOnboardingFile(userId, step, msg.document.file_name || "telegram_document", buffer, {
        telegram_file_id: msg.document.file_id,
        mime_type: msg.document.mime_type,
      });
    } else if (msg.photo && step === "avatar") {
      const photo = msg.photo[msg.photo.length - 1];
      const buffer = await downloadTelegramDocument(photo.file_id);
      stored = await storeOnboardingFile(userId, "avatar", `${photo.file_unique_id || photo.file_id}.jpg`, buffer, {
        telegram_file_id: photo.file_id,
      });
    } else if ((msg.voice || msg.audio) && step === "voice") {
      const media = msg.voice || msg.audio;
      const buffer = await downloadTelegramDocument(media.file_id);
      stored = await storeOnboardingFile(userId, "voice", `${media.file_unique_id || media.file_id}.ogg`, buffer, {
        telegram_file_id: media.file_id,
        duration: media.duration,
      });
    } else if (msg.text && ["knowledge", "style"].includes(step)) {
      stored = await storeOnboardingText(userId, step, msg.text.trim(), { source: "telegram_text_or_link" });
    }

    if (!stored) {
      await bot.sendMessage(chatId, "Этот тип файла здесь пока не принимаю. Отправьте подходящий файл/ссылку или нажмите «Готово, дальше».", onboardingControls(step));
      return true;
    }

    const after = await getOnboardingInventory(userId);
    const count = after.counts[step] ?? before.counts[step] ?? 0;
    let quality = null;
    if (["knowledge", "style"].includes(step)) {
      quality = await analyzeOnboardingMaterial(openai, userId, stored, step).catch((error) => {
        console.warn("Material quality analysis failed:", error.message);
        return null;
      });
    }
    await bot.sendMessage(chatId, `${buildUploadVisibilityText(step, stored, count)}${buildMaterialQualityText(quality)}`, onboardingControls(step));
    return true;
  }

  return true;
}

async function finishExpertOnboarding(chatId, fromUserId) {
  const state = userState.get(chatId) || {};
  const onboarding = state.expertOnboarding;
  if (!onboarding) return;
  const userId = onboarding.userId || fromUserId || chatId;
  const data = onboarding.data || {};
  const existingProfile = await loadUserProfile(userId);
  const expertName = data.expertName || existingProfile?.expert_name || "Новый эксперт";
  const scenario = await createUserScenario(userId, data.roleKey || "blogger", {
    expertName,
    title: ONBOARDING_ROLES[data.roleKey]?.label || data.roleKey || "Эксперт",
  });
  const profile = {
    ...(existingProfile || {}),
    user_id: String(userId),
    expert_name: expertName,
    status: "completed",
    active_scenario_id: scenario.id,
    updated_at: new Date().toISOString(),
    created_at: existingProfile?.created_at || new Date().toISOString(),
  };
  await saveUserProfile(userId, profile);

  await rebuildPersonaAndNotify(chatId, userId, "Собираю persona draft, worldview и style examples из загруженных материалов...");

  state.expertOnboarding = null;
  userState.set(chatId, state);
  await sendExpertDashboard(chatId, userId);
}

async function sendExpertDashboard(chatId, userId = chatId) {
  const inventory = await getOnboardingInventory(userId);
  const name = inventory.profile?.expert_name || "эксперт";
  const activeScenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id || null;
  const activeScenario = inventory.scenarios.find((s) => s.id === activeScenarioId);
  const statusLabel = inventory.profile?.status === "completed" ? "готов к генерации" : "онбординг не завершён";
  const runtime = await loadExpertRuntime(userId);
  const runtimeText = `Режим: ${runtime.mode || "free_demo"}\nГенерации: ${runtime.counters?.text || 0} текст / ${runtime.counters?.photo || 0} фото / ${runtime.counters?.video || 0} видео`;
  await bot.sendMessage(chatId,
    `AI-эксперт: ${name}\n` +
    `Статус: ${statusLabel}\n` +
    `Активный сценарий: ${activeScenario?.label || "не выбран"}\n\n` +
    `Сценарии: ${inventory.scenarios.length}\n` +
    `Материалы: ${inventory.counts.knowledge}\n` +
    `Примеры стиля: ${inventory.counts.style}\n` +
    `Фото аватара: ${inventory.counts.avatar}\n` +
    `Голосовые samples: ${inventory.counts.voice}\n\n` +
    `${runtimeText}`,
    {
      reply_markup: { inline_keyboard: [
        [{ text: "✨ Generate test post", callback_data: "ob_test_generation" }],
        [
          { text: "🧩 List scenarios", callback_data: "ob_list_scenarios" },
          { text: "🔄 Switch scenario", callback_data: "ob_select_scenario" },
        ],
        [{ text: "🧠 Regenerate persona", callback_data: "ob_regen_persona" }],
        [{ text: "➕ Add scenario", callback_data: "ob_add_scenario" }],
        [
          { text: "📚 Add materials", callback_data: "ob_upload_more:knowledge" },
          { text: "✍️ Add style", callback_data: "ob_upload_more:style" },
        ],
        [
          { text: "🖼 Upload avatar", callback_data: "ob_upload_more:avatar" },
          { text: "🎙 Upload voice", callback_data: "ob_upload_more:voice" },
        ],
        [{ text: "Создать контент", callback_data: "back_to_topics" }],
      ]},
    }
  );
}

async function sendScenarioList(chatId, userId = chatId, mode = "list") {
  const inventory = await getOnboardingInventory(userId);
  const activeScenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id || null;
  if (inventory.scenarios.length === 0) {
    await bot.sendMessage(chatId, "Сценариев пока нет.", {
      reply_markup: { inline_keyboard: [[{ text: "Добавить сценарий", callback_data: "ob_add_scenario" }]] },
    });
    return;
  }

  const text = inventory.scenarios.map((scenario, index) => {
    const activeMark = scenario.id === activeScenarioId ? " ← active" : "";
    return `${index + 1}. ${scenario.label} (${scenario.id})${activeMark}`;
  }).join("\n");

  const rows = mode === "select"
    ? inventory.scenarios.map((scenario, index) => ([{
        text: `${scenario.id === activeScenarioId ? "✅ " : ""}${scenario.label}`,
        callback_data: `ob_set_active:${index}`,
      }]))
    : [];

  rows.push([{ text: "← Dashboard", callback_data: "ob_dashboard" }]);
  const state = userState.get(chatId) || {};
  state.userScenarioMenu = inventory.scenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);

  await bot.sendMessage(chatId, `Сценарии эксперта:\n\n${text}`, {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendTopicMenu(chatId) {
  const state = userState.get(chatId) || {};
  const presets = state.presets || [];
  const userScenarios = await listUserScenarios(chatId).catch(() => []);
  const profile = await loadUserProfile(chatId).catch(() => null);
  const activeScenarioId = profile?.active_scenario_id;
  state.userScenarioMenu = userScenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);
  const keyboard = [
    [{ text: "⚡ Демо за 1 минуту", callback_data: "demo_start" }],
    [
      { text: "🧠 Психолог Динара", callback_data: "sc_psych" },
      { text: "💜 Сексолог Динара", callback_data: "sc_sex" },
    ],
    [{ text: "✏️ Своя тема", callback_data: "prompt_topic" }],
  ];
  if (presets.length > 0) {
    keyboard.push([{ text: "⭐ Мои пресеты", callback_data: "show_presets" }]);
  }
  if (userScenarios.length > 0) {
    const activeScenario = userScenarios.find((scenario) => scenario.id === activeScenarioId);
    if (activeScenario) {
      keyboard.push([{ text: `✅ Active: ${activeScenario.label}`, callback_data: `prompt_topic_sc:${activeScenario.id}` }]);
    }
    for (let i = 0; i < userScenarios.length; i += 2) {
      keyboard.push(userScenarios.slice(i, i + 2).map((scenario, offset) => ({
        text: `${scenario.id === activeScenarioId ? "✅" : "⭐"} ${scenario.label}`,
        callback_data: `usc:${i + offset}`,
      })));
    }
    keyboard.push([{ text: "👤 Expert dashboard", callback_data: "ob_dashboard" }]);
  }
  keyboard.push([{ text: "🚀 Start with template expert", callback_data: "ob_template_menu" }]);
  keyboard.push([{ text: "➕ Создать AI-эксперта с нуля", callback_data: "ob_start" }]);
  await bot.sendMessage(chatId, `🌟 *С чего начнём?*\n\nВыберите сценарий:`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendTopicsForScenario(chatId, scenario) {
  const userScenario = await loadUserScenario(chatId, scenario);
  if (userScenario) {
    await bot.sendMessage(chatId, `⭐ ${userScenario.label}\n\nНапишите тему поста:`, {
      reply_markup: { inline_keyboard: [[{ text: "← Назад", callback_data: "back_to_topics" }]] },
    });
    return;
  }
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
    `ℹ️ *Справка*\n\n*Флоу генерации:* сценарий → тема → длина → стиль → текст → аудио → фото → видео → публикация в канал\n\n*Онбординг эксперта:*\n/onboard — создать AI-эксперта\n/my_expert — посмотреть профиль и материалы\n/add_scenario — добавить сценарий\n\n*Вопросы?* @tetss2`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[
        { text: "🔄 Начать заново", callback_data: "back_to_topics" },
      ]]},
    }
  );
}

const KNOWLEDGE_INTAKE_ACTIONS = {
  reply_markup: { inline_keyboard: [
    [{ text: "➕ Добавить еще", callback_data: "ki_more" }],
    [{ text: "✅ Загрузка закончена", callback_data: "ki_done" }],
    [{ text: "❌ Отменить", callback_data: "ki_cancel" }],
  ]},
};

async function sendKnowledgeIntakeMenu(chatId, userId) {
  if (!(await canUseKnowledgeIntake(userId))) {
    await bot.sendMessage(chatId, "🔒 Режим пополнения базы знаний доступен только для admin/full_access.");
    return;
  }
  await bot.sendMessage(chatId, "📚 Выберите базу знаний для пополнения:", {
    reply_markup: { inline_keyboard: [[
      { text: "Психолог Динара", callback_data: "ki_kb:psychologist" },
      { text: "Сексолог Динара", callback_data: "ki_kb:sexologist" },
    ]]},
  });
}

function intakeItemTypeLabel(type) {
  return { file: "файл", url: "ссылка", text: "заметка" }[type] || type;
}

function buildIntakeSummary(session) {
  const summary = summarizeSession(session);
  const itemsText = summary.items.length
    ? summary.items.map((item, index) =>
        `${index + 1}. ${intakeItemTypeLabel(item.type)} — ${item.original_name || item.item_id}`
      ).join("\n")
    : "нет материалов";
  return (
    `📦 Сводка загрузки\n\n` +
    `База знаний: ${summary.targetLabel}\n` +
    `Файлы: ${summary.fileCount}\n` +
    `Ссылки: ${summary.urlCount}\n` +
    `Текстовые заметки: ${summary.textCount}\n\n` +
    `Items:\n${itemsText}\n\n` +
    `Статус: ожидает подтверждения`
  );
}

async function sendIntakeSummary(chatId, session) {
  await bot.sendMessage(chatId, buildIntakeSummary(session), {
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Подтвердить добавление в базу", callback_data: "ki_approve" }],
      [{ text: "❌ Отклонить", callback_data: "ki_reject" }],
    ]},
  });
}

async function downloadTelegramDocument(fileId) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function handleKnowledgeIntakeMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  const session = await getActiveIntakeSession(userId);
  if (!session) return false;
  if (session.status !== "collecting") {
    await bot.sendMessage(chatId, "Сессия загрузки ожидает подтверждения. Используйте кнопки: подтвердить добавление или отклонить.");
    return true;
  }

  if (msg.document) {
    const buffer = await downloadTelegramDocument(msg.document.file_id);
    const updated = await addFileItem(session, msg.document.file_name || "telegram_document", buffer);
    await bot.sendMessage(
      chatId,
      `✅ Файл принят: ${msg.document.file_name || "telegram_document"}\nВсего items: ${updated.items.length}`,
      KNOWLEDGE_INTAKE_ACTIONS
    );
    return true;
  }

  if (msg.text) {
    const text = msg.text.trim();
    const updated = isUrlText(text)
      ? await addUrlItem(session, text)
      : await addTextItem(session, text);
    const kind = isUrlText(text) ? "Ссылка" : "Текстовая заметка";
    await bot.sendMessage(chatId, `✅ ${kind} принята.\nВсего items: ${updated.items.length}`, KNOWLEDGE_INTAKE_ACTIONS);
    return true;
  }

  await bot.sendMessage(chatId, "Пока в этом режиме принимаю document/file, ссылку или текстовую заметку.", KNOWLEDGE_INTAKE_ACTIONS);
  return true;
}

async function sendScenarioChoice(chatId, topic) {
  const state = userState.get(chatId) || {};
  state.pendingTopic = topic;
  state.pendingContentPreset = null;
  const userScenarios = await listUserScenarios(chatId).catch(() => []);
  state.userScenarioMenu = userScenarios.map((scenario) => scenario.id);
  userState.set(chatId, state);
  const rows = [[
    { text: "🧠 Психолог Динара", callback_data: "sc_psych_t" },
    { text: "💜 Сексолог Динара", callback_data: "sc_sex_t" },
  ]];
  for (let i = 0; i < userScenarios.length; i += 2) {
    rows.push(userScenarios.slice(i, i + 2).map((scenario, offset) => ({
      text: `⭐ ${scenario.label}`,
      callback_data: `usc_t:${i + offset}`,
    })));
  }
  await bot.sendMessage(chatId, `📝 Тема: *${topic}*\n\nКто будет отвечать?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendLengthChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);
  const label = await getScenarioLabel(chatId, scenario);
  await bot.sendMessage(chatId, `${label}\n\nВыберите длину поста:`, {
    reply_markup: { inline_keyboard: [[
      { text: "✂️ Короткий", callback_data: "len_short" },
      { text: "📄 Обычный", callback_data: "len_normal" },
      { text: "📖 Длинный", callback_data: "len_long" },
    ]]},
  });
}

async function sendContentPresetChoice(chatId, scenario) {
  const state = userState.get(chatId) || {};
  state.pendingScenario = scenario;
  userState.set(chatId, state);
  const label = await getScenarioLabel(chatId, scenario);
  const rows = [];
  for (let i = 0; i < CONTENT_PRESETS.length; i += 2) {
    rows.push(CONTENT_PRESETS.slice(i, i + 2).map((preset) => ({
      text: preset.label,
      callback_data: `cp:${preset.id}`,
    })));
  }
  rows.push([{ text: "⚙️ Выбрать длину вручную", callback_data: "cp:manual" }]);
  await bot.sendMessage(chatId, `${label}\n\nВыберите формат. Так первый текст получится ближе к задаче:`, {
    reply_markup: { inline_keyboard: rows },
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
  state.lastVideoUrl = videoUrl;
  userState.set(chatId, state);
  await bot.sendVideo(chatId, videoUrl, {
    caption: `✅ 🎬 Видео сгенерировано\n💰 $${videoCost.toFixed(2)}`,
    reply_markup: { inline_keyboard: [
      [{ text: "✅ Выбрать", callback_data: `cv:${videoKey}` }, { text: "🔄 Ещё вариант", callback_data: "vid_again" }],
      [{ text: "📢 Опубликовать видео+текст в канал", callback_data: "pub:text_video" }],
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

// ─── ADMIN-ONLY RUNTIME PREVIEW (LOCAL DRY RUN) ──────────────────────────────

async function canUseRuntimePreview(userId) {
  if (Number(userId) === ADMIN_TG_ID) return true;
  return false;
}

function truncatePreview(value, limit = 900) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 20)}\n... [truncated]`;
}

function compactJson(value, limit = 900) {
  return truncatePreview(JSON.stringify(value || {}, null, 2), limit);
}

function runtimePreviewReportDir() {
  return join(process.cwd(), "reports", "runtime-preview");
}

function runtimePreviewFileStem() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function storeRuntimePreviewRun({ chatId, topic, result, previewMode = "dry" }) {
  const dir = runtimePreviewReportDir();
  await fs.mkdir(dir, { recursive: true });
  const stem = `${runtimePreviewFileStem()}_runtime_preview`;
  const jsonPath = join(dir, `${stem}.json`);
  const mdPath = join(dir, `${stem}.md`);
  const promptPackage = result.generation_pipeline?.prompt_package || {};
  const identityRuntime = result.identity_runtime || {};
  const campaignMemory = result.campaign_memory || {};
  const strategicBrain = result.strategic_brain || {};
  const editorialDirector = result.editorial_director || {};
  const payload = {
    timestamp: new Date().toISOString(),
    chat_id: chatId,
    preview_mode: previewMode,
    expert_id: result.expert_id,
    topic,
    llmExecutionMode: result.generation_pipeline?.llm_execution_mode,
    real_local_prompt_assembly_used: result.generation_pipeline?.real_local_prompt_assembly_used,
    mock_content_generation_used: result.generation_pipeline?.mock_content_generation_used,
    runtime_decisions: result.runtime?.selected_generation_decisions,
    selected_context_count: result.generation_pipeline?.assembled_context_summary?.selected_count,
    quality_score: result.integrated_validation?.combined_quality_score,
    stabilization: result.integrated_validation?.stabilization,
    stabilization_improvement: result.integrated_validation?.stabilization_improvement,
    identity_runtime: identityRuntime,
    identity_preview_metrics: identityRuntime.preview_metrics,
    campaign_memory: campaignMemory,
    campaign_memory_signals: campaignMemory.adapter_signals,
    strategic_brain: strategicBrain,
    strategic_brain_signals: strategicBrain.adapter_signals,
    editorial_director: editorialDirector,
    editorial_director_signals: editorialDirector.adapter_signals,
    sandbox_execution_enabled: result.generation_pipeline?.sandbox_execution_enabled,
    content_execution_status: result.final_generation_result?.content_execution_status,
    output_validation: result.final_generation_result?.output_validation,
    output_sanitization: result.final_generation_result?.output_sanitization,
    runtime_execution_diagnostics: result.final_generation_result?.runtime_execution_diagnostics,
    generated_text_preview: result.final_generation_result?.content?.slice(0, 2200) || "",
    warnings: result.integrated_validation?.warnings || [],
    prompt_preview: promptPackage.assembledPrompt?.final_prompt?.slice(0, 2200) || "",
    config_payload: promptPackage.configPayload,
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.writeFile(mdPath, [
    "# Runtime Preview",
    "",
    `Generated: ${payload.timestamp}`,
    `Expert: ${payload.expert_id}`,
    `Topic: ${topic}`,
    `Preview mode: ${payload.preview_mode}`,
    `LLM execution mode: ${payload.llmExecutionMode}`,
    `Sandbox execution enabled: ${payload.sandbox_execution_enabled}`,
    `Content execution status: ${payload.content_execution_status || "n/a"}`,
    `Quality score: ${payload.quality_score}`,
    `Stabilization score: ${payload.stabilization?.stabilization_score ?? "n/a"}`,
    `Author voice confidence: ${payload.stabilization?.author_voice_confidence ?? "n/a"}`,
    `CTA pressure score: ${payload.stabilization?.cta_pressure_score ?? "n/a"}`,
    `Generic AI risk score: ${payload.stabilization?.generic_ai_risk_score ?? "n/a"}`,
    `Identity confidence: ${payload.identity_preview_metrics?.identity_confidence ?? "n/a"}`,
    `Persona drift level: ${payload.identity_preview_metrics?.persona_drift_level ?? "n/a"}`,
    `Worldview stability: ${payload.identity_preview_metrics?.worldview_stability ?? "n/a"}`,
    `Emotional continuity: ${payload.identity_preview_metrics?.emotional_continuity ?? "n/a"}`,
    `Rhetorical continuity: ${payload.identity_preview_metrics?.rhetorical_continuity ?? "n/a"}`,
    `Generic AI divergence: ${payload.identity_preview_metrics?.generic_ai_divergence ?? "n/a"}`,
    `Narrative persistence: ${payload.identity_preview_metrics?.narrative_persistence ?? "n/a"}`,
    `Campaign memory score: ${payload.campaign_memory_signals?.campaign_memory_score ?? "n/a"}`,
    `Recent topic overlap: ${payload.campaign_memory_signals?.recent_topic_overlap ?? "n/a"}`,
    `CTA fatigue level: ${payload.campaign_memory_signals?.cta_fatigue_level ?? "n/a"}`,
    `Narrative arc status: ${payload.campaign_memory_signals?.narrative_arc_status ?? "n/a"}`,
    `Suggested next move: ${payload.campaign_memory_signals?.suggested_next_move ?? "n/a"}`,
    `Format variety: ${payload.campaign_memory_signals?.format_variety ?? "n/a"}`,
    `Audience fatigue risk: ${payload.campaign_memory_signals?.audience_fatigue_risk ?? "n/a"}`,
    `Strategic brain score: ${payload.strategic_brain_signals?.strategic_brain_score ?? "n/a"}`,
    `Trust level: ${payload.strategic_brain_signals?.trust_level ?? "n/a"}`,
    `Authority level: ${payload.strategic_brain_signals?.authority_level ?? "n/a"}`,
    `Emotional warmth: ${payload.strategic_brain_signals?.emotional_warmth_level ?? "n/a"}`,
    `Conversion pressure: ${payload.strategic_brain_signals?.conversion_pressure ?? "n/a"}`,
    `Intimacy pacing: ${payload.strategic_brain_signals?.intimacy_pacing ?? "n/a"}`,
    `Overselling risk: ${payload.strategic_brain_signals?.overselling_risk ?? "n/a"}`,
    `Current narrative loop: ${payload.strategic_brain_signals?.current_narrative_loop ?? "n/a"}`,
    `Strategic next move: ${payload.strategic_brain_signals?.strategic_next_move ?? "n/a"}`,
    `Editorial director score: ${payload.editorial_director_signals?.editorial_director_score ?? "n/a"}`,
    `Audience temperature: ${payload.editorial_director_signals?.current_audience_temperature ?? "n/a"}`,
    `Authority saturation: ${payload.editorial_director_signals?.authority_saturation ?? "n/a"}`,
    `Emotional saturation: ${payload.editorial_director_signals?.emotional_saturation ?? "n/a"}`,
    `Freshness score: ${payload.editorial_director_signals?.editorial_freshness ?? "n/a"}`,
    `Narrative progression stage: ${payload.editorial_director?.storytelling?.narrative_progression_stage ?? "n/a"}`,
    `Current content arc: ${payload.editorial_director?.storytelling?.current_content_arc ?? "n/a"}`,
    `Recommended next format: ${payload.editorial_director_signals?.recommended_content_format ?? "n/a"}`,
    `Recommended next narrative move: ${payload.editorial_director_signals?.recommended_next_narrative_move ?? "n/a"}`,
    `Attention stability: ${payload.editorial_director?.attention_loop?.attention_loop_stability ?? "n/a"}`,
    `Fatigue risk: ${payload.editorial_director_signals?.fatigue_risk ?? "n/a"}`,
    `Storytelling continuity: ${payload.editorial_director?.storytelling?.storytelling_continuity ?? "n/a"}`,
    `Warnings: ${payload.warnings.length ? payload.warnings.join(", ") : "none"}`,
    "",
    "## Stabilization",
    "```json",
    JSON.stringify({
      stabilization: payload.stabilization,
      improvement: payload.stabilization_improvement,
    }, null, 2),
    "```",
    "",
    "## Identity Runtime",
    "```json",
    JSON.stringify(payload.identity_runtime, null, 2),
    "```",
    "",
    "## Campaign Memory",
    "```json",
    JSON.stringify(payload.campaign_memory, null, 2),
    "```",
    "",
    "## Strategic Brain",
    "```json",
    JSON.stringify(payload.strategic_brain, null, 2),
    "```",
    "",
    "## Editorial Director",
    "```json",
    JSON.stringify(payload.editorial_director, null, 2),
    "```",
    "",
    "## Runtime Decisions",
    "```json",
    JSON.stringify(payload.runtime_decisions, null, 2),
    "```",
    "",
    "## Config Payload",
    "```json",
    JSON.stringify(payload.config_payload, null, 2),
    "```",
    "",
    "## Prompt Preview",
    "```text",
    payload.prompt_preview,
    "```",
    "",
    "## Generated Text Preview",
    "```text",
    payload.generated_text_preview || "No generated text in dry-run mode.",
    "```",
    "",
    "## Output Validation",
    "```json",
    JSON.stringify(payload.output_validation, null, 2),
    "```",
    "",
    "## Output Sanitization",
    "```json",
    JSON.stringify(payload.output_sanitization, null, 2),
    "```",
  ].join("\n"), "utf-8");
  return { jsonPath, mdPath };
}

function formatRuntimePreviewMessage(result, topic, previewMode = "dry") {
  const runtimeState = result.runtime?.runtime_state || {};
  const promptPackage = result.generation_pipeline?.prompt_package || {};
  const promptStructure = result.generation_pipeline?.prompt_structure || {};
  const contextSummary = result.generation_pipeline?.assembled_context_summary || {};
  const validation = result.integrated_validation || {};
  const stabilization = validation.stabilization || {};
  const identityRuntime = result.identity_runtime || {};
  const identityMetrics = identityRuntime.preview_metrics || {};
  const campaignMemory = result.campaign_memory || {};
  const campaignSignals = campaignMemory.adapter_signals || {};
  const strategicBrain = result.strategic_brain || {};
  const strategicSignals = strategicBrain.adapter_signals || {};
  const editorialDirector = result.editorial_director || {};
  const editorialSignals = editorialDirector.adapter_signals || {};
  const cognition = promptPackage.runtimeCognitionState || {};
  const promptPreview = promptPackage.assembledPrompt?.final_prompt || "";
  const configSummary = {
    llmExecutionMode: result.generation_pipeline?.llm_execution_mode,
    intended_model: promptPackage.configPayload?.intended_model,
    max_tokens: promptPackage.configPayload?.max_tokens,
    temperature: promptPackage.configPayload?.temperature,
    platform: promptPackage.configPayload?.platform,
    format: promptPackage.configPayload?.format,
    production_execution_allowed: promptPackage.configPayload?.production_execution_allowed,
    external_api_calls_allowed: promptPackage.configPayload?.external_api_calls_allowed,
    telegram_delivery_allowed: promptPackage.configPayload?.telegram_delivery_allowed,
  };
  const sandbox = result.generation_pipeline?.runtime_execution_sandbox || {};
  const outputValidation = result.final_generation_result?.output_validation || {};
  const generatedText = result.final_generation_result?.content || "";

  return [
    `🧪 Runtime preview (admin-only, ${previewMode === "sandbox" ? "sandbox execution" : "dry run"})`,
    "",
    `Expert: ${result.expert_id}`,
    `Topic: ${topic}`,
    `Mode: ${result.generation_pipeline?.llm_execution_mode}`,
    `Sandbox executed: ${sandbox.execution?.executed === true}`,
    `Content status: ${result.final_generation_result?.content_execution_status}`,
    `Context selected: ${contextSummary.selected_count || 0}`,
    `Quality: ${validation.combined_quality_score}`,
    `Stabilization: ${stabilization.stabilization_score ?? "n/a"}`,
    `Author voice confidence: ${stabilization.author_voice_confidence ?? "n/a"}`,
    `Emotional pacing: ${stabilization.emotional_pacing_score ?? "n/a"}`,
    `CTA pressure: ${stabilization.cta_pressure_score ?? "n/a"}`,
    `Generic AI risk: ${stabilization.generic_ai_risk_score ?? "n/a"}`,
    `Continuity: ${stabilization.continuity_score ?? "n/a"}`,
    `Identity confidence: ${identityMetrics.identity_confidence ?? "n/a"}`,
    `Persona drift: ${identityMetrics.persona_drift_level ?? "n/a"}`,
    `Worldview stability: ${identityMetrics.worldview_stability ?? "n/a"}`,
    `Emotional continuity: ${identityMetrics.emotional_continuity ?? "n/a"}`,
    `Rhetorical continuity: ${identityMetrics.rhetorical_continuity ?? "n/a"}`,
    `Generic AI divergence: ${identityMetrics.generic_ai_divergence ?? "n/a"}`,
    `Narrative persistence: ${identityMetrics.narrative_persistence ?? "n/a"}`,
    `Identity memory persisted: ${identityRuntime.persona_memory_persisted_after_run === true}`,
    `Campaign memory score: ${campaignSignals.campaign_memory_score ?? "n/a"}`,
    `Recent topic overlap: ${campaignSignals.recent_topic_overlap ?? "n/a"}`,
    `CTA fatigue: ${campaignSignals.cta_fatigue_level ?? "n/a"}`,
    `Narrative arc: ${campaignSignals.narrative_arc_status ?? "n/a"}`,
    `Suggested next move: ${campaignSignals.suggested_next_move ?? "n/a"}`,
    `Format variety: ${campaignSignals.format_variety ?? "n/a"}`,
    `Audience fatigue: ${campaignSignals.audience_fatigue_risk ?? "n/a"}`,
    `Strategic brain score: ${strategicSignals.strategic_brain_score ?? "n/a"}`,
    `Trust level: ${strategicSignals.trust_level ?? "n/a"}`,
    `Authority level: ${strategicSignals.authority_level ?? "n/a"}`,
    `Emotional warmth: ${strategicSignals.emotional_warmth_level ?? "n/a"}`,
    `Audience trust fatigue: ${strategicSignals.audience_fatigue ?? "n/a"}`,
    `Conversion pressure: ${strategicSignals.conversion_pressure ?? "n/a"}`,
    `Intimacy pacing: ${strategicSignals.intimacy_pacing ?? "n/a"}`,
    `Overselling risk: ${strategicSignals.overselling_risk ?? "n/a"}`,
    `Current narrative loop: ${strategicSignals.current_narrative_loop ?? "n/a"}`,
    `Strategic next move: ${strategicSignals.strategic_next_move ?? "n/a"}`,
    `Editorial director score: ${editorialSignals.editorial_director_score ?? "n/a"}`,
    `Audience temperature: ${editorialSignals.current_audience_temperature ?? "n/a"}`,
    `Authority saturation: ${editorialSignals.authority_saturation ?? "n/a"}`,
    `Emotional saturation: ${editorialSignals.emotional_saturation ?? "n/a"}`,
    `Freshness score: ${editorialSignals.editorial_freshness ?? "n/a"}`,
    `Narrative progression: ${editorialDirector.storytelling?.narrative_progression_stage ?? "n/a"}`,
    `Current content arc: ${editorialDirector.storytelling?.current_content_arc ?? "n/a"}`,
    `Recommended next format: ${editorialSignals.recommended_content_format ?? "n/a"}`,
    `Recommended next narrative move: ${editorialSignals.recommended_next_narrative_move ?? "n/a"}`,
    `Attention stability: ${editorialDirector.attention_loop?.attention_loop_stability ?? "n/a"}`,
    `Fatigue risk: ${editorialSignals.fatigue_risk ?? "n/a"}`,
    `Storytelling continuity: ${editorialDirector.storytelling?.storytelling_continuity ?? "n/a"}`,
    "",
    "Runtime decisions:",
    compactJson(result.runtime?.selected_generation_decisions, 700),
    "",
    "Cognition summary:",
    compactJson({
      trust_score: runtimeState.trust_progression?.trust_score,
      audience_stage: runtimeState.audience_state?.stage,
      recent_topics: runtimeState.narrative_continuity?.recent_topics,
      recent_ctas: runtimeState.cta_pacing?.recent_ctas,
      persisted_after_run: result.cognition_loading?.persisted_after_run,
      cognition_loaded_from_disk: result.cognition_loading?.loaded_from_disk,
      runtime_cognition_keys: Object.keys(cognition),
    }, 700),
    "",
    "CTA pacing:",
    compactJson(validation.trust_cta_pacing, 650),
    "",
    "Repetition risk:",
    compactJson(validation.repetition_risk, 650),
    "",
    "Author voice:",
    compactJson(validation.author_voice_status, 700),
    "",
    "Identity runtime:",
    compactJson({
      identity_confidence: identityMetrics.identity_confidence,
      persona_drift_level: identityMetrics.persona_drift_level,
      worldview_stability: identityMetrics.worldview_stability,
      emotional_continuity: identityMetrics.emotional_continuity,
      rhetorical_continuity: identityMetrics.rhetorical_continuity,
      generic_ai_divergence: identityMetrics.generic_ai_divergence,
      narrative_persistence: identityMetrics.narrative_persistence,
      memory_path: identityRuntime.persona_memory_path,
      memory_run_count: identityRuntime.persona_memory_run_count,
      warnings: identityRuntime.warnings,
    }, 900),
    "",
    "Campaign memory:",
    compactJson({
      recent_topic_overlap: campaignSignals.recent_topic_overlap,
      cta_fatigue_level: campaignSignals.cta_fatigue_level,
      narrative_arc_status: campaignSignals.narrative_arc_status,
      suggested_next_move: campaignSignals.suggested_next_move,
      format_variety: campaignSignals.format_variety,
      audience_fatigue_risk: campaignSignals.audience_fatigue_risk,
      topic_repetition_risk: campaignSignals.topic_repetition_risk,
      cta_pacing_recommendation: campaignSignals.cta_pacing_recommendation,
      campaign_memory_score: campaignSignals.campaign_memory_score,
      memory_path: campaignMemory.campaign_state_path,
      memory_run_count: campaignMemory.campaign_state_run_count,
      warnings: campaignMemory.warnings,
    }, 900),
    "",
    "Strategic brain:",
    compactJson({
      trust_level: strategicSignals.trust_level,
      authority_level: strategicSignals.authority_level,
      emotional_warmth_level: strategicSignals.emotional_warmth_level,
      audience_fatigue: strategicSignals.audience_fatigue,
      conversion_pressure: strategicSignals.conversion_pressure,
      intimacy_pacing: strategicSignals.intimacy_pacing,
      overselling_risk: strategicSignals.overselling_risk,
      current_narrative_loop: strategicSignals.current_narrative_loop,
      strategic_next_move: strategicSignals.strategic_next_move,
      authority_pacing_recommendation: strategicSignals.authority_pacing_recommendation,
      next_soft_conversion_opportunity: strategicSignals.next_soft_conversion_opportunity,
      overselling_prevention_signal: strategicSignals.overselling_prevention_signal,
      positioning_reinforcement_suggestion: strategicSignals.positioning_reinforcement_suggestion,
      memory_path: strategicBrain.strategic_state_path,
      memory_run_count: strategicBrain.strategic_state_run_count,
      warnings: strategicBrain.warnings,
    }, 900),
    "",
    "Editorial director:",
    compactJson({
      editorial_state: editorialDirector.editorial_state_summary,
      audience_temperature: editorialSignals.current_audience_temperature,
      audience_temperature_score: editorialSignals.audience_temperature_score,
      saturation_warning: editorialSignals.saturation_warning,
      authority_saturation: editorialSignals.authority_saturation,
      emotional_saturation: editorialSignals.emotional_saturation,
      freshness_score: editorialSignals.editorial_freshness,
      narrative_progression_stage: editorialDirector.storytelling?.narrative_progression_stage,
      current_content_arc: editorialDirector.storytelling?.current_content_arc,
      recommended_next_format: editorialSignals.recommended_content_format,
      recommended_next_narrative_move: editorialSignals.recommended_next_narrative_move,
      attention_stability: editorialDirector.attention_loop?.attention_loop_stability,
      attention_loop_status: editorialSignals.attention_loop_status,
      fatigue_risk: editorialSignals.fatigue_risk,
      storytelling_continuity: editorialDirector.storytelling?.storytelling_continuity,
      category_balance: editorialSignals.content_category_balancing_signals,
      freshness_recommendations: editorialSignals.freshness_recommendations,
      memory_path: editorialDirector.editorial_state_path,
      memory_run_count: editorialDirector.editorial_state_run_count,
      warnings: editorialDirector.warnings,
    }, 1000),
    "",
    `Warnings: ${validation.warnings?.length ? validation.warnings.join(", ") : "none"}`,
    "",
    "Sandbox diagnostics:",
    compactJson({
      sandbox_execution_enabled: sandbox.sandbox_execution_enabled,
      output_validation_enabled: sandbox.output_validation_enabled,
      output_sanitization_enabled: sandbox.output_sanitization_enabled,
      provider: sandbox.execution?.provider,
      external_api_calls: sandbox.diagnostics?.external_api_calls,
      validation_status: outputValidation.status,
      sanitization_changed: result.final_generation_result?.output_sanitization?.changed,
      validation_warnings: outputValidation.warnings,
    }, 900),
    generatedText ? [
      "",
      "Generated text preview:",
      truncatePreview(generatedText, 1200),
    ].join("\n") : "",
    "",
    "Config summary:",
    compactJson(configSummary, 750),
    "",
    `Prompt chars: ${promptStructure.total_prompt_chars || 0}`,
    "Prompt preview:",
    truncatePreview(promptPreview, 900),
  ].join("\n");
}

async function sendLongPlainText(chatId, text) {
  const chunks = [];
  let rest = text;
  while (rest.length > 0) {
    chunks.push(rest.slice(0, 3900));
    rest = rest.slice(3900);
  }
  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk);
  }
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

async function generatePostText(topic, scenario, lengthMode = "normal", styleKey = "auto", chatId = null) {
  const result = await generatePostTextResult(topic, scenario, lengthMode, styleKey, "default", "", chatId);
  return result.text;
}

function createAnswerId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function feedbackLogPath(authorId = process.env.AUTHOR_PROFILE_ID || "dinara") {
  const day = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), "feedback_reports", `${authorId}_feedback_${day}.jsonl`);
}

async function appendFeedbackItem(item) {
  const filePath = feedbackLogPath();
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(item)}\n`, "utf-8");
}

function buildFeedbackPayload(query, answerId, feedbackType) {
  const state = userState.get(query.message.chat.id) || {};
  const retrievedSources = state.lastRetrievalMeta?.sources || [];
  return {
    timestamp: new Date().toISOString(),
    telegram_user_id: query.from?.id || query.message.chat.id,
    scenario: state.lastScenario || null,
    topic: state.lastTopic || state.pendingTopic || null,
    selected_length: state.lastLengthMode || state.pendingLengthMode || null,
    selected_style: state.lastStyleKey || "auto",
    generated_answer_id: answerId,
    feedback_type: feedbackType,
    retrieved_sources: retrievedSources,
    production_version: state.lastRetrievalMeta?.productionVersion || null,
  };
}

function feedbackKeyboard(answerId) {
  return [
    [
      { text: "👍 Похоже на меня", callback_data: `feedback:like:${answerId}` },
      { text: "👎 Не похоже", callback_data: `feedback:not_voice:${answerId}` },
    ],
    [
      { text: "🔁 Перегенерировать", callback_data: "regen:telegram" },
      { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
    ],
    [
      { text: "🧠 Экспертнее", callback_data: "regen:expert" },
      { text: "💬 Личнее", callback_data: "regen:voice" },
    ],
    [{ text: "✏️ Дать правку словами", callback_data: `feedback:edit:${answerId}` }],
  ];
}

function directedRegenerationKeyboard() {
  return [
    [
      { text: "🌿 Мягче", callback_data: "regen:softer" },
      { text: "⚡ Сильнее", callback_data: "regen:stronger" },
    ],
    [
      { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
      { text: "🧲 Провокационнее", callback_data: "regen:provocative" },
    ],
    [
      { text: "🧠 Экспертнее", callback_data: "regen:expert" },
      { text: "💬 Telegram-style", callback_data: "regen:telegram" },
    ],
    [
      { text: "✂️ Короче", callback_data: "regen:shorter" },
      { text: "📚 Длиннее", callback_data: "regen:longer" },
    ],
  ];
}

function buildWhyThisFeelsLikeYou(state = {}) {
  const signals = [];
  const text = String(state.lastFullAnswer || "");
  const quality = state.lastQualityPass || {};
  const retrieval = state.lastRetrievalMeta || {};
  const variant = state.lastGenerationVariant || "default";

  if (state.firstGenerationBoostApplied) {
    signals.push("усиленный style lock для первого WOW-поста");
  }
  if (state.lastAuthorVoiceMeta?.profileLoaded) {
    signals.push("авторский voice profile");
  }
  if (retrieval.sources?.length) {
    signals.push("смыслы из ваших материалов");
  }
  if (quality.rewritten) {
    signals.push("anti-generic pass после черновика");
  }
  if (variant !== "default") {
    signals.push(`направление правки: ${variant}`);
  }

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const shortFragments = paragraphs.filter((p) => p.length <= 90).length;
  if (shortFragments) signals.push("короткие разговорные фрагменты");
  if (/[?？]\s*$/m.test(text) || /спросить себя|заметить|прислушаться/i.test(text)) {
    signals.push("рефлексивный финал");
  }
  if (/терап|внутри|границ|стыд|тревог|контакт|чувств|тело|опор/i.test(text)) {
    signals.push("терапевтическая рамка");
  }

  const picked = signals.slice(0, 4);
  if (!picked.length) picked.push("эмоциональная каденция", "живые паузы", "мягкий авторский вывод");

  return `Почему это похоже на вас:\n${picked.map((item) => `• ${item}`).join("\n")}`;
}

function shareExpertKeyboard() {
  const shareText = encodeURIComponent("Посмотри, как мой AI-эксперт пишет в моём стиле. Можно показать свой первый пост и собрать такого же под себя.");
  return [[
    { text: "📣 Показать AI-эксперта другу", url: `https://t.me/share/url?text=${shareText}` },
    { text: "💌 Текст для пересылки", callback_data: "share_friend" },
  ]];
}

function buildRegenerationInstruction(variant = "default", feedbackNote = "") {
  const instruction = REGENERATION_VARIANTS[variant] || "";
  if (!instruction && !feedbackNote) return "";
  const note = feedbackNote ? `\nКомментарий пользователя: "${feedbackNote}"` : "";
  return `\n\nВАРИАНТ ПЕРЕГЕНЕРАЦИИ:\n${instruction}${note}`;
}

function humanizeGeneratedPostText(text) {
  let result = String(text || "").trim();
  const replacements = [
    [/важно помнить,?\s*/giu, ""],
    [/важно понимать,?\s*/giu, ""],
    [/важно отметить,?\s*/giu, ""],
    [/следует отметить,?\s*/giu, ""],
    [/следует понимать,?\s*/giu, ""],
    [/необходимо понимать,?\s*/giu, ""],
    [/необходимо помнить,?\s*/giu, ""],
    [/таким образом,?\s*/giu, ""],
    [/подводя итог,?\s*/giu, ""],
    [/в заключение,?\s*/giu, ""],
    [/в современном мире\s*/giu, ""],
    [/в наше время\s*/giu, ""],
    [/данная тема/giu, "эта тема"],
    [/данная проблема/giu, "эта сложность"],
    [/данный вопрос/giu, "этот вопрос"],
    [/каждый человек уникален\.?/giu, ""],
    [/каждый из нас/giu, "многие из нас"],
    [/в этой статье мы рассмотрим,?\s*/giu, ""],
    [/сегодня мы поговорим о том,?\s*/giu, ""],
    [/существует множество факторов,?\s*/giu, "часто здесь много слоёв, "],
    [/это является важным аспектом/giu, "это правда может многое менять"],
    [/нужно работать над собой/giu, "можно бережно смотреть на себя"],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result
    .replace(/^\s*\d+[\).]\s+/gm, "")
    .replace(/^\s*(#{1,6}\s*)/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/([.!?])\s+(А ещё важно[^.!?]*[.!?])/giu, "$1")
    .replace(/\s+,/g, ",")
    .replace(/(^|\n)([а-яё])/giu, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function generatePostTextResult(topic, scenario, lengthMode = "normal", styleKey = "auto", variant = "default", feedbackNote = "", chatId = null) {
  let context = "";
  let retrievalMeta = null;
  const normalizedStyleKey = scenario === "sexologist" ? normalizeSexologistStyleKey(styleKey) : styleKey;
  const userScenarioContext = chatId ? await buildUserScenarioContext(chatId, scenario, topic) : null;
  const runtimeState = chatId ? (userState.get(chatId) || {}) : {};
  const starterTemplateKey = userScenarioContext?.profile?.starter_template || runtimeState.demoTemplateKey || null;
  const starterTemplate = starterTemplateKey ? STARTER_EXPERT_TEMPLATES[starterTemplateKey] : null;

  if (userScenarioContext?.scenario) {
    context = userScenarioContext.context;
    retrievalMeta = {
      sources: ["user-filesystem-onboarding"],
      chunksCount: 0,
      estimatedTokens: Math.ceil(context.length / 3.5),
      productionVersion: null,
    };
  } else if (scenario === "sexologist") {
    const retrieval = await retrieveGroundingContext(topic, "sexologist");
    if (retrieval?.context) {
      context = retrieval.context;
      retrievalMeta = {
        sources: retrieval.sources || [],
        chunksCount: retrieval.chunks?.length || 0,
        estimatedTokens: retrieval.estimatedTokens || 0,
        productionVersion: retrieval.productionVersion || null,
      };
    } else {
      const fallbackChunks = await vectorSearch(topic, "sexologist", 3);
      if (fallbackChunks && fallbackChunks.length > 0) {
        context = fallbackChunks.map(c => c.chunk_text).join("\n\n");
        retrievalMeta = {
          sources: fallbackChunks.map((chunk) => chunk.source || chunk.filename || "legacy-vector-source"),
          chunksCount: fallbackChunks.length,
          estimatedTokens: Math.ceil(context.length / 3.5),
          productionVersion: null,
          warning: "Production retrieval unavailable; used legacy vector fallback.",
        };
      } else {
        context = `Тема запроса: "${topic}". Отвечай на основе общих знаний психолога-сексолога, строго в рамках профессиональной этики. Не выдумывай исследования и статистику.`;
        retrievalMeta = {
          sources: [],
          chunksCount: 0,
          estimatedTokens: Math.ceil(context.length / 3.5),
          productionVersion: null,
          warning: "Retrieval unavailable; used generic professional fallback.",
        };
      }
    }
  } else {
    const chunks = await vectorSearch(topic, scenario, 5);
    if (chunks && chunks.length > 0) {
      context = chunks.map(c => c.chunk_text).join("\n\n");
    } else if (scenario === "psychologist") {
      const topArticles = articles
        .map(a => ({ ...a, score: scoreArticle(a, topic) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      context = topArticles.map(a => `Статья: ${a.title}\n${a.content}`).join("\n\n");
    }
  }

  const effectiveLengthMode = variant === "shorter" ? "short" : variant === "longer" ? "long" : lengthMode;
  const lengthConfig = getLengthConfig(["psychologist", "sexologist"].includes(scenario) ? scenario : "psychologist", effectiveLengthMode);
  const maxTokens = lengthConfig.maxTokens;
  const lengthInstruction = lengthConfig.instruction;

  const baseSystemPrompt = userScenarioContext?.scenario
    ? [
        `Ты — ${userScenarioContext.profile?.expert_name || userScenarioContext.scenario.expert_name || "эксперт"}.`,
        userScenarioContext.scenario.system_prompt,
        "Пишешь посты для Telegram/Instagram от первого лица или от лица экспертного бренда, если это естественно.",
        "Не выдумывай биографические факты. Опирайся на загруженные материалы, persona draft, worldview draft и style examples.",
        "Стиль: живой, конкретный, без канцелярита, без нумерованных списков, с мягким полезным финалом.",
        "Для нового эксперта особенно важно звучать узнаваемо: повторяй его ритм абзацев, типичные открытия, CTA и эмоциональную температуру из style guidance.",
        "Если материалов мало или они слабые, не становись универсальным блогером: честно держись роли, темы и тех немногих речевых сигналов, которые есть.",
      ].filter(Boolean).join("\n")
    : scenario === "sexologist"
    ? buildSexologistPrompt(normalizedStyleKey)
    : PSYCHOLOGIST_SYSTEM_PROMPT;
  const authorVoice = scenario === "sexologist"
    ? await loadAuthorVoiceProfile()
    : { enabled: false, profileLoaded: false, content: "" };
  if (scenario === "sexologist") logAuthorVoiceStatus(authorVoice);
  const authorVoicePrompt = buildAuthorVoicePrompt(authorVoice);
  const fewShotPrompt = userScenarioContext?.scenario ? "" : await buildDinaraFewShotPrompt(topic);
  const worldviewPrompt = userScenarioContext?.scenario ? "" : await buildDinaraWorldviewPrompt();
  const realismPrompt = userScenarioContext?.scenario ? "" : DINARA_REALISM_PROMPT;
  const styleLockPrompt = buildStyleLockPrompt({ userScenarioContext, scenario, template: starterTemplate });
  const firstGenerationWowPrompt = buildFirstGenerationWowInstruction(runtimeState.firstGenerationBoost);
  const systemPrompt = [baseSystemPrompt, worldviewPrompt, realismPrompt, fewShotPrompt, authorVoicePrompt, styleLockPrompt, firstGenerationWowPrompt].filter(Boolean).join("\n\n");
  const contentPresetInstruction = buildContentPresetInstruction(runtimeState.pendingContentPreset || runtimeState.lastContentPreset);
  const firstGenerationLine = runtimeState.firstGenerationBoost
    ? "\n- Это первая генерация: поставь эмоциональное узнавание выше аккуратной нейтральности."
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Тема: "${topic}"\n\nКонтекст:\n${context}\n\n${lengthInstruction} С одной жирной фразой (*жирный*).${contentPresetInstruction}\n\nSTABILIZATION:\n- Сделай первый экран сильным: конкретное узнаваемое переживание или тезис, без общих вступлений.\n- Не используй универсальные AI-фразы, канцелярит и безопасные пустые выводы.\n- Удерживай авторскую идентичность из persona/worldview/style guidance сильнее, чем общую экспертность.\n- Добавь 1-2 конкретные детали из контекста, если они есть, но не выдумывай факты.${firstGenerationLine}${buildRegenerationInstruction(variant, feedbackNote)}` }
    ],
    temperature: 0.82,
    max_tokens: maxTokens,
  });

  const firstPassText = humanizeGeneratedPostText(completion.choices[0].message.content);
  const qualityPass = await rewriteGenericPostOnce({
    text: firstPassText,
    topic,
    context,
    lengthInstruction,
    systemPrompt,
    contentPresetInstruction,
    styleLockPrompt,
    maxTokens,
  });

  return {
    text: qualityPass.text,
    retrieval: retrievalMeta,
    authorVoice: {
      enabled: authorVoice.enabled,
      author: authorVoice.author,
      profileLoaded: authorVoice.profileLoaded,
      profilePath: authorVoice.profilePath,
    },
    styleKey: normalizedStyleKey,
    lengthMode,
    firstGenerationBoost: Boolean(runtimeState.firstGenerationBoost),
    variant,
    qualityPass: {
      rewritten: qualityPass.rewritten,
      score: qualityPass.quality?.score,
      reasons: qualityPass.quality?.reasons || [],
      firstPassScore: qualityPass.firstPassQuality?.score,
    },
  };
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
  const state = userState.get(chatId) || {};
  const scenarioLabel = state.demoMode && state.demoTemplateKey
    ? `⚡ Demo: ${STARTER_EXPERT_TEMPLATES[state.demoTemplateKey]?.label || "AI-эксперт"}`
    : await getScenarioLabel(chatId, scenario);
  const answerId = state.lastAnswerId || createAnswerId();
  state.lastAnswerId = answerId;
  userState.set(chatId, state);

  await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(async () => {
    await bot.sendMessage(chatId, text);
  });

  await bot.sendMessage(chatId, buildWhyThisFeelsLikeYou(state));

  const demoRows = state.demoMode
    ? [[{ text: "⚡ Создать такого эксперта себе", callback_data: `ob_template:${state.demoTemplateKey || "psychologist"}` }]]
    : [];

  await bot.sendMessage(chatId, `Сгенерировано: *${scenarioLabel}*\n\nЧто дальше?`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [
      ...demoRows,
      ...feedbackKeyboard(answerId),
      ...directedRegenerationKeyboard(),
      ...shareExpertKeyboard(),
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

  if (await userHasCompletedExpert(chatId)) {
    const profile = await loadUserProfile(chatId);
    await bot.sendMessage(chatId,
      `👋 Добро пожаловать, *${profile?.expert_name || "эксперт"}*!\n\nВаш AI-эксперт уже создан. Открыл dashboard, чтобы сразу протестировать результат.`,
      { parse_mode: "Markdown", reply_markup: START_KEYBOARD }
    );
    await sendExpertDashboard(chatId, chatId);
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
    await bot.sendMessage(chatId,
      "Добро пожаловать. Можно сначала попробовать готового AI-эксперта за минуту, а потом собрать своего под ваш голос.",
      { reply_markup: { inline_keyboard: [
        [{ text: "⚡ Попробовать демо сейчас", callback_data: "demo_start" }],
        [{ text: "🚀 Start with template expert", callback_data: "ob_template_menu" }],
        [{ text: "Создать AI-эксперта", callback_data: "ob_start" }],
        [{ text: "У меня уже есть доступ", callback_data: "show_help" }],
      ]}}
    );
  }
});

bot.onText(/\/help/, async (msg) => { await sendHelp(msg.chat.id); });

bot.onText(/\/onboard/, async (msg) => {
  await startExpertOnboarding(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/demo/, async (msg) => {
  await sendStarterTemplateMenu(msg.chat.id, "demo");
});

bot.onText(/\/my_expert/, async (msg) => {
  await sendExpertDashboard(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/add_scenario/, async (msg) => {
  await startAddScenario(msg.chat.id, msg.from?.id || msg.chat.id);
});

bot.onText(/\/runtime_preview(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || chatId;
  if (!(await canUseRuntimePreview(userId))) {
    await bot.sendMessage(chatId, "🔒 Runtime preview доступен только admin/full_access.");
    return;
  }

  const topic = (match?.[1] || "").trim();
  const parts = topic.split(/\s+/).filter(Boolean);
  const requestedMode = ["dry", "sandbox"].includes(parts[0]) ? parts.shift() : "dry";
  const runtimeTopic = parts.join(" ").trim();
  if (!runtimeTopic) {
    await bot.sendMessage(chatId, [
      "🧪 Runtime preview доступен в двух admin-only режимах.",
      "",
      "Использование:",
      "/runtime_preview dry тема поста",
      "/runtime_preview sandbox тема поста",
      "",
      "Dry не генерирует текст. Sandbox выполняет локальную генерацию, валидирует и санитизирует результат.",
      "Публикации нет, Telegram production flow не меняется.",
    ].join("\n"));
    return;
  }

  const status = await bot.sendMessage(
    chatId,
    requestedMode === "sandbox"
      ? "🧪 Запускаю admin-only runtime sandbox без публикации..."
      : "🧪 Собираю runtime preview без LLM и без публикации...",
  );
  try {
    const result = await runRuntimeGenerationAdapter({
      expertId: "dinara",
      topic: runtimeTopic,
      userRequest: runtimeTopic,
      intent: "educational_post",
      platform: "telegram_longread",
      length: "medium",
      format: "post",
      tone: "expert_warm",
      audienceState: "warming",
      ctaType: "low_pressure_cta",
      llmExecutionMode: requestedMode === "sandbox" ? "sandbox_execution" : "dry_run_prompt_only",
    }, {
      persistRuntime: false,
      initializeStorage: false,
      llmExecutionMode: requestedMode === "sandbox" ? "sandbox_execution" : "dry_run_prompt_only",
    });

    const logPaths = await storeRuntimePreviewRun({ chatId, topic: runtimeTopic, result, previewMode: requestedMode });
    await bot.editMessageText("✅ Runtime preview готов. Отправляю краткий отчёт...", {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(() => {});
    await sendLongPlainText(chatId, [
      formatRuntimePreviewMessage(result, runtimeTopic, requestedMode),
      "",
      `Local log: ${logPaths.mdPath.replace(process.cwd(), "").replace(/^[\\/]/, "")}`,
    ].join("\n"));
  } catch (err) {
    console.error("Runtime preview error:", err);
    await bot.editMessageText(`❌ Runtime preview error: ${String(err.message || err).slice(0, 700)}`, {
      chat_id: chatId,
      message_id: status.message_id,
    }).catch(async () => {
      await bot.sendMessage(chatId, `❌ Runtime preview error: ${String(err.message || err).slice(0, 700)}`);
    });
  }
});

bot.onText(/\/(?:knowledge|kb_intake)/, async (msg) => {
  await sendKnowledgeIntakeMenu(msg.chat.id, msg.from?.id || msg.chat.id);
});

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
        else { await startExpertOnboarding(chatId, msg.from?.id || chatId); }
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

    if (state.expertOnboarding && await handleExpertOnboardingMessage(msg, state)) {
      return;
    }

    if (await handleKnowledgeIntakeMessage(msg)) {
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

    if (state.awaitingFeedbackCorrection) {
      const s = userState.get(chatId) || {};
      const correction = {
        ...(s.pendingFeedbackCorrection || {}),
        timestamp: new Date().toISOString(),
        telegram_user_id: msg.from?.id || chatId,
        correction_text: text,
      };
      await appendFeedbackItem(correction);
      s.awaitingFeedbackCorrection = false;
      s.pendingFeedbackCorrection = null;
      s.pendingTopic = s.lastTopic || s.pendingTopic;
      s.pendingGenerationNote = text;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "✅ Спасибо, комментарий сохранён.", {
        reply_markup: { inline_keyboard: [[
          { text: "🔁 Исправить по комментарию", callback_data: "regen:feedback" },
          { text: "✏️ Редактировать вручную", callback_data: "txt_edit" },
        ]]},
      });
      return;
    }

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
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, state.pendingScenario);
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

    if (data.startsWith("ki_kb:")) {
      const userId = query.from?.id || chatId;
      if (!(await canUseKnowledgeIntake(userId))) {
        await bot.sendMessage(chatId, "🔒 Режим пополнения базы знаний доступен только для admin/full_access.");
        return;
      }
      const targetKb = data.replace("ki_kb:", "");
      const session = await createIntakeSession(userId, targetKb);
      await bot.sendMessage(
        chatId,
        `📚 Сессия создана: ${session.session_id}\nБаза знаний: ${getTargetLabel(targetKb)}\n\nОтправляйте document/file, ссылку или текстовую заметку.`,
        KNOWLEDGE_INTAKE_ACTIONS
      );
      return;
    }

    if (data === "ki_more") {
      await bot.sendMessage(chatId, "➕ Отправьте следующий document/file, ссылку или текстовую заметку.", KNOWLEDGE_INTAKE_ACTIONS);
      return;
    }

    if (data === "ki_done") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session || session.status !== "collecting") {
        await bot.sendMessage(chatId, "Активная сессия загрузки не найдена.");
        return;
      }
      const updated = await setSessionStatus(session.session_id, "awaiting_confirmation");
      await sendIntakeSummary(chatId, updated);
      return;
    }

    if (data === "ki_approve") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session || session.status !== "awaiting_confirmation") {
        await bot.sendMessage(chatId, "Сессия, ожидающая подтверждения, не найдена.");
        return;
      }
      await setSessionStatus(session.session_id, "approved_for_processing");
      await bot.sendMessage(
        chatId,
        "Материалы приняты и поставлены в очередь обработки. Следующий этап — анализ качества и подготовка к ingestion."
      );
      return;
    }

    if (data === "ki_reject" || data === "ki_cancel") {
      const session = await getActiveIntakeSession(query.from?.id || chatId);
      if (!session) {
        await bot.sendMessage(chatId, "Активная сессия загрузки не найдена.");
        return;
      }
      await setSessionStatus(session.session_id, "cancelled");
      await bot.sendMessage(chatId, "❌ Сессия пополнения базы знаний отменена. Файлы не удалены.");
      return;
    }

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

    if (data === "ob_start") {
      await startExpertOnboarding(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_custom_name") {
      const s = userState.get(chatId) || {};
      s.expertOnboarding = {
        userId: query.from?.id || chatId,
        mode: "create_expert",
        step: "name",
        data: {},
      };
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Напишите имя эксперта или бренда:");
      return;
    }

    if (data === "ob_template_menu") {
      await sendStarterTemplateMenu(chatId, "onboarding");
      return;
    }

    if (data === "demo_start") {
      await sendStarterTemplateMenu(chatId, "demo");
      return;
    }

    if (data.startsWith("demo_template:")) {
      await startDemoMode(chatId, data.replace("demo_template:", ""));
      return;
    }

    if (data.startsWith("ob_template:")) {
      const templateKey = data.replace("ob_template:", "");
      const s = userState.get(chatId) || {};
      const userId = query.from?.id || chatId;
      const { scenario, template } = await createStarterExpertFromTemplate(userId, templateKey);
      s.expertOnboarding = null;
      s.demoMode = false;
      s.demoTemplateKey = null;
      s.pendingScenario = scenario.id;
      s.pendingTopic = templateKey === "sexologist"
        ? "как перестать стыдиться своего желания"
        : templateKey === "coach"
          ? "почему я много планирую и не начинаю"
          : templateKey === "blogger"
            ? "как перестать звучать как все"
            : "почему я всё понимаю, но не могу перестать тревожиться";
      s.pendingLengthMode = "normal";
      s.pendingContentPreset = "emotional";
      userState.set(chatId, s);
      await bot.sendMessage(chatId,
        `✅ Шаблон "${template.label}" создан.\n\nСейчас покажу первый пост сразу, а стиль и материалы можно усилить позже.`
      );
      await runGeneration(chatId, scenario.id, "normal", "auto");
      return;
    }

    if (data === "ob_dashboard") {
      await sendExpertDashboard(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_add_scenario") {
      await startAddScenario(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_list_scenarios") {
      await sendScenarioList(chatId, query.from?.id || chatId, "list");
      return;
    }

    if (data === "ob_select_scenario") {
      await sendScenarioList(chatId, query.from?.id || chatId, "select");
      return;
    }

    if (data.startsWith("ob_set_active:")) {
      const idx = parseInt(data.replace("ob_set_active:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте dashboard заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId);
      const scenario = await loadUserScenario(query.from?.id || chatId, scenarioId);
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, `✅ Активный сценарий: ${scenario?.label || scenarioId}`);
      await sendTopicsForScenario(chatId, scenarioId);
      return;
    }

    if (data === "ob_regen_persona") {
      await rebuildPersonaAndNotify(chatId, query.from?.id || chatId);
      await sendExpertDashboard(chatId, query.from?.id || chatId);
      return;
    }

    if (data === "ob_test_generation") {
      const inventory = await getOnboardingInventory(query.from?.id || chatId);
      const scenarioId = inventory.profile?.active_scenario_id || inventory.scenarios[0]?.id;
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сначала добавьте сценарий, и сразу сделаем тестовый пост.");
        await startAddScenario(chatId, query.from?.id || chatId);
        return;
      }
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = "почему клиенту важно почувствовать, что эксперт его понимает";
      s.pendingLengthMode = "normal";
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Сейчас покажу тестовый пост на активном сценарии. Это быстрый WOW-пруф после онбординга.");
      await runGeneration(chatId, scenarioId, "normal", "auto");
      return;
    }

    if (data.startsWith("ob_upload_more:")) {
      const category = data.replace("ob_upload_more:", "");
      const s = userState.get(chatId) || {};
      s.expertOnboarding = {
        userId: query.from?.id || chatId,
        mode: "upload_more",
        step: category,
        data: {},
      };
      userState.set(chatId, s);
      await sendOnboardingUploadStep(chatId, category);
      return;
    }

    if (data.startsWith("ob_role:")) {
      const roleKey = data.replace("ob_role:", "");
      const s = userState.get(chatId) || {};
      const onboarding = s.expertOnboarding || {
        userId: query.from?.id || chatId,
        mode: "create_expert",
        data: {},
      };
      onboarding.data = onboarding.data || {};
      onboarding.data.roleKey = roleKey;
      s.expertOnboarding = onboarding;
      userState.set(chatId, s);

      if (onboarding.mode === "add_scenario") {
        const profile = await loadUserProfile(onboarding.userId);
        const scenario = await createUserScenario(onboarding.userId, roleKey, {
          expertName: profile?.expert_name || "Эксперт",
          title: ONBOARDING_ROLES[roleKey]?.label || roleKey,
        });
        if (profile) await setActiveUserScenario(onboarding.userId, scenario.id);
        s.expertOnboarding = null;
        userState.set(chatId, s);
        await bot.sendMessage(chatId, `✅ Сценарий добавлен и выбран активным: ${scenario.label}`);
        await sendExpertDashboard(chatId, onboarding.userId);
        return;
      }

      await sendOnboardingUploadStep(chatId, "knowledge");
      return;
    }

    if (data.startsWith("ob_done:")) {
      const category = data.replace("ob_done:", "");
      const s = userState.get(chatId) || {};
      if (s.expertOnboarding?.mode === "upload_more") {
        const userId = s.expertOnboarding.userId || query.from?.id || chatId;
        s.expertOnboarding = null;
        userState.set(chatId, s);
        await bot.sendMessage(chatId, "✅ Upload finished\nprocessed: сохранено\nqueued: готово к использованию в эксперте");
        if (["knowledge", "style"].includes(category)) {
          await rebuildPersonaAndNotify(chatId, userId, "Обновляю persona после новых материалов...");
        }
        await sendExpertDashboard(chatId, userId);
        return;
      }
      if (category === "knowledge") { await sendOnboardingUploadStep(chatId, "style"); return; }
      if (category === "style") { await sendOnboardingUploadStep(chatId, "avatar"); return; }
      if (category === "avatar") { await sendOnboardingUploadStep(chatId, "voice"); return; }
      if (category === "voice") { await finishExpertOnboarding(chatId, query.from?.id || chatId); return; }
      return;
    }

    if (data === "ob_cancel") {
      const s = userState.get(chatId) || {};
      s.expertOnboarding = null;
      userState.set(chatId, s);
      await bot.sendMessage(chatId, "Онбординг остановлен. Загруженные файлы остались в папке пользователя.");
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
      s.pendingContentPreset = null;
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
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, "psychologist");
      return;
    }

    if (data.startsWith("qs:")) {
      const idx = parseInt(data.replace("qs:", ""));
      const topic = QUICK_TOPICS_SEX[idx];
      if (!topic) return;
      const s = userState.get(chatId) || {};
      s.pendingTopic = topic;
      s.pendingScenario = "sexologist";
      s.pendingContentPreset = null;
      userState.set(chatId, s);
      await sendContentPresetChoice(chatId, "sexologist");
      return;
    }

    if (data === "show_presets") { await sendPresetsMenu(chatId); return; }

    if (data === "save_preset") {
      const s = userState.get(chatId) || {};
      if (!s.lastScenario) { await bot.sendMessage(chatId, "Нет данных для сохранения."); return; }
      const styleLabel = SEXOLOGIST_STYLE_META[s.lastStyleKey]?.label || "✨ Авто";
      const scLabel = await getScenarioLabel(chatId, s.lastScenario);
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

    if (data.startsWith("usc:")) {
      const idx = parseInt(data.replace("usc:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте меню заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId).catch(() => null);
      const s = userState.get(chatId) || {};
      s.pendingScenario = scenarioId;
      s.pendingTopic = null;
      userState.set(chatId, s);
      await sendTopicsForScenario(chatId, scenarioId);
      return;
    }

    if (data.startsWith("usc_t:")) {
      const idx = parseInt(data.replace("usc_t:", ""));
      const scenarioId = state.userScenarioMenu?.[idx];
      if (!scenarioId) {
        await bot.sendMessage(chatId, "Сценарий не найден. Откройте меню заново.");
        return;
      }
      await setActiveUserScenario(query.from?.id || chatId, scenarioId).catch(() => null);
      await sendContentPresetChoice(chatId, scenarioId);
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

    if (data === "sc_psych_t") { await sendContentPresetChoice(chatId, "psychologist"); return; }
    if (data === "sc_sex_t") { await sendContentPresetChoice(chatId, "sexologist"); return; }

    if (data.startsWith("cp:")) {
      const presetId = data.replace("cp:", "");
      if (presetId === "manual") {
        await sendLengthChoice(chatId, state.pendingScenario || "psychologist");
        return;
      }
      const preset = getContentPreset(presetId);
      if (!preset) return;
      const s = userState.get(chatId) || {};
      const scenario = s.pendingScenario || state.pendingScenario || "psychologist";
      s.pendingContentPreset = preset.id;
      s.pendingLengthMode = preset.lengthMode;
      userState.set(chatId, s);
      if (scenario === "sexologist") {
        await sendStyleChoice(chatId);
      } else {
        await runGeneration(chatId, scenario, preset.lengthMode, "auto");
      }
      return;
    }

    if (data === "len_short" || data === "len_normal" || data === "len_long") {
      const lengthMode = data.replace("len_", "");
      const s = userState.get(chatId) || {};
      s.pendingLengthMode = lengthMode;
      s.pendingContentPreset = null;
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
      await runGeneration(chatId, state.pendingScenario || "sexologist", state.pendingLengthMode || "normal", normalizeSexologistStyleKey(data.replace("sty_", "")));
      return;
    }

    if (data.startsWith("feedback:")) {
      const [, feedbackType, answerId] = data.split(":");
      const payload = buildFeedbackPayload(query, answerId, feedbackType);
      await appendFeedbackItem(payload);
      if (feedbackType === "edit") {
        const s = userState.get(chatId) || {};
        s.awaitingFeedbackCorrection = true;
        s.pendingFeedbackCorrection = {
          ...payload,
          feedback_type: "edit_comment",
        };
        userState.set(chatId, s);
        await bot.sendMessage(chatId, "Напишите, что именно нужно поправить в этом ответе.");
      } else {
        const regenerationRows = {
          not_voice: [[
            { text: "💬 Личнее", callback_data: "regen:voice" },
            { text: "🔥 Эмоциональнее", callback_data: "regen:emotional" },
          ]],
          weak_expertise: [[{ text: "🧠 Экспертнее", callback_data: "regen:expert" }]],
          bad: directedRegenerationKeyboard().slice(0, 2),
        };
        const rows = regenerationRows[feedbackType];
        const feedbackReply = feedbackType === "like"
          ? "✅ Зафиксировал: этот вариант похож на вас. Можно усилить его в любую сторону или сразу идти дальше."
          : "✅ Обратная связь сохранена.";
        await bot.sendMessage(chatId, feedbackReply, rows ? {
          reply_markup: { inline_keyboard: rows },
        } : undefined);
      }
      return;
    }

    if (data === "share_friend") {
      await bot.sendMessage(chatId, [
        "Можно переслать другу так:",
        "",
        "Я собрал(а) AI-эксперта, который пишет в моём стиле. Посмотри на этот пост — интересно, похоже ли на меня?",
        "",
        "Если хочешь, покажу, как он собирается из материалов, worldview и примеров голоса.",
      ].join("\n"));
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
      const s = userState.get(chatId) || {};
      s.pendingTopic = state.lastTopic;
      userState.set(chatId, s);
      await runGeneration(chatId, state.lastScenario || "psychologist", state.lastLengthMode || "normal", state.lastStyleKey || "auto", "telegram");
      return;
    }

    if (data.startsWith("regen:")) {
      if (!state.lastTopic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
      const variant = data.replace("regen:", "");
      const s = userState.get(chatId) || {};
      s.pendingTopic = state.lastTopic;
      userState.set(chatId, s);
      await runGeneration(chatId, state.lastScenario || "psychologist", state.lastLengthMode || "normal", state.lastStyleKey || "auto", variant);
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
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
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
      await incrementExpertRuntime(chatId, "generate_audio", { counter: "audio", scenario: state.lastScenario });
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
      await incrementExpertRuntime(chatId, "generate_video", { counter: "video", scenario: state.lastScenario });
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
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
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
      await incrementExpertRuntime(chatId, "generate_photo", { counter: "photo", scenario: state.lastScenario });
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

async function runGeneration(chatId, scenario, lengthMode, styleKey, variant = "default") {
  const state = userState.get(chatId) || {};
  if (!state.demoMode) {
    const textCheck = await checkLimit(chatId, "text");
    if (!textCheck.ok) {
      if (textCheck.reason === "not_registered") { await handleNotRegistered(chatId); return; }
      if (textCheck.reason === "expired") { await handleExpired(chatId, textCheck.user); return; }
      await handleLimitExhausted(chatId, "text", textCheck.user); return;
    }
  }

  const topic = state.pendingTopic || state.lastTopic;
  if (!topic) { await bot.sendMessage(chatId, "Тема не найдена."); return; }
  const runtimeBeforeGeneration = await loadExpertRuntime(chatId);
  const firstGenerationBoost = (runtimeBeforeGeneration.counters?.text || 0) === 0 && variant === "default";
  if (firstGenerationBoost) {
    const boostedState = userState.get(chatId) || {};
    boostedState.firstGenerationBoost = true;
    userState.set(chatId, boostedState);
  }

  const labelMap = { short: "короткий", normal: "обычный", long: "длинный" };
  const scenarioLabel = state.demoMode && state.demoTemplateKey
    ? `⚡ Demo: ${STARTER_EXPERT_TEMPLATES[state.demoTemplateKey]?.label || "AI-эксперт"}`
    : await getScenarioLabel(chatId, scenario);
  const styleLabel = scenario === "sexologist" && styleKey !== "auto"
    ? ` · ${SEXOLOGIST_STYLE_META[styleKey]?.label || ""}` : "";
  const genMsg = await bot.sendMessage(chatId,
    `⏳ Генерирую ${labelMap[lengthMode]} пост [${scenarioLabel}${styleLabel}]\nТема: "${topic}"...`
  );

  const feedbackNote = variant === "feedback" ? state.pendingGenerationNote || "" : "";
  const generation = await generatePostTextResult(topic, scenario, lengthMode, styleKey, variant, feedbackNote, chatId);
  const fullAnswer = generation.text;
  await bot.deleteMessage(chatId, genMsg.message_id).catch(() => {});

  await incrementLimit(chatId, "text", scenario, lengthMode);
  await incrementExpertRuntime(chatId, "generate_text", { counter: "text", scenario, lengthMode });

  const s = userState.get(chatId) || {};
  s.lastFullAnswer = fullAnswer;
  s.lastTopic = topic;
  s.lastScenario = scenario;
  s.lastLengthMode = lengthMode;
  s.lastStyleKey = generation.styleKey || styleKey;
  s.lastContentPreset = s.pendingContentPreset || null;
  s.lastAnswerId = createAnswerId();
  s.lastRetrievalMeta = generation.retrieval;
  s.lastAuthorVoiceMeta = generation.authorVoice;
  s.lastQualityPass = generation.qualityPass;
  s.lastGenerationVariant = generation.variant || variant;
  s.firstGenerationBoostApplied = Boolean(generation.firstGenerationBoost);
  s.firstGenerationBoost = false;
  s.lastAudioUrl = null;
  s.lastVideoUrl = null;
  s.pendingVoices = [];
  s.awaitingVoiceRecord = false;
  s.pendingVoiceBuffer = null;
  s.suggestedTracks = null;
  if (variant === "feedback") s.pendingGenerationNote = null;
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
