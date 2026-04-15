import fetch from "node-fetch";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

let offset = 0;

// функция отправки сообщения
async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
    }),
  });
}

// основной цикл
async function startBot() {
  console.log("🚀 Bot started...");

  while (true) {
    try {
      const res = await fetch(
        `${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await res.json();

      // защита от ошибок
      if (!data.ok) {
        console.log("Telegram API error:", data);
        continue;
      }

      if (!data.result || data.result.length === 0) {
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;

        if (!update.message) continue;

        const chatId = update.message.chat.id;
        const text = update.message.text;

        console.log("Message:", text);

        // логика бота
        if (text === "/start") {
          await sendMessage(chatId, "Привет 👋 Я бот. Напиши что-нибудь.");
        } else {
          await sendMessage(chatId, `Ты написал: ${text}`);
        }
      }
    } catch (err) {
      console.log("Error:", err.message);
    }
  }
}

startBot();
