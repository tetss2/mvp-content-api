import TelegramBot from "node-telegram-bot-api";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LEADS_TOKEN = process.env.LEADS_BOT_TOKEN;
const ADMIN_ID = 109664871; // Твой Telegram ID
const MAIN_BOT_USERNAME = "mvpdi1_bot";
const DB_PATH = join(__dirname, "demo-users.json");
const RUNTIME_MODE = (process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const IS_BETA_RUNTIME = ["beta", "staging", "railway-beta"].includes(RUNTIME_MODE);
const MAIN_TOKEN = process.env[IS_BETA_RUNTIME ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN"];

const LIMITS = {
  text: 30,
  photo: 15,
  video: 1,
  days: 7,
};

const SCOPES = ["Психолог", "Врач", "Инста-мама", "Другое"];

const LEADS_BOT_ENABLED = process.env.START_LEADS_BOT === "true" && Boolean(LEADS_TOKEN) && LEADS_TOKEN !== MAIN_TOKEN;
const disabledLeadsBot = {
  onText() {},
  on() {},
  sendMessage: async () => {},
  answerCallbackQuery: async () => {},
};
const leadsBot = LEADS_BOT_ENABLED
  ? new TelegramBot(LEADS_TOKEN, { polling: process.env.LEADS_TELEGRAM_POLLING !== "false" })
  : disabledLeadsBot;
const leadsState = new Map(); // chatId -> { step, name, city, scope, phone }

console.log(LEADS_BOT_ENABLED ? "Leads bot started" : "Leads bot disabled", {
  requested: process.env.START_LEADS_BOT === "true",
  tokenPresent: Boolean(LEADS_TOKEN),
  tokenOverlapsMain: Boolean(LEADS_TOKEN && MAIN_TOKEN && LEADS_TOKEN === MAIN_TOKEN),
  polling: LEADS_BOT_ENABLED && process.env.LEADS_TELEGRAM_POLLING !== "false",
});

// ─── БАЗА ДАННЫХ ──────────────────────────────────────────────────────────────

async function loadDB() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

async function saveDB(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "DEMO-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── КОМАНДЫ ─────────────────────────────────────────────────────────────────

leadsBot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  leadsState.set(chatId, { step: "name" });

  await leadsBot.sendMessage(
    chatId,
    `👋 Привет!\n\nЯ помогу получить *демо-доступ* к AI-боту для создания контента.\n\n` +
    `🤖 Бот генерирует:\n` +
    `• Тексты в стиле психолога\n` +
    `• Голосовые сообщения\n` +
    `• Фото с AI-аватаром\n` +
    `• Видео\n\n` +
    `📋 Для получения доступа нужно заполнить короткую анкету (1 минута).\n\n` +
    `*Как вас зовут?*`,
    { parse_mode: "Markdown" }
  );
});

leadsBot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  await sendStatsToAdmin("full");
});

leadsBot.onText(/\/stats (.+)/, async (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const query = match[1].trim().toLowerCase();
  await sendUserStats(query);
});

// ─── ОБРАБОТЧИК СООБЩЕНИЙ ────────────────────────────────────────────────────

