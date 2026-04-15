import express from "express";
import OpenAI from "openai";
import fs from "fs";

const app = express();
app.use(express.json());

// ===== OpenAI =====
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== Загружаем статьи =====
const data = JSON.parse(fs.readFileSync("./articles.production.json", "utf-8"));
const articles = data.articles;

// ===== Простая, но быстрая релевантность =====
function scoreArticle(article, query) {
  const text = (
    article.title +
    " " +
    article.content +
    " " +
    (article.tags || []).join(" ")
  ).toLowerCase();

  const words = query.toLowerCase().split(" ");
  let score = 0;

  for (let word of words) {
    if (text.includes(word)) score += 2;
    if (article.title.toLowerCase().includes(word)) score += 3;
    if ((article.tags || []).join(" ").includes(word)) score += 4;
  }

  return score;
}

// ===== Поиск лучших статей =====
function findRelevantArticles(query) {
  return articles
    .map((a) => ({
      ...a,
      score: scoreArticle(a, query),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // ТОП 3
}

// ===== API =====
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    const relevant = findRelevantArticles(question);

    const context = relevant
      .map(
        (a) =>
          `Заголовок: ${a.title}\nТеги: ${a.tags.join(", ")}\nТекст: ${a.content}`
      )
      .join("\n\n---\n\n");

    const prompt = `
Ты — психолог Динара.

Используй:
1) Контекст статей ниже (ОСНОВА)
2) Свои знания (ДОПОЛНЕНИЕ)

Правила:
- Пиши как живой человек
- Без воды
- Поддерживающе
- Можно задавать уточняющий вопрос

Контекст:
${context}

Вопрос:
${question}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const answer = completion.choices[0].message.content;

    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка" });
  }
});

// ===== health-check =====
app.get("/", (req, res) => {
  res.send("API работает");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
