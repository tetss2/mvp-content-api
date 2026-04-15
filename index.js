const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PORT = process.env.PORT || 3000;

// Проверка
app.get("/", (req, res) => {
  res.send("MVP WORKING");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Генерация поста
app.post("/generate-post", async (req, res) => {
  try {
    const { topic } = req.body;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Ты опытный психолог. Пиши глубокие, вовлекающие посты для соцсетей.",
        },
        {
          role: "user",
          content: `Напиши пост на тему: ${topic}`,
        },
      ],
    });

    const text = completion.choices[0].message.content;

    res.json({
      success: true,
      topic,
      text,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