leadsBot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = leadsState.get(chatId) || {};

  if (msg.text && msg.text.startsWith("/")) return;

  // Шаг 1: Имя
  if (state.step === "name") {
    if (!msg.text || msg.text.trim().length < 2) {
      await leadsBot.sendMessage(chatId, "Пожалуйста, введите ваше имя (минимум 2 символа):");
      return;
    }
    state.name = msg.text.trim();
    state.step = "city";
    leadsState.set(chatId, state);
    await leadsBot.sendMessage(chatId, `Отлично, *${state.name}*! 🌟\n\n*Из какого вы города?*`, {
      parse_mode: "Markdown",
    });
    return;
  }

  // Шаг 2: Город
  if (state.step === "city") {
    if (!msg.text || msg.text.trim().length < 2) {
      await leadsBot.sendMessage(chatId, "Введите название города:");
      return;
    }
    state.city = msg.text.trim();
    state.step = "scope";
    leadsState.set(chatId, state);
    await leadsBot.sendMessage(
      chatId,
      `*В какой сфере планируете использовать бота?*`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: SCOPES.map((s) => [{ text: s, callback_data: `scope_${s}` }]),
        },
      }
    );
    return;
  }

  // Шаг 4: Ввод своей сферы
  if (state.step === "scope_custom") {
    if (!msg.text || msg.text.trim().length < 2) {
      await leadsBot.sendMessage(chatId, "Опишите вашу сферу:");
      return;
    }
    state.scope = msg.text.trim();
    state.step = "phone";
    leadsState.set(chatId, state);
    await askForPhone(chatId, state.name);
    return;
  }

  // Шаг 5: Контактный телефон
  if (state.step === "phone" && msg.contact) {
    await handlePhoneReceived(chatId, msg.contact.phone_number, msg.contact.user_id, state);
    return;
  }

  if (state.step === "phone" && msg.text) {
    await leadsBot.sendMessage(
      chatId,
      "📱 Пожалуйста, используйте кнопку *«Поделиться номером»* ниже — это обязательно для верификации.",
      { parse_mode: "Markdown" }
    );
    return;
  }
});

// ─── CALLBACK КНОПКИ ─────────────────────────────────────────────────────────

leadsBot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await leadsBot.answerCallbackQuery(query.id);

  const state = leadsState.get(chatId) || {};

  // Выбор сферы
  if (data.startsWith("scope_")) {
    const scope = data.replace("scope_", "");
    if (scope === "Другое") {
      state.step = "scope_custom";
      leadsState.set(chatId, state);
      await leadsBot.sendMessage(chatId, "✏️ Опишите вашу сферу:");
      return;
    }
    state.scope = scope;
    state.step = "phone";
    leadsState.set(chatId, state);
    await askForPhone(chatId, state.name);
    return;
  }

  // Продление на 3 дня (только для админа)
  if (data.startsWith("extend_") && chatId === ADMIN_ID) {
    const phone = data.replace("extend_", "");
    const db = await loadDB();
    const user = db.users[phone];
    if (!user) {
      await leadsBot.sendMessage(chatId, "Пользователь не найден.");
      return;
    }
    const currentExpiry = new Date(user.expires_at || Date.now());
    const newExpiry = new Date(currentExpiry.getTime() + 3 * 24 * 60 * 60 * 1000);
    user.expires_at = newExpiry.toISOString();
    await saveDB(db);

    await leadsBot.sendMessage(
      chatId,
      `✅ Доступ продлён на 3 дня!\n👤 ${user.name}, ${user.city}\n📱 ${phone}\n📅 Новый дедлайн: ${formatDate(newExpiry)}`
    );

    // Уведомляем пользователя
    if (user.tg_id) {
      try {
        await leadsBot.sendMessage(
          user.tg_id,
          `🎉 Хорошая новость, ${user.name}!\n\nВаш демо-доступ продлён на 3 дня.\nНовый срок: *${formatDate(newExpiry)}*\n\nПродолжайте пользоваться ботом 👉 @${MAIN_BOT_USERNAME}`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        console.error("Не удалось уведомить пользователя:", e.message);
      }
    }
    return;
  }

  // Написать пользователю (открывает ссылку)
  if (data.startsWith("contact_") && chatId === ADMIN_ID) {
    const tgId = data.replace("contact_", "");
    await leadsBot.sendMessage(
      chatId,
      `📨 Открыть чат с пользователем:\ntg://user?id=${tgId}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "💬 Открыть чат", url: `tg://user?id=${tgId}` }]],
        },
      }
    );
    return;
  }
});

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ─────────────────────────────────────────────────

