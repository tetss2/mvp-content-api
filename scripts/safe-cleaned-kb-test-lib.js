import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(__dirname, '..');
export const CLEANED_DIR = path.join(REPO_ROOT, 'kb', 'sexologist', 'cleaned');
export const TEST_DIR = path.join(REPO_ROOT, 'kb', 'sexologist', 'test-ingestion');
export const EMBEDDINGS_PATH = path.join(TEST_DIR, 'sexologist-cleaned-mini.embeddings.jsonl');
export const MANIFEST_PATH = path.join(TEST_DIR, 'sexologist-cleaned-mini.manifest.json');

export const DEFAULT_TEST_FILES = [
  'Sexopatologia_Spravochnik_1990.cleaned.txt',
  'Опросник_социосексуальной_ориентации_SOI.cleaned.txt',
  'Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.cleaned.txt',
];

export const DEFAULT_QUESTIONS = [
  'Что такое сексуальная норма и как о ней говорить без стыда?',
  'Как социосексуальная ориентация связана с отношениями?',
  'Когда в сексологической работе может быть полезна психотерапия?',
  'Что делать, если у человека тревога вокруг близости?',
];

export function splitIntoChunks(text, chunkSize = 420, overlap = 70) {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length > chunkSize) {
      if (current.length) {
        chunks.push(current.join('\n\n'));
        current = [];
        currentWords = 0;
      }
      for (let i = 0; i < words.length; i += chunkSize - overlap) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
      }
      continue;
    }

    if (currentWords + words.length > chunkSize && current.length) {
      chunks.push(current.join('\n\n'));
      const tailWords = current.join(' ').split(/\s+/).slice(-overlap);
      current = tailWords.length ? [tailWords.join(' ')] : [];
      currentWords = tailWords.length;
    }

    current.push(paragraph);
    currentWords += words.length;
  }

  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

export function readSelectedFiles(fileNames = DEFAULT_TEST_FILES) {
  return fileNames.map(fileName => {
    const filePath = path.join(CLEANED_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Тестовый файл не найден: ${filePath}`);
    }
    return {
      fileName,
      filePath,
      text: fs.readFileSync(filePath, 'utf-8'),
    };
  });
}

export function normalizeForDuplicateCheck(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inspectChunk(text) {
  const total = text.length || 1;
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const letters = cyrillic + latin || 1;
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const suspiciousRuns = (text.match(/[^\p{L}\p{N}\s.,;:!?()"«»\-—№%/]{4,}/gu) || [])
    .filter(run => !/^=+$/.test(run));
  const mojibakeHits = (text.match(/(?:Р[а-яА-ЯЁёA-Z]?|С[а-яА-ЯЁёA-Z]?|вЂ|В«|В»|В©|В®)/g) || []).length;
  const digitShare = (text.match(/\d/g) || []).length / total;
  const lineBreaks = (text.match(/\n/g) || []).length;
  const words = text.split(/\s+/).filter(Boolean);
  const pageMarkers = (text.match(/===== PAGE \d+ \/ \d+ =====/g) || []).length;

  return {
    words: words.length,
    chars: text.length,
    cyrillicLetterShare: cyrillic / letters,
    latinLetterShare: latin / letters,
    digitShare,
    replacement,
    mojibakeHits,
    pageMarkers,
    suspiciousRuns: suspiciousRuns.slice(0, 5),
    lineBreaks,
    hasEncodingIssue: replacement > 0 || mojibakeHits > 10 || cyrillic / letters < 0.35,
    hasOcrGarbage: suspiciousRuns.length > 0 || digitShare > 0.18 || pageMarkers > 4,
    isBadSize: words.length < 80 || words.length > 650,
  };
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function loadEmbeddings() {
  if (!fs.existsSync(EMBEDDINGS_PATH)) {
    throw new Error(`Нет тестового кэша: ${EMBEDDINGS_PATH}. Сначала запустите ingestion.`);
  }
  return fs.readFileSync(EMBEDDINGS_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function createOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Не задан OPENAI_API_KEY. Supabase для этого теста не используется.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function getEmbedding(openai, text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}
