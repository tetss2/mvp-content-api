import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', async (msg) => {
  const text = msg.text;

  const res = await fetch('https://mvp-content-api.onrender.com/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question: text })
  });

  const data = await res.json();

  bot.sendMessage(msg.chat.id, data.answer);
});