async function askForPhone(chatId, name) {
  await leadsBot.sendMessage(
    chatId,
    `📱 *Последний шаг, ${name}!*\n\nПоделитесь номером телефона — это нужно для привязки вашего демо-доступа.\n\n_Номер используется только для идентификации и не передаётся третьим лицам._`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function handlePhoneReceived(chatId, phone, tgUserId, state) {
  const db = await loadDB();

  // Проверяем, не зарегистрирован ли уже этот номер
  if (db.users[phone]) {
    const existing = db.users[phone];
    await leadsBot.sendMessage(
      chatId,
      `✅ Вы уже зарегистрированы!\n\nВаш доступ к боту активен.\nПерейдите: @${MAIN_BOT_USERNAME}`,
      { reply_markup: { remove_keyboard: true } }
    );
    return;
  }

  const inviteCode = generateInviteCode();

  // Создаём запись пользователя
  db.users[phone] = {
    phone,
    tg_id: chatId,
    tg_user_id: tgUserId,
    tg_username: null,
    name: state.name,
    city: state.city,
    scope: state.scope,
    invite_code: inviteCode,
    registered_at: new Date().toISOString(),
    activated_at: null,
    expires_at: null,
    limits: {
      text: { used: 0, max: LIMITS.text },
      photo: { used: 0, max: LIMITS.photo },
      video: { used: 0, max: LIMITS.video },
    },
    events: [],
  };

  await saveDB(db);
  leadsState.delete(chatId);

  const deepLink = `https://t.me/${MAIN_BOT_USERNAME}?start=${inviteCode}`;

  await leadsBot.sendMessage(
    chatId,
    `🎉 *Доступ выдан!*\n\n` +
    `Нажмите кнопку ниже, чтобы перейти в бот и начать:\n\n` +
    `📋 *Ваш доступ включает:*\n` +
    `• 📝 ${LIMITS.text} текстовых генераций\n` +
    `• 🖼 ${LIMITS.photo} фото-генераций\n` +
    `• 🎬 ${LIMITS.video} видео-генерация\n` +
    `• 📅 ${LIMITS.days} дней с момента первого использования\n\n` +
    `_Доступ привязан к вашему номеру телефона и не может быть передан другому человеку._`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🚀 Открыть бот", url: deepLink }]],
        remove_keyboard: true,
      },
    }
  );

  // Уведомление администратору
  await notifyAdminNewUser(db.users[phone]);
}

async function notifyAdminNewUser(user) {
  const db = await loadDB();
  const totalUsers = Object.keys(db.users).length;

  await leadsBot.sendMessage(
    ADMIN_ID,
    `🆕 *Новый демо-пользователь!*\n\n` +
    `👤 ${user.name}, ${user.city}\n` +
    `💼 Сфера: ${user.scope}\n` +
    `📱 ${user.phone}\n` +
    `🔑 Код: \`${user.invite_code}\`\n` +
    `📊 Всего пользователей: ${totalUsers}\n` +
    `⏰ ${formatDate(new Date())}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "💬 Написать", callback_data: `contact_${user.tg_id}` },
        ]],
      },
    }
  );
}

async function notifyAdminLimitExhausted(user, limitType, requestMore = false) {
  const labelMap = { text: "📝 Тексты", photo: "🖼 Фото", video: "🎬 Видео" };
  const label = labelMap[limitType] || limitType;

  const text = requestMore
    ? `🔔 *Запрос на увеличение лимита*\n\n` +
      `👤 ${user.name}, ${user.city}\n` +
      `📱 ${user.phone}\n` +
      `📊 Хочет больше: *${label}*\n\n` +
      `Текущие лимиты:\n` +
      `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
      `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
      `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}`
    : `⚠️ *Лимит исчерпан*\n\n` +
      `👤 ${user.name}, ${user.city}\n` +
      `📱 ${user.phone}\n` +
      `🚫 Исчерпан: *${label}*`;

  await leadsBot.sendMessage(ADMIN_ID, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "💬 Написать пользователю", callback_data: `contact_${user.tg_id}` },
        { text: "➕ Продлить на 3 дня", callback_data: `extend_${user.phone}` },
      ]],
    },
  });
}

async function notifyAdminExpiryWarning(user) {
  await leadsBot.sendMessage(
    ADMIN_ID,
    `⏰ *Демо заканчивается завтра*\n\n` +
    `👤 ${user.name}, ${user.city}\n` +
    `📱 ${user.phone}\n` +
    `💼 ${user.scope}\n\n` +
    `📊 Использование:\n` +
    `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
    `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
    `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "💬 Написать", callback_data: `contact_${user.tg_id}` },
          { text: "➕ Продлить на 3 дня", callback_data: `extend_${user.phone}` },
        ]],
      },
    }
  );
}

