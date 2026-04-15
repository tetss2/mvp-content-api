import OpenAI from "openai";

// ✅ ВАЖНО: фикс для Node 22
import articles from "./articles.production.json" assert { type: "json" };

// === Контекст ===
const context = articles.articles
  .map(a => `### ${a.title}\n${a.content}`)
  .join("\n\n");

// === OpenAI ===
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function askBot(userMessage) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Ты — помощник психолога.
Используй ТОЛЬКО контекст ниже.

Если ответа нет — скажи, что в базе нет информации.

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

// тест
(async () => {
  const answer = await askBot("Как справиться с тревогой?");
  console.log(answer);
})();
