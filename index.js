import express from "express";
import "./bot.js"; // 👈 запускаем бота

const app = express();

app.get("/", (req, res) => {
  res.send("Server is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
