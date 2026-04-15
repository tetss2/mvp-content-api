import fs from "fs";
import path from "path";
import OpenAI from "openai";

// === 1. Подключаем JSON с твоими статьями ===
import articles from "./articles.production.json";

// === 2. Собираем контекст (RAW + легкая чистка) ===
const context = articles.articles
  .map(a => `### ${a.title}\n${a.content}`)
  .join("\n\n");

// === 3. Инициализация OpenAI ===
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 4. Функция ответа бота ===
async function askBot(userMessage) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini", // можно поменять на gpt-5 если нужно мощнее
    messages: [
      {
        role: "system",
        content: `
Ты — помощник психолога.
Используй ТОЛЬКО контекст ниже для ответов.

Если информации нет — говори, что не найдено в базе.

Контекст:
${context}
        `,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}

// === 5. Тестовый запуск ===
async function main() {
  const question = "Как справиться с тревогой?";
  const answer = await askBot(question);

  console.log("\n=== ВОПРОС ===");
  console.log(question);

  console.log("\n=== ОТВЕТ ===");
  console.log(answer);
}

main();
