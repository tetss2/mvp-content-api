import TelegramBot from "node-telegram-bot-api";
import axios from "axios";

const token = process.env.TELEGRAM_TOKEN;
const API_URL = process.env.API_URL;

const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  try {
    const res = await axios.post(`${API_URL}/ask`, {
      question: text,
    });

    const answer = res.data.answer;

    await bot.sendMessage(chatId, answer);
  } catch (e) {
    console.error(e);
    bot.sendMessage(chatId, "Ошибка сервера 😢");
  }
});
