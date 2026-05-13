import { promises as fs } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INPUT_DIR = join(ROOT, "knowledge_intake", "sexologist", "review");
const INTAKE_ROOT = join(ROOT, "knowledge_intake", "sexologist");
const REPORT_PATH = join(ROOT, "reports", "sexologist_reclassification_report.json");

const OUTPUT_CATEGORIES = [
  "approved_high_confidence",
  "approved_medium_confidence",
  "questionnaires",
  "ocr_suspect",
  "manual_review_rare",
];
const OUTPUT_DIRS = Object.fromEntries(OUTPUT_CATEGORIES.map((category) => [category, join(INTAKE_ROOT, category)]));

const QUESTIONNAIRE_FILENAME_TERMS = [
  "опросник", "анкета", "шкала", "индекс", "тест", "сфж", "сфм", "миэф", "ижсф", "soi",
  "questionnaire", "scale", "inventory", "index", "test",
];

const QUESTIONNAIRE_TERMS = [
  "опросник", "анкета", "шкала", "индекс", "ключ", "балл", "баллы", "подсчет", "подсчёт",
  "варианты ответов", "обведите", "выберите вариант", "оцените по шкале",
  "sexual formula", "questionnaire", "inventory", "score", "scoring", "items",
];

const LIKERT_TERMS = [
  "никогда", "почти никогда", "иногда", "часто", "почти всегда", "всегда",
  "полностью согласен", "согласен", "не согласен", "затрудняюсь ответить",
];

const PROSE_TERMS = [
  "сексуальность", "сексуальный", "отношения", "партнер", "партнёр", "терапия", "психотерапия",
  "клинический", "симптом", "пациент", "женщина", "мужчина", "оргазм", "возбуждение",
  "желание", "влечение", "дисфункция", "тревога", "стыд", "травма", "близость",
  "телесный", "эмоциональный", "переживание", "конфликт", "развитие", "идентичность",
  "sexuality", "therapy", "clinical", "relationship", "desire", "arousal", "orgasm",
];

function repoRelative(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

async function listTxtFiles(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => join(dir, entry.name))
    .sort((a, b) => repoRelative(a).localeCompare(repoRelative(b)));
}

