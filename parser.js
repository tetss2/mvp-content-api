const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE_URL = "https://www.b17.ru";
const PROFILE_URL = "https://www.b17.ru/dinakachaeva/";

async function getHTML(url) {
  const { data } = await axios.get(url);
  return cheerio.load(data);
}

// Получаем ссылки на статьи
async function getArticlesLinks() {
  const $ = await getHTML(PROFILE_URL);

  const links = [];

  $("a").each((i, el) => {
    const href = $(el).attr("href");

    if (href && href.includes("/article/")) {
      links.push(BASE_URL + href);
    }
  });

  return [...new Set(links)];
}

// Парсим статью
async function parseArticle(url) {
  const $ = await getHTML(url);

  const title = $("h1").text().trim();
  const content = $(".article-content, .text").text().trim();

  return {
    url,
    title,
    content,
  };
}

// Парсим профиль
async function parseProfile() {
  const $ = await getHTML(PROFILE_URL);

  const name = $("h1").text().trim();
  const description = $(".user_about, .text").text().trim();

  return { name, description };
}

// Главная функция
(async () => {
  console.log("Парсим профиль...");
  const profile = await parseProfile();

  console.log("Ищем статьи...");
  const links = await getArticlesLinks();

  console.log("Найдено статей:", links.length);

  const articles = [];

  for (let i = 0; i < links.length; i++) {
    console.log(`Парсим статью ${i + 1}/${links.length}`);
    try {
      const article = await parseArticle(links[i]);
      articles.push(article);
    } catch (e) {
      console.log("Ошибка:", links[i]);
    }
  }

  const result = {
    profile,
    articles,
  };

  fs.writeFileSync("data.json", JSON.stringify(result, null, 2));

  console.log("Готово. Сохранено в data.json");
})();
