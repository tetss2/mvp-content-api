/**
 * ИНДЕКСАТОР ИСТОЧНИКОВ ЗНАНИЙ — АВТОСКАНИРОВАНИЕ ПАПОК
 *
 * Запуск:
 *   node scripts/indexer.js              — индексирует ВСЕ новые файлы
 *   node scripts/indexer.js --force      — переиндексирует ВСЕ файлы заново
 *   node scripts/indexer.js --scenario sexologist  — только сексолог
 *   node scripts/indexer.js --scenario psychologist — только психолог
 *
 * Структура папок:
 *   sources/psychologist/  — PDF, DOCX, DOC, TXT для психолога
 *   sources/sexologist/    — PDF, DOCX, DOC, TXT для сексолога
 *
 * Переменные окружения:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, '../sources');

// --- Аргументы запуска ---
const args = process.argv.slice(2);
const FORCE_REINDEX = args.includes('--force');
const SCENARIO_FILTER = args.includes('--scenario')
  ? args[args.indexOf('--scenario') + 1]
  : null;

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

async function parseTxt(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return parsePdf(filePath);
  if (ext === '.docx' || ext === '.doc' || ext === '.rtf') return parseDocx(filePath);
  if (ext === '.txt') return parseTxt(filePath);
  throw new Error(`Неподдерживаемый формат: ${ext}`);
}

// --- Проверка уже проиндексированных ---

async function getIndexedTitles(scenario) {
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('source_title')
    .eq('scenario', scenario);

  if (error) return new Set();
  return new Set(data.map(r => r.source_title));
}

// --- Индексация одного файла ---

async function indexSource({ scenario, filePath, sourceTitle }) {
  const ext = path.extname(filePath).toLowerCase();
  const sourceType = ext === '.pdf' ? 'pdf'
    : (ext === '.txt') ? 'text'
    : 'docx';

  console.log(`\n📄 ${sourceTitle}`);
  console.log(`   Формат: ${ext} | Сценарий: ${scenario}`);

  let text = '';
  try {
    text = await parseFile(filePath);
  } catch (err) {
    console.error(`   ❌ Ошибка парсинга: ${err.message}`);
    return false;
  }

  if (!text || text.trim().length < 100) {
    console.warn(`   ⚠️  Слишком мало текста (${text.length} симв.) — пропускаю`);
    return false;
  }

  console.log(`   Текст: ${text.length} символов`);

  // Удаляем старые чанки если есть
  await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_title', sourceTitle)
    .eq('scenario', scenario);

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
        source_url: null,
        chunk_text: chunk,
        embedding,
      });

      if (error) {
        console.error(`\n   ❌ Ошибка вставки: ${error.message}`);
      } else {
        indexed++;
        process.stdout.write(`\r   Записано: ${indexed}/${chunks.length}  `);
      }
    } catch (err) {
      console.error(`\n   ❌ Embedding error: ${err.message}`);
    }

    await sleep(250);
  }

  console.log(`\n   ✅ Готово: ${indexed} чанков`);
  return indexed > 0;
}

// --- Сканирование папки ---

function scanFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return [];

  return fs.readdirSync(folderPath)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.pdf', '.docx', '.doc', '.rtf', '.txt'].includes(ext);
    })
    .map(file => ({
      filePath: path.join(folderPath, file),
      sourceTitle: path.basename(file, path.extname(file)), // имя файла без расширения
    }));
}

// --- Главная функция ---

async function main() {
  console.log('🚀 Запуск индексации...');
  if (FORCE_REINDEX) console.log('⚡ Режим: переиндексация всех файлов');
  if (SCENARIO_FILTER) console.log(`🎯 Фильтр сценария: ${SCENARIO_FILTER}`);
  console.log('');

  const scenarios = ['psychologist', 'sexologist'].filter(s =>
    !SCENARIO_FILTER || s === SCENARIO_FILTER
  );

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const scenario of scenarios) {
    const folderPath = path.join(SOURCES_DIR, scenario);
    const files = scanFolder(folderPath);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📁 Папка: sources/${scenario}/ — найдено файлов: ${files.length}`);
    console.log(`${'─'.repeat(50)}`);

    if (files.length === 0) {
      console.log('   Пусто — пропускаю');
      continue;
    }

    // Получаем уже проиндексированные (если не --force)
    const indexedTitles = FORCE_REINDEX
      ? new Set()
      : await getIndexedTitles(scenario);

    for (const { filePath, sourceTitle } of files) {
      // Пропускаем уже проиндексированные
      if (!FORCE_REINDEX && indexedTitles.has(sourceTitle)) {
        console.log(`\n⏭️  Пропускаю (уже в базе): ${sourceTitle}`);
        totalSkipped++;
        continue;
      }

      const ok = await indexSource({ scenario, filePath, sourceTitle });
      if (ok) totalSuccess++;
      else totalFailed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 Индексация завершена!`);
  console.log(`   ✅ Успешно:  ${totalSuccess}`);
  console.log(`   ⏭️  Пропущено: ${totalSkipped} (уже в базе)`);
  console.log(`   ❌ Ошибок:   ${totalFailed}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`\n💡 Подсказка: node scripts/indexer.js --force — переиндексировать всё`);
}

main();
