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

let cachedBlocks = null;

// задержка
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// очистка текста
function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/Читайте также:.*/gi, "")
    .replace(/Поделиться:.*/gi, "")
    .trim();
}

// предложения
function splitIntoSentences(text) {
  return text.match(/[^.!?]+[.!?]+/g) || [];
}

// 3 блока
function makeBlocks(text) {
  const sentences = splitIntoSentences(text);

  return [
    sentences.slice(0, 5).join(" "),
    sentences.slice(5, 10).join(" "),
    sentences.slice(10, 15).join(" ")
  ];
}

// парсинг
async function parseArticle(url) {
  try {
    console.log("Парсим:", url);

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9"
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);

    const raw = $(".article_text").text();

    return cleanText(raw);

  } catch (err) {
    console.log("Ошибка:", url, err.message);
    return null;
  }
}

// сборка ОДИН РАЗ
async function buildOnce() {
  console.log("СТАРТ ПАРСИНГА (1 раз)");

  const texts = [];

  for (const url of ARTICLES) {
    const t = await parseArticle(url);

    if (t) texts.push(t);

    await delay(7000); // ⬅️ сильно увеличили паузу
  }

  const combined = texts.join(" ");

  cachedBlocks = makeBlocks(combined);

  console.log("ГОТОВО. ДАННЫЕ ЗАКЭШИРОВАНЫ");
}

// endpoint
app.get("/", async (req, res) => {
  console.log("Запрос к API");

  if (!cachedBlocks) {
    return res.json({
      status: "loading",
      message: "Данные ещё собираются, попробуй через 1-2 минуты"
    });
  }

  res.json({
    status: "ok",
    blocks: cachedBlocks
  });
});

// запуск
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("Server running on port", PORT);

  await buildOnce(); // ⬅️ ключевой момент
});
