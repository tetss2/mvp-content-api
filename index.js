import express from "express";
import { bot, handleMessage } from "./bot.js";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// ====== SET WEBHOOK ON START ======
const webhookPath = `/webhook/${TELEGRAM_TOKEN}`;
bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`)
  .then(() => console.log("Webhook set:", `${WEBHOOK_URL}${webhookPath}`))
  .catch(err => console.error("Webhook error:", err));

// ====== RECEIVE UPDATES FROM TELEGRAM ======
app.post(webhookPath, (req, res) => {
  res.sendStatus(200); // сразу отвечаем Telegram
  const update = req.body;
  if (update.message) {
    handleMessage(update.message).catch(err => {
      console.error("Background handler error:", err.message);
    });
  }
});

// ====== HEALTH CHECK ======
app.get("/", (req, res) => {
  res.send("Server is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Legacy server listening...");
});