// ─── СТАТИСТИКА ───────────────────────────────────────────────────────────────

async function sendStatsToAdmin(mode) {
  const db = await loadDB();
  const users = Object.values(db.users);

  if (users.length === 0) {
    await leadsBot.sendMessage(ADMIN_ID, "📊 Пользователей пока нет.");
    return;
  }

  const now = new Date();
  let active = 0, expired = 0, notActivated = 0;
  let totalText = 0, totalPhoto = 0, totalVideo = 0;
  const hotLeads = [];

  for (const u of users) {
    if (!u.activated_at) {
      notActivated++;
    } else if (u.expires_at && new Date(u.expires_at) < now) {
      expired++;
    } else {
      active++;
    }
    totalText += u.limits.text.used;
    totalPhoto += u.limits.photo.used;
    totalVideo += u.limits.video.used;

    // Warm lead: 20+ генераций за время демо
    const totalUsed = u.limits.text.used + u.limits.photo.used + u.limits.video.used;
    if (totalUsed >= 20) hotLeads.push(u);
  }

  let msg =
    `📊 *Статистика демо-доступа*\n\n` +
    `👥 Всего: ${users.length}\n` +
    `✅ Активных: ${active}\n` +
    `⏰ Не активировали: ${notActivated}\n` +
    `❌ Истёкших: ${expired}\n\n` +
    `📈 *Генерации:*\n` +
    `📝 Текст: ${totalText}\n` +
    `🖼 Фото: ${totalPhoto}\n` +
    `🎬 Видео: ${totalVideo}\n`;

  if (hotLeads.length > 0) {
    msg += `\n🔥 *Горячие лиды (20+ генераций):*\n`;
    for (const u of hotLeads) {
      const used = u.limits.text.used + u.limits.photo.used + u.limits.video.used;
      msg += `• ${u.name}, ${u.city} — ${used} генераций\n`;
    }
  }

  msg += `\n_Используй /stats @username для детальной статистики_`;

  await leadsBot.sendMessage(ADMIN_ID, msg, { parse_mode: "Markdown" });
}

async function sendUserStats(query) {
  const db = await loadDB();
  const users = Object.values(db.users);
  const user = users.find(
    (u) =>
      u.phone?.includes(query) ||
      u.name?.toLowerCase().includes(query) ||
      u.tg_username?.toLowerCase().includes(query.replace("@", ""))
  );

  if (!user) {
    await leadsBot.sendMessage(ADMIN_ID, `Пользователь "${query}" не найден.`);
    return;
  }

  const now = new Date();
  const activated = user.activated_at ? new Date(user.activated_at) : null;
  const expires = user.expires_at ? new Date(user.expires_at) : null;
  const daysLeft = expires ? Math.max(0, Math.ceil((expires - now) / 86400000)) : null;
  const daysUsed = activated ? Math.ceil((now - activated) / 86400000) : 0;
  const totalUsed = user.limits.text.used + user.limits.photo.used + user.limits.video.used;
  const hotLabel = totalUsed >= 20 ? " 🔥" : totalUsed >= 10 ? " 🌡" : "";

  // Последние 5 событий
  const recentEvents = (user.events || []).slice(-5).reverse();
  let eventsText = "";
  for (const e of recentEvents) {
    const time = new Date(e.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const scLabel = e.scenario === "sexologist" ? "💜 Сексолог" : "🧠 Психолог";
    const actionLabel = { generate_text: "текст", generate_photo: "фото", generate_video: "видео" }[e.action] || e.action;
    eventsText += `• ${time} — ${scLabel}, ${actionLabel}${e.length ? ` (${e.length})` : ""}\n`;
  }

  const msg =
    `👤 *${user.name}, ${user.city}*${hotLabel}\n` +
    `💼 ${user.scope}\n` +
    `📱 ${user.phone}\n` +
    `📅 Активен: ${daysUsed} из ${LIMITS.days} дней\n` +
    (daysLeft !== null ? `⏳ Осталось: ${daysLeft} дн.\n` : `⏰ Не активировал\n`) +
    `\n📊 *Лимиты:*\n` +
    `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
    `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
    `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}\n` +
    (eventsText ? `\n🕐 *Последние действия:*\n${eventsText}` : "");

  await leadsBot.sendMessage(ADMIN_ID, msg, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "💬 Написать", callback_data: `contact_${user.tg_id}` },
        { text: "➕ Продлить на 3 дня", callback_data: `extend_${user.phone}` },
      ]],
    },
  });
}

