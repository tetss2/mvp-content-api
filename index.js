import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// === ТВОИ ПЕРЕМЕННЫЕ ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// === ТВОЙ API ===
const API_URL = "https://mvp-content-api.onrender.com/generate-post";

// === Webhook endpoint ===
app.post(`/bot${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const userText = message.text;

    console.log("User:", userText);

    // === Запрос к твоему API ===
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic: userText }),
    });

    const data = await response.json();

    const replyText = data.text || "Ошибка генерации";

    // === Ответ в Telegram ===
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
      }),
    });

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// === Проверка сервера ===
app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
