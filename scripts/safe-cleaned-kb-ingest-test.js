/**
 * SAFE mini ingestion test for OCR-cleaned sexologist KB.
 *
 * This script intentionally does not use Supabase and cannot touch production
 * knowledge_chunks / match_chunks. It embeds only the local allowlisted txt
 * files and writes an isolated JSONL cache under kb/sexologist/test-ingestion.
 */

import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TEST_FILES,
  EMBEDDINGS_PATH,
  MANIFEST_PATH,
  TEST_DIR,
  createOpenAIClient,
  getEmbedding,
  inspectChunk,
  normalizeForDuplicateCheck,
  readSelectedFiles,
  splitIntoChunks,
} from './safe-cleaned-kb-test-lib.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const filesArg = args.find(arg => arg.startsWith('--files='));
const selectedFiles = filesArg
  ? filesArg.replace('--files=', '').split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_TEST_FILES;

function ensureSafeTarget() {
  const normalized = path.normalize(EMBEDDINGS_PATH);
  if (!normalized.includes(path.normalize(path.join('kb', 'sexologist', 'test-ingestion')))) {
    throw new Error(`Небезопасный путь вывода: ${EMBEDDINGS_PATH}`);
  }
}

async function main() {
  ensureSafeTarget();

  console.log('SAFE OCR-cleaned KB mini ingestion');
  console.log('Supabase: disabled by design');
  console.log(`Mode: ${DRY_RUN ? 'dry-run, no embeddings written' : 'embed selected files into isolated JSONL'}`);
  console.log(`Files: ${selectedFiles.length}`);

  if (selectedFiles.length < 2 || selectedFiles.length > 3) {
    throw new Error('Для mini-test выберите только 2-3 txt файла.');
  }
  if (!selectedFiles.every(name => name.endsWith('.cleaned.txt'))) {
    throw new Error('Разрешены только OCR-cleaned .cleaned.txt файлы.');
  }

  const sources = readSelectedFiles(selectedFiles);
  const records = [];
  const duplicateMap = new Map();

  for (const source of sources) {
    const chunks = splitIntoChunks(source.text);
    console.log(`\n${source.fileName}`);
    console.log(`  Text chars: ${source.text.length}`);
    console.log(`  Chunks: ${chunks.length}`);

    chunks.forEach((chunk, index) => {
      const diagnostics = inspectChunk(chunk);
      const duplicateKey = normalizeForDuplicateCheck(chunk).slice(0, 1200);
      const duplicateOf = duplicateMap.get(duplicateKey) || null;
      if (!duplicateOf) duplicateMap.set(duplicateKey, `${source.fileName}#${index + 1}`);

      records.push({
        id: `${path.basename(source.fileName, '.txt')}::${index + 1}`,
        scenario: 'sexologist-test-cleaned',
        source_title: path.basename(source.fileName, '.cleaned.txt'),
        source_file: source.fileName,
        chunk_index: index + 1,
        chunk_text: chunk,
        diagnostics,
        duplicate_of: duplicateOf,
      });
    });
  }

  const flagged = records.filter(r =>
    r.diagnostics.hasEncodingIssue ||
    r.diagnostics.hasOcrGarbage ||
    r.diagnostics.isBadSize ||
    r.duplicate_of
  );

  console.log(`\nTotal chunks: ${records.length}`);
  console.log(`Flagged chunks: ${flagged.length}`);
  console.log(`Duplicates: ${records.filter(r => r.duplicate_of).length}`);
  console.log(`Bad sizes: ${records.filter(r => r.diagnostics.isBadSize).length}`);
  console.log(`OCR garbage suspects: ${records.filter(r => r.diagnostics.hasOcrGarbage).length}`);
  console.log(`Encoding suspects: ${records.filter(r => r.diagnostics.hasEncodingIssue).length}`);

  if (flagged.length) {
    console.log('\nSample flags:');
    for (const item of flagged.slice(0, 8)) {
      const reasons = [
        item.duplicate_of && `duplicate of ${item.duplicate_of}`,
        item.diagnostics.isBadSize && `bad size ${item.diagnostics.words} words`,
        item.diagnostics.hasOcrGarbage && 'OCR garbage suspect',
        item.diagnostics.hasEncodingIssue && 'encoding suspect',
      ].filter(Boolean).join('; ');
      console.log(`  - ${item.source_file} #${item.chunk_index}: ${reasons}`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry-run finished. No embeddings were generated or written.');
    return;
  }

  const openai = createOpenAIClient();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(EMBEDDINGS_PATH, '', 'utf-8');

  let embedded = 0;
  for (const record of records) {
    const embedding = await getEmbedding(openai, record.chunk_text);
    fs.appendFileSync(EMBEDDINGS_PATH, `${JSON.stringify({ ...record, embedding })}\n`, 'utf-8');
    embedded++;
    process.stdout.write(`\rEmbedded: ${embedded}/${records.length}`);
  }
  console.log('');

  const manifest = {
    created_at: new Date().toISOString(),
    production_safe: true,
    supabase_used: false,
    production_tables_touched: false,
    embedding_model: 'text-embedding-3-small',
    scenario: 'sexologist-test-cleaned',
    source_dir: 'kb/sexologist/cleaned',
    selected_files: selectedFiles,
    output: path.relative(process.cwd(), EMBEDDINGS_PATH),
    chunks: records.length,
    flagged_chunks: flagged.length,
    diagnostics_summary: {
      duplicates: records.filter(r => r.duplicate_of).length,
      bad_sizes: records.filter(r => r.diagnostics.isBadSize).length,
      ocr_garbage_suspects: records.filter(r => r.diagnostics.hasOcrGarbage).length,
      encoding_suspects: records.filter(r => r.diagnostics.hasEncodingIssue).length,
    },
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest: ${path.relative(process.cwd(), MANIFEST_PATH)}`);
  console.log(`Embeddings: ${path.relative(process.cwd(), EMBEDDINGS_PATH)}`);
}

main().catch(err => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
