import fs from "fs";
import express from "express";
import OpenAI from "openai";

// =======================
// 1. Чтение JSON (стабильно для Node 22)
// =======================
let articles = { articles: [] };

try {
  const raw = fs.readFileSync("./articles.production.json", "utf-8");
  articles = JSON.parse(raw);
} catch (e) {
  console.error("❌ Ошибка чтения JSON:", e.message);
}

// =======================
// 2. Формирование контекста
// =======================
const context = (articles.articles || [])
  .map(a => `### ${a.title}\n${a.content}`)
  .join("\n\n");

// DEBUG (оставь на первое время)
console.log("=== ARTICLES COUNT ===", articles.articles?.length || 0);
console.log("=== CONTEXT LENGTH ===", context.length);

// =======================
// 3. OpenAI
// =======================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =======================
// 4. Express сервер (Render требует этого)
// =======================
const app = express();
app.use(express.json());

// health-check (чтобы Render не думал что сервис умер)
app.get("/", (req, res) => {
  res.send("API работает");
});

// =======================
// 5. Основной endpoint
// =======================
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Нет вопроса" });
    }

    if (!context || context.length < 50) {
      return res.json({
        answer: "База знаний пуста или не загрузилась",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Ты — помощник психолога.

Отвечай строго на основе контекста ниже.
Не выдумывай.

Если ответа нет — пиши: "Информации нет".

Контекст:
${context}
          `,
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.7,
    });

    res.json({
      answer: response.choices[0].message.content,
    });

  } catch (error) {
    console.error("❌ Ошибка OpenAI:", error.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// =======================
// 6. Запуск сервера
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
