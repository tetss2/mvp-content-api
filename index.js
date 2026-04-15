import fetch from "node-fetch";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function getUpdates(offset) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}`);
  return res.json();
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}

let offset = 0;

setInterval(async () => {
  const data = await getUpdates(offset);

  if (data.result.length > 0) {
    for (const update of data.result) {
      offset = update.update_id + 1;

      const chatId = update.message.chat.id;
      const text = update.message.text;

      const response = await fetch("https://mvp-content-api.onrender.com/generate-post", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ topic: text })
      });

      const json = await response.json();

      await sendMessage(chatId, json.text);
    }
  }
}, 3000);