async function listFilesRecursive(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursive(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countRegex(text, regex) {
  return (text.match(regex) || []).length;
}

function countTermHits(text, terms) {
  return terms.filter((term) => text.includes(term)).length;
}

function splitSentences(text) {
  return text
    .split(/[.!?…]+(?:\s+|$)/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
}

function textMetrics(text, fileName) {
  const normalized = normalizeText(text);
  const lowerName = fileName.toLowerCase();
  const lower = normalized.toLowerCase();
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const sentences = splitSentences(text);
  const words = normalized.match(/[A-Za-zА-Яа-яЁё]{3,}/g) || [];
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const chars = text.length;
  const letters = countRegex(text, /[A-Za-zА-Яа-яЁё]/g);
  const punctuation = countRegex(text, /[.,;:!?…-]/g);
  const symbols = countRegex(text, /[^A-Za-zА-Яа-яЁё0-9\s.,;:!?…()\[\]"'«»—-]/g);
  const shortLines = nonEmptyLines.filter((line) => line.length <= 4).length;
  const fragmentedLines = nonEmptyLines.filter((line) => line.length > 0 && line.length < 24).length;
  const isolatedChars = nonEmptyLines.filter((line) => /^[A-Za-zА-Яа-яЁё]$/.test(line)).length;
  const repeatedSpaces = countRegex(text, / {4,}/g);
  const garbled = countRegex(text, /[�□■●]{1,}|[РС][А-Яа-яA-Za-z]{1,3}/g);
  const numberedShortItems = nonEmptyLines.filter((line) => /^\s*(?:\d{1,3}|[1-5])[\].)]\s+.{1,140}$/.test(line)).length;
  const answerMatrixLines = nonEmptyLines.filter((line) => /(?:\b1\b.*\b2\b.*\b3\b.*\b4\b)|(?:никогда.*часто)|(?:согласен.*не согласен)/i.test(line)).length;
  const headingLines = nonEmptyLines.filter((line) => {
    if (line.length < 4 || line.length > 100) return false;
    if (/[.!?]$/.test(line)) return false;
    return /^(глава|раздел|часть|тема|лекция|\d+(?:\.\d+)*\s+)/i.test(line)
      || /^[A-ZА-ЯЁ][^.!?]{3,80}$/.test(line);
  }).length;

  const avgSentenceLength = words.length / Math.max(sentences.length, 1);
  const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / Math.max(paragraphs.length, 1);
  const longParagraphs = paragraphs.filter((p) => p.length >= 350).length;
  const letterRatio = letters / Math.max(chars, 1);
  const punctuationRatio = punctuation / Math.max(chars, 1);
  const symbolRatio = symbols / Math.max(chars, 1);
  const semanticVariety = uniqueWords.size / Math.max(words.length, 1);
  const numberedItemDensity = numberedShortItems / Math.max(nonEmptyLines.length, 1);
  const answerOptionDensity = (answerMatrixLines + countTermHits(lower, LIKERT_TERMS)) / Math.max(nonEmptyLines.length / 50, 1);
  const questionnaireFilenameHits = QUESTIONNAIRE_FILENAME_TERMS.filter((term) => lowerName.includes(term));
  const questionnaireTermHits = countTermHits(lower.slice(0, 180_000), QUESTIONNAIRE_TERMS);
  const likertHits = countTermHits(lower.slice(0, 180_000), LIKERT_TERMS);
  const terminologyHits = countTermHits(lower.slice(0, 220_000), PROSE_TERMS);

  return {
    chars,
    line_count: lines.length,
    paragraph_count: paragraphs.length,
    sentence_count: sentences.length,
    word_count: words.length,
    unique_word_count: uniqueWords.size,
    avg_sentence_length: Number(avgSentenceLength.toFixed(2)),
    avg_paragraph_length: Number(avgParagraphLength.toFixed(2)),
    long_paragraphs: longParagraphs,
    heading_lines: headingLines,
    letter_ratio: Number(letterRatio.toFixed(4)),
    punctuation_ratio: Number(punctuationRatio.toFixed(4)),
    symbol_ratio: Number(symbolRatio.toFixed(4)),
    semantic_variety: Number(semanticVariety.toFixed(4)),
    short_lines: shortLines,
    fragmented_lines: fragmentedLines,
    isolated_chars: isolatedChars,
    repeated_spaces: repeatedSpaces,
    garbled_fragments: garbled,
    numbered_short_items: numberedShortItems,
    answer_matrix_lines: answerMatrixLines,
    numbered_item_density: Number(numberedItemDensity.toFixed(4)),
    answer_option_density: Number(answerOptionDensity.toFixed(2)),
    questionnaire_filename_hits: questionnaireFilenameHits,
    questionnaire_term_hits: questionnaireTermHits,
    likert_hits: likertHits,
    terminology_hits: terminologyHits,
  };
}

function scoreProse(metrics) {
  const reasons = [];
  let score = 0;

  if (metrics.chars >= 80_000) {
    score += 20;
    reasons.push("substantial long-form text");
  } else if (metrics.chars >= 25_000) {
    score += 15;
    reasons.push("substantial medium-form text");
  } else if (metrics.chars >= 8_000) {
    score += 9;
    reasons.push("sufficient text length");
  }

  if (metrics.long_paragraphs >= 12) {
    score += 16;
    reasons.push(`many long paragraphs: ${metrics.long_paragraphs}`);
  } else if (metrics.long_paragraphs >= 4) {
    score += 9;
    reasons.push(`some long paragraphs: ${metrics.long_paragraphs}`);
  }

  if (metrics.sentence_count >= 250 && metrics.avg_sentence_length >= 7 && metrics.avg_sentence_length <= 32) {
    score += 14;
    reasons.push("coherent sentence flow");
  } else if (metrics.sentence_count >= 80) {
    score += 8;
    reasons.push("moderate sentence flow");
  }

  if (metrics.heading_lines >= 8) {
    score += 8;
    reasons.push(`chapter/heading structure: ${metrics.heading_lines}`);
  } else if (metrics.heading_lines >= 3) {
    score += 4;
    reasons.push(`some headings: ${metrics.heading_lines}`);
  }

  if (metrics.terminology_hits >= 12) {
    score += 10;
    reasons.push(`sexology/psychology terminology density: ${metrics.terminology_hits}`);
  } else if (metrics.terminology_hits >= 5) {
    score += 5;
    reasons.push(`some terminology density: ${metrics.terminology_hits}`);
  }

  if (metrics.punctuation_ratio >= 0.018 && metrics.punctuation_ratio <= 0.095) {
    score += 7;
    reasons.push("normal punctuation ratio");
  }

  if (metrics.semantic_variety >= 0.16 && metrics.word_count >= 2_000) {
    score += 7;
    reasons.push("sufficient semantic variety");
  }

  if (metrics.numbered_item_density < 0.18 && metrics.answer_option_density < 8) {
    score += 8;
    reasons.push("low answer-option density");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreQuestionnaire(metrics) {
  const reasons = [];
  let score = 0;

  if (metrics.questionnaire_filename_hits.length) {
    score += 28;
    reasons.push(`questionnaire filename terms: ${metrics.questionnaire_filename_hits.join(", ")}`);
  }
  if (metrics.questionnaire_term_hits >= 7) {
    score += 18;
    reasons.push(`many questionnaire/scoring terms: ${metrics.questionnaire_term_hits}`);
  } else if (metrics.questionnaire_term_hits >= 3) {
    score += 9;
    reasons.push(`some questionnaire/scoring terms: ${metrics.questionnaire_term_hits}`);
  }
  if (metrics.likert_hits >= 4) {
    score += 18;
    reasons.push(`repeated Likert options: ${metrics.likert_hits}`);
  } else if (metrics.likert_hits >= 2) {
    score += 8;
    reasons.push(`some Likert options: ${metrics.likert_hits}`);
  }
  if (metrics.numbered_short_items >= 120 || metrics.numbered_item_density >= 0.28) {
    score += 24;
    reasons.push(`many numbered short items: ${metrics.numbered_short_items}`);
  } else if (metrics.numbered_short_items >= 35 || metrics.numbered_item_density >= 0.16) {
    score += 12;
    reasons.push(`numbered short items: ${metrics.numbered_short_items}`);
  }
  if (metrics.answer_matrix_lines >= 12) {
    score += 12;
    reasons.push(`answer matrix lines: ${metrics.answer_matrix_lines}`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreOcr(metrics) {
  const reasons = [];
  let score = 0;

  if (metrics.chars < 1_500) {
    score += 20;
    reasons.push("very short usable text");
  }
  if (metrics.letter_ratio < 0.45) {
    score += 20;
    reasons.push(`low letter ratio: ${metrics.letter_ratio}`);
  }
  if (metrics.symbol_ratio > 0.035) {
    score += 14;
    reasons.push(`high symbol ratio: ${metrics.symbol_ratio}`);
  }
  if (metrics.fragmented_lines > 150 && metrics.fragmented_lines / Math.max(metrics.line_count, 1) > 0.35) {
    score += 18;
    reasons.push(`excessive fragmented lines: ${metrics.fragmented_lines}`);
  } else if (metrics.fragmented_lines > 80 && metrics.fragmented_lines / Math.max(metrics.line_count, 1) > 0.25) {
    score += 10;
    reasons.push(`fragmented lines: ${metrics.fragmented_lines}`);
  }
  if (metrics.isolated_chars > 35) {
    score += 12;
    reasons.push(`isolated characters: ${metrics.isolated_chars}`);
  }
  if (metrics.garbled_fragments > 20) {
    score += 18;
    reasons.push(`garbled fragments: ${metrics.garbled_fragments}`);
  }
  if (metrics.repeated_spaces > 80) {
    score += 8;
    reasons.push(`many repeated spaces: ${metrics.repeated_spaces}`);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function decideCategory(metrics) {
  const prose = scoreProse(metrics);
  const questionnaire = scoreQuestionnaire(metrics);
  const ocr = scoreOcr(metrics);
  const reasons = [];

  if (ocr.score >= 55 && prose.score < 55) {
    return {
      category: "ocr_suspect",
      confidence: "high",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["OCR/noise signals dominate", ...ocr.reasons],
    };
  }

  if (metrics.questionnaire_filename_hits.length && questionnaire.score >= 40) {
    return {
      category: "questionnaires",
      confidence: "high",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["strong questionnaire filename signal", ...questionnaire.reasons],
    };
  }

  if (questionnaire.score >= 70 && prose.score < 88) {
    return {
      category: "questionnaires",
      confidence: "high",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["questionnaire signals dominate", ...questionnaire.reasons],
    };
  }

  if (questionnaire.score >= 58 && prose.score >= 82) {
    return {
      category: "manual_review_rare",
      confidence: "low",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["strong prose and strong questionnaire signals both present", ...prose.reasons, ...questionnaire.reasons],
    };
  }

  if (questionnaire.score >= 58) {
    return {
      category: "questionnaires",
      confidence: "medium",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["questionnaire signals remain dominant", ...questionnaire.reasons],
    };
  }

  if (prose.score >= 72 && questionnaire.score < 52 && ocr.score < 45) {
    reasons.push("high-confidence prose approval", ...prose.reasons);
    if (questionnaire.score > 0) reasons.push(...questionnaire.reasons.slice(0, 2));
    return {
      category: "approved_high_confidence",
      confidence: "high",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons,
    };
  }

  if (prose.score >= 52 && questionnaire.score < 45 && ocr.score < 50) {
    reasons.push("medium-confidence prose approval", ...prose.reasons);
    if (questionnaire.score > 0) reasons.push(...questionnaire.reasons.slice(0, 2));
    if (ocr.score > 0) reasons.push(...ocr.reasons.slice(0, 2));
    return {
      category: "approved_medium_confidence",
      confidence: "medium",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons,
    };
  }

  if (questionnaire.score >= 45 && questionnaire.score >= prose.score - 8) {
    return {
      category: "questionnaires",
      confidence: "medium",
      prose_score: prose.score,
      questionnaire_score: questionnaire.score,
      ocr_score: ocr.score,
      reasons: ["questionnaire signals remain material", ...questionnaire.reasons],
    };
  }

  return {
    category: "manual_review_rare",
    confidence: "low",
    prose_score: prose.score,
    questionnaire_score: questionnaire.score,
    ocr_score: ocr.score,
    reasons: ["remaining mixed or low-confidence signals", ...prose.reasons, ...questionnaire.reasons, ...ocr.reasons],
  };
}

async function buildExistingOutputIndex() {
  const byRawHash = new Map();
  const byNormalizedHash = new Map();
  for (const category of OUTPUT_CATEGORIES) {
    for (const path of await listFilesRecursive(OUTPUT_DIRS[category])) {
      if (!path.endsWith(".txt")) continue;
      const text = await fs.readFile(path, "utf-8").catch(() => null);
      if (text === null) continue;
      const rawHash = sha256(text);
      const normalizedHash = sha256(normalizeText(text));
      const record = { path, category, raw_hash: rawHash, normalized_hash: normalizedHash };
      byRawHash.set(rawHash, record);
      byNormalizedHash.set(normalizedHash, record);
    }
  }
  return { byRawHash, byNormalizedHash };
}

async function outputPathFor(category, inputPath, rawHash) {
  const preferred = join(OUTPUT_DIRS[category], basename(inputPath));
  if (!(await exists(preferred))) return preferred;
  const existing = await fs.readFile(preferred, "utf-8").catch(() => null);
  if (existing !== null && sha256(existing) === rawHash) return preferred;
  return join(OUTPUT_DIRS[category], `${basename(inputPath, ".txt")}.${rawHash.slice(0, 10)}.txt`);
}

async function copyIfNeeded(sourcePath, outputPath, rawHash) {
  if (await exists(outputPath)) {
    const existing = await fs.readFile(outputPath, "utf-8").catch(() => null);
    if (existing !== null && sha256(existing) === rawHash) return "skipped";
    throw new Error(`Output exists with different hash: ${repoRelative(outputPath)}`);
  }
  await fs.mkdir(dirname(outputPath), { recursive: true });
  await fs.copyFile(sourcePath, outputPath);
  return "copied";
}

async function main() {
  for (const dir of Object.values(OUTPUT_DIRS)) await fs.mkdir(dir, { recursive: true });

  const files = await listTxtFiles(INPUT_DIR);
  const existing = await buildExistingOutputIndex();
  const seenRaw = new Map();
  const seenNormalized = new Map();
  const items = [];

  for (const sourcePath of files) {
    const base = {
      source_path: repoRelative(sourcePath),
      output_path: null,
      category: null,
      confidence: null,
      raw_hash: null,
      normalized_hash: null,
      size_chars: 0,
      prose_score: 0,
      questionnaire_score: 0,
      ocr_score: 0,
      duplicate_status: "unique",
      reasons: [],
      action: null,
      error: null,
      metrics: null,
    };

    try {
      const text = await fs.readFile(sourcePath, "utf-8");
      const rawHash = sha256(text);
      const normalizedHash = sha256(normalizeText(text));
      const metrics = textMetrics(text, basename(sourcePath));
      const duplicateOf = seenRaw.get(rawHash) || seenNormalized.get(normalizedHash) || null;
      const existingRecord = existing.byRawHash.get(rawHash) || existing.byNormalizedHash.get(normalizedHash);
      const decision = decideCategory(metrics);
      let category = decision.category;
      let duplicateStatus = "unique";

      if (duplicateOf) {
        category = "manual_review_rare";
        duplicateStatus = `duplicate_of:${duplicateOf}`;
        decision.reasons.unshift(`duplicate of ${duplicateOf}`);
      } else if (existingRecord) {
        duplicateStatus = existingRecord.category === category
          ? "existing_output"
          : `existing_output_elsewhere:${existingRecord.category}`;
      }

      const outputPath = await outputPathFor(category, sourcePath, rawHash);
      const action = existingRecord?.category === category
        ? "skipped"
        : await copyIfNeeded(sourcePath, outputPath, rawHash);

      seenRaw.set(rawHash, repoRelative(sourcePath));
      seenNormalized.set(normalizedHash, repoRelative(sourcePath));

      items.push({
        ...base,
        output_path: repoRelative(outputPath),
        category,
        confidence: decision.confidence,
        raw_hash: rawHash,
        normalized_hash: normalizedHash,
        size_chars: text.length,
        prose_score: decision.prose_score,
        questionnaire_score: decision.questionnaire_score,
        ocr_score: decision.ocr_score,
        duplicate_status: duplicateStatus,
        reasons: decision.reasons,
        action,
        metrics,
      });
    } catch (err) {
      items.push({
        ...base,
        category: "manual_review_rare",
        confidence: "low",
        action: "manual_review",
        error: err.message,
      });
    }
  }

  const summary = {
    total_review_files: items.length,
    approved_high_confidence_count: items.filter((item) => item.category === "approved_high_confidence").length,
    approved_medium_confidence_count: items.filter((item) => item.category === "approved_medium_confidence").length,
    questionnaires_count: items.filter((item) => item.category === "questionnaires").length,
    ocr_suspect_count: items.filter((item) => item.category === "ocr_suspect").length,
    manual_review_rare_count: items.filter((item) => item.category === "manual_review_rare").length,
    promoted_count: items.filter((item) => item.category === "approved_high_confidence" || item.category === "approved_medium_confidence").length,
    skipped_existing_count: items.filter((item) => item.action === "skipped").length,
    errors_count: items.filter((item) => item.error).length,
  };

  const report = {
    type: "sexologist_reclassification_report",
    generated_at: new Date().toISOString(),
    safety: {
      target_kb: "sexologist",
      input_bucket: repoRelative(INPUT_DIR),
      copy_only: true,
      source_files_deleted: false,
      psychologist_touched: false,
      knowledge_indexes_touched: false,
      production_touched: false,
      ingestion_started: false,
      staging_started: false,
      promote_started: false,
    },
    output_dirs: Object.fromEntries(Object.entries(OUTPUT_DIRS).map(([key, value]) => [key, repoRelative(value)])),
    summary,
    items,
  };

  await writeJson(REPORT_PATH, report);

  console.log("Sexologist review reclassification complete.");
  console.log(`Report: ${repoRelative(REPORT_PATH)}`);
  console.log(`Total review files: ${summary.total_review_files}`);
  console.log(`Approved high confidence: ${summary.approved_high_confidence_count}`);
  console.log(`Approved medium confidence: ${summary.approved_medium_confidence_count}`);
  console.log(`Questionnaires: ${summary.questionnaires_count}`);
  console.log(`OCR suspect: ${summary.ocr_suspect_count}`);
  console.log(`Manual review rare: ${summary.manual_review_rare_count}`);
  console.log(`Promoted: ${summary.promoted_count}`);
  console.log(`Skipped existing: ${summary.skipped_existing_count}`);
  console.log(`Errors: ${summary.errors_count}`);
}

main().catch((err) => {
  console.error(`Sexologist review reclassification failed: ${err.message}`);
  process.exit(1);
});
