import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();

const ARTICLES = [
  "https://www.b17.ru/article/tebe_nado/",
  "https://www.b17.ru/article/264031/",
  "https://www.b17.ru/article/vkus_gizni/",
  "https://www.b17.ru/article/163652/",
  "https://www.b17.ru/article/nikogda_ne_sdavajsia/",
  "https://www.b17.ru/article/igri_razuma/",
  "https://www.b17.ru/article/kogo_hochu_ne_znaju_kogo_znaju_-_togo/",
  "https://www.b17.ru/article/tolko_segodnja/",
  "https://www.b17.ru/article/garmonozacia_tcvetom/",
  "https://www.b17.ru/article/zhitiemoe/",
  "https://www.b17.ru/article/mojoudovolstvie/",
  "https://www.b17.ru/article/problema_ili_zadacha/",
  "https://www.b17.ru/article/mojapsihosomatika/",
  "https://www.b17.ru/article/babushkino_zaveshanie/",
  "https://www.b17.ru/article/104936/",
  "https://www.b17.ru/article/104933/"
];

// задержка (антибан)
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// очистка текста
function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/Читайте также:.*/gi, "")
    .replace(/Поделиться:.*/gi, "")
    .trim();
}

// разбивка на предложения
function splitIntoSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [];
}

// делаем 3 блока по 4–6 предложений
function makeBlocks(text) {
  const sentences = splitIntoSentences(text);

  const blocks = [];
  let index = 0;

  for (let i = 0; i < 3; i++) {
    const block = sentences.slice(index, index + 5).join(" ");
    blocks.push(block);
    index += 5;
  }

  return blocks;
}

// парсинг одной статьи
async function parseArticle(url) {
  try {
    console.log("Парсим:", url);

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);

    const title = $("h1").first().text().trim();

    $(".article_text script, .article_text style").remove();

    $(".article_text a").each((i, el) => {
      const text = $(el).text();
      $(el).replaceWith(text);
    });

    const raw = $(".article_text").text();

    const content = cleanText(raw);

    return { title, content };

  } catch (err) {
    console.log("Ошибка:", url, err.message);
    return null;
  }
}

// собираем все статьи
async function buildKnowledge() {
  const allTexts = [];

  for (const url of ARTICLES) {
    const article = await parseArticle(url);

    if (article && article.content) {
      allTexts.push(article.content);
    }

    await delay(2000); // антибан
  }

  const combined = allTexts.join(" ");

  console.log("Все статьи объединены");

  return makeBlocks(combined);
}

// endpoint
app.get("/", async (req, res) => {
  console.log("Запрос пришёл");

  try {
    const blocks = await buildKnowledge();

    res.json({
      status: "ok",
      blocks
    });

  } catch (e) {
    console.error("Ошибка сервера:", e.message);

    res.status(500).json({
      status: "error",
      message: e.message
    });
  }
});

// порт для Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
