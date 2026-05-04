/**
 * ИНДЕКСАТОР ИСТОЧНИКОВ ЗНАНИЙ
 * Запуск: node scripts/indexer.js
 * Перед запуском установи переменные окружения:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Проверка переменных ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('❌ Не хватает переменных: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Утилиты ---

function splitIntoChunks(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
    i += chunkSize - overlap;
  }
  return chunks;
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Парсеры ---

async function parsePdf(filePath) {
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(filePath) {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ path: filePath });
  return result.value;
}

async function parseUrl(url) {
  const { default: fetch } = await import('node-fetch');
  const { load } = await import('cheerio');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  const html = await response.text();
  const $ = load(html);
  $('script, style, nav, footer, header, aside, .ad, .ads, .cookie-banner').remove();
  const selectors = ['article', 'main', '.article-body', '.post-content', '.content', '.entry-content', 'body'];
  let text = '';
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      text = el.text().replace(/\s+/g, ' ').trim();
      if (text.length > 200) break;
    }
  }
  return text;
}

// --- Индексация одного источника ---

async function indexSource({ scenario, sourceType, sourceTitle, sourceUrl, text }) {
  console.log(`\n📄 Индексирую: ${sourceTitle} [${scenario}]`);

  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_title', sourceTitle)
    .eq('scenario', scenario);

  if (deleteError) {
    console.warn('   ⚠️  Ошибка удаления старых чанков:', deleteError.message);
  }

  const chunks = splitIntoChunks(text);
  console.log(`   Чанков: ${chunks.length}`);

  let indexed = 0;
  for (const chunk of chunks) {
    if (chunk.trim().length < 50) continue;

    try {
      const embedding = await getEmbedding(chunk);

      const { error } = await supabase.from('knowledge_chunks').insert({
        scenario,
        source_type: sourceType,
        source_title: sourceTitle,
        source_url: sourceUrl || null,
        chunk_text: chunk,
        embedding,
      });

      if (error) {
        console.error('   ❌ Ошибка вставки:', error.message);
      } else {
        indexed++;
        process.stdout.write(`\r   Записано: ${indexed}/${chunks.length}`);
      }
    } catch (err) {
      console.error('   ❌ Ошибка embedding:', err.message);
    }

    await sleep(250);
  }

  console.log(`\n   ✅ Готово: ${indexed} чанков`);
}

// ============================================================
// КОНФИГ ИСТОЧНИКОВ
// Добавляй сюда новые источники когда нужно переиндексировать
// ============================================================

const SOURCES = [
  // ─── ПСИХОЛОГ ───────────────────────────────────────────
  // Статьи из интернета:
  // {
  //   scenario: 'psychologist',
  //   sourceType: 'article',
  //   sourceTitle: 'Название статьи',
  //   sourceUrl: 'https://example.com/article',
  // },

  // PDF книги:
  // {
  //   scenario: 'psychologist',
  //   sourceType: 'pdf',
  //   sourceTitle: 'Название книги',
  //   filePath: path.join(__dirname, '../sources/psychologist/book.pdf'),
  // },

  // DOCX файлы:
  // {
  //   scenario: 'psychologist',
  //   sourceType: 'docx',
  //   sourceTitle: 'Название документа',
  //   filePath: path.join(__dirname, '../sources/psychologist/doc.docx'),
  // },

  // ─── СЕКСОЛОГ ───────────────────────────────────────────
  // Статьи:
  // {
  //   scenario: 'sexologist',
  //   sourceType: 'article',
  //   sourceTitle: 'Название статьи по сексологии',
  //   sourceUrl: 'https://example.com/sexology-article',
  // },

  // PDF книги:
  // {
  //   scenario: 'sexologist',
  //   sourceType: 'pdf',
  //   sourceTitle: 'Название книги по сексологии',
  //   filePath: path.join(__dirname, '../sources/sexologist/book.pdf'),
  // },

  // Транскрипт видео (сначала транскрибируй через Whisper, сохрани как .txt):
  // {
  //   scenario: 'sexologist',
  //   sourceType: 'video',
  //   sourceTitle: 'Название тренинга',
  //   filePath: path.join(__dirname, '../sources/sexologist/training-transcript.txt'),
  // },

  // ─── ТЕСТОВЫЙ ИСТОЧНИК (локальный файл) ─────────────────
  {
    scenario: 'psychologist',
    sourceType: 'video', // тип 'video' читает .txt файл напрямую
    sourceTitle: 'Тест: что такое тревога',
    filePath: path.join(__dirname, '../sources/psychologist/test-trevoga.txt'),
  },
];

// ============================================================

async function main() {
  console.log('🚀 Запуск индексации...');
  console.log(`📋 Источников для обработки: ${SOURCES.length}\n`);

  let success = 0;
  let failed = 0;

  for (const source of SOURCES) {
    let text = '';

    try {
      if (source.sourceType === 'article') {
        if (!source.sourceUrl) throw new Error('Нет sourceUrl для статьи');
        text = await parseUrl(source.sourceUrl);
      } else if (source.sourceType === 'pdf') {
        if (!source.filePath) throw new Error('Нет filePath для PDF');
        text = await parsePdf(source.filePath);
      } else if (source.sourceType === 'docx') {
        if (!source.filePath) throw new Error('Нет filePath для DOCX');
        text = await parseDocx(source.filePath);
      } else if (source.sourceType === 'video') {
        if (!source.filePath) throw new Error('Нет filePath для файла');
        text = fs.readFileSync(source.filePath, 'utf-8');
      } else {
        throw new Error(`Неизвестный sourceType: ${source.sourceType}`);
      }

      if (!text || text.length < 100) {
        console.warn(`⚠️  Слишком мало текста (${text.length} симв.) для: ${source.sourceTitle}`);
        failed++;
        continue;
      }

      console.log(`   Длина текста: ${text.length} символов`);

      await indexSource({
        scenario: source.scenario,
        sourceType: source.sourceType,
        sourceTitle: source.sourceTitle,
        sourceUrl: source.sourceUrl,
        text,
      });

      success++;
    } catch (err) {
      console.error(`❌ Ошибка с источником "${source.sourceTitle}":`, err.message);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 Индексация завершена!`);
  console.log(`   ✅ Успешно: ${success}`);
  console.log(`   ❌ Ошибок: ${failed}`);
  console.log(`${'='.repeat(50)}`);
}

main();
