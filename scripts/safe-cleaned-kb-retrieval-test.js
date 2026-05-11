/**
 * Minimal retrieval test for the isolated OCR-cleaned KB embedding cache.
 *
 * Reads only kb/sexologist/test-ingestion/*.jsonl and performs local cosine
 * similarity. It does not call Supabase or the production match_chunks RPC.
 */

import {
  DEFAULT_QUESTIONS,
  EMBEDDINGS_PATH,
  cosineSimilarity,
  createOpenAIClient,
  getEmbedding,
  inspectChunk,
  loadEmbeddings,
} from './safe-cleaned-kb-test-lib.js';

const args = process.argv.slice(2);
const topKArg = args.find(arg => arg.startsWith('--top-k='));
const questionsArg = args.find(arg => arg.startsWith('--questions='));
const TOP_K = topKArg ? Number(topKArg.replace('--top-k=', '')) : 4;
const questions = questionsArg
  ? questionsArg.replace('--questions=', '').split('|').map(s => s.trim()).filter(Boolean)
  : DEFAULT_QUESTIONS;

function estimateQuality(results) {
  const top = results[0];
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const uniqueSources = new Set(results.map(r => r.source_file)).size;
  const flagged = results.filter(r =>
    r.diagnostics.hasEncodingIssue ||
    r.diagnostics.hasOcrGarbage ||
    r.diagnostics.isBadSize ||
    r.duplicate_of
  );

  let label = 'низкая';
  if (top?.score >= 0.42 && avgScore >= 0.32 && flagged.length === 0) label = 'хорошая';
  else if (top?.score >= 0.34 && flagged.length <= 1) label = 'средняя';

  return {
    label,
    topScore: top?.score || 0,
    avgScore,
    uniqueSources,
    flaggedCount: flagged.length,
  };
}

function compact(text, max = 650) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
}

async function main() {
  console.log('SAFE OCR-cleaned KB retrieval test');
  console.log('Supabase: disabled by design');
  console.log(`Cache: ${EMBEDDINGS_PATH}`);

  if (!Number.isInteger(TOP_K) || TOP_K < 1 || TOP_K > 10) {
    throw new Error('--top-k должен быть числом от 1 до 10.');
  }

  const chunks = loadEmbeddings();
  const openai = createOpenAIClient();
  console.log(`Chunks loaded: ${chunks.length}`);
  console.log(`Questions: ${questions.length}\n`);

  for (const question of questions) {
    const queryEmbedding = await getEmbedding(openai, question);
    const results = chunks
      .map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        diagnostics: chunk.diagnostics || inspectChunk(chunk.chunk_text),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    const quality = estimateQuality(results);

    console.log('='.repeat(80));
    console.log(`Вопрос: ${question}`);
    console.log(
      `Оценка: ${quality.label} | top=${quality.topScore.toFixed(3)} | avg=${quality.avgScore.toFixed(3)} | sources=${quality.uniqueSources} | flags=${quality.flaggedCount}`
    );

    results.forEach((result, index) => {
      const flags = [
        result.duplicate_of && `duplicate of ${result.duplicate_of}`,
        result.diagnostics.isBadSize && `bad chunk size: ${result.diagnostics.words} words`,
        result.diagnostics.hasOcrGarbage && 'OCR garbage suspect',
        result.diagnostics.hasEncodingIssue && 'encoding suspect',
      ].filter(Boolean);

      console.log(`\n#${index + 1} score=${result.score.toFixed(3)} ${result.source_file} chunk=${result.chunk_index}`);
      if (flags.length) console.log(`FLAGS: ${flags.join('; ')}`);
      console.log(compact(result.chunk_text));
    });

    console.log('');
  }
}

main().catch(err => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
