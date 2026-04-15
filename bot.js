import TelegramBot from 'node-telegram-bot-api';

// 🔐 токен из Render Environment
const token = process.env.TELEGRAM_TOKEN;

// 🌐 URL твоего API
const API_URL = 'https://mvp-content-api.onrender.com/ask';

// 🚀 запуск бота
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Telegram bot started');

// 📩 обработка сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // игнорируем пустые сообщения
  if (!text) return;

  try {
    // отправляем запрос к твоему API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: text }),
    });

    const data = await response.json();

    // если API вернул ответ
    const answer = data.answer || 'Нет ответа';

    await bot.sendMessage(chatId, answer);

  } catch (error) {
    console.error('Ошибка:', error);

    await bot.sendMessage(
      chatId,
      'Ошибка сервера. Попробуй позже.'
    );
  }
});