// ─── ДАЙДЖЕСТ И ПРОВЕРКА ДЕДЛАЙНОВ ───────────────────────────────────────────

async function checkDeadlinesAndDigest() {
  const db = await loadDB();
  const users = Object.values(db.users);
  const now = new Date();

  let digestText = "";
  let hasActivity = false;

  for (const user of users) {
    if (!user.expires_at || !user.activated_at) continue;

    const expires = new Date(user.expires_at);
    const hoursLeft = (expires - now) / 3600000;

    // За 24 часа до конца — уведомление пользователю
    if (hoursLeft > 0 && hoursLeft <= 25 && !user.expiry_warned) {
      // Уведомляем пользователя
      if (user.tg_id) {
        try {
          await leadsBot.sendMessage(
            user.tg_id,
            `⏰ *${user.name}, завтра последний день вашего демо-доступа!*\n\n` +
            `Использовано:\n` +
            `📝 Текст: ${user.limits.text.used}/${user.limits.text.max}\n` +
            `🖼 Фото: ${user.limits.photo.used}/${user.limits.photo.max}\n` +
            `🎬 Видео: ${user.limits.video.used}/${user.limits.video.max}`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[
                  { text: "📩 Запросить продление", callback_data: "request_extend" },
                ]],
              },
            }
          );
        } catch (e) {
          console.error("Ошибка уведомления пользователя:", e.message);
        }
      }

      // Уведомляем админа
      await notifyAdminExpiryWarning(user);

      db.users[user.phone].expiry_warned = true;
      hasActivity = true;
    }

    // Дайджест — собираем активных
    if (hoursLeft > 0) {
      const totalUsed = user.limits.text.used + user.limits.photo.used + user.limits.video.used;
      if (totalUsed > 0) {
        hasActivity = true;
        digestText += `• ${user.name} (${user.city}) — 📝${user.limits.text.used} 🖼${user.limits.photo.used} 🎬${user.limits.video.used}, ещё ${Math.ceil(hoursLeft / 24)} дн.\n`;
      }
    }
  }

  await saveDB(db);

  // Отправляем дайджест только если есть активность
  const now9am = new Date();
  const isDigestTime = now9am.getHours() === 9 && now9am.getMinutes() < 30;

  if (isDigestTime && hasActivity && digestText) {
    await leadsBot.sendMessage(
      ADMIN_ID,
      `☀️ *Утренний дайджест*\n\n` +
      `*Активные пользователи:*\n${digestText}\n` +
      `_Используй /stats для полной статистики_`,
      { parse_mode: "Markdown" }
    );
  }
}

// Проверка каждые 30 минут
if (LEADS_BOT_ENABLED) {
  setInterval(checkDeadlinesAndDigest, 30 * 60 * 1000);
}

// ─── ЭКСПОРТ ФУНКЦИЙ ДЛЯ ОСНОВНОГО БОТА ─────────────────────────────────────
// (используется из index.js для уведомлений о лимитах)

export async function notifyAdminLimitExhaustedExport(user, limitType, requestMore = false) {
  await notifyAdminLimitExhausted(user, limitType, requestMore);
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

function formatDate(date) {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

process.on("uncaughtException", (err) => console.error("Leads bot uncaught:", err.message));
process.on("unhandledRejection", (err) => console.error("Leads bot rejection:", err));
