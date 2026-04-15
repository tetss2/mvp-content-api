import fs from "fs";
import OpenAI from "openai";

// === 1. Читаем JSON вручную ===
const raw = fs.readFileSync("./articles.production.json", "utf-8");
const articles = JSON.parse(raw);

// === 2. Собираем контекст ===
const context = articles.articles
  .map(a => `### ${a.title}\n${a.content}`)
  .join("\n\n");

// === 3. OpenAI ===
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 4. Функция ответа ===
async function askBot(userMessage) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ты — помощник психолога.
Отвечай только на основе контекста.

Если ответа нет — скажи, что информации нет.

Контекст:
${context}
        `,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  return response.choices[0].message.content;
}

// === 5. Тест ===
(async () => {
  const answer = await askBot("Как справиться с тревогой?");
  console.log(answer);
})();
