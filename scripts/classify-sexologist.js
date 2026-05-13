import { promises as fs } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INPUT_DIR = join(ROOT, "sorted_sources", "sexologist");
const INTAKE_ROOT = join(ROOT, "knowledge_intake", "sexologist");
const REPORT_PATH = join(ROOT, "reports", "sexologist_classification_report.json");

const CATEGORIES = ["approved", "questionnaires", "ocr_suspect", "duplicates", "review"];
const OUTPUT_DIRS = Object.fromEntries(CATEGORIES.map((category) => [category, join(INTAKE_ROOT, category)]));

const QUESTIONNAIRE_FILENAME_STRONG = [
  "опросник", "анкета", "шкала", "индекс", "тест", "сфж", "сфм", "миэф", "ижсф", "soi",
  "questionnaire", "scale", "inventory", "index", "test",
];

const QUESTIONNAIRE_CONTENT_TERMS = [
  "опросник", "анкета", "шкала", "индекс", "тест", "ключ", "балл", "баллы",
  "подсчет", "подсчёт", "инструкция", "варианты ответов", "сексуальная формула",
  "sexual formula", "scale", "questionnaire", "inventory", "index", "score", "scoring", "items",
];

const LIKERT_TERMS = [
  "никогда", "почти никогда", "иногда", "часто", "почти всегда",
  "полностью согласен", "полностью не согласен", "затрудняюсь ответить",
];

function nowIso() {
  return new Date().toISOString();
}

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

async function listCleanedFiles(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".cleaned.txt"))
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

function countMatches(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function countRegex(text, regex) {
  return (text.match(regex) || []).length;
}

function questionnaireSignals(fileName, text, lines) {
  const lowerName = fileName.toLowerCase();
  const lowerText = text.toLowerCase();
  const sample = lowerText.slice(0, 120_000);
  const reasons = [];
  let score = 0;

  const filenameHits = QUESTIONNAIRE_FILENAME_STRONG.filter((term) => lowerName.includes(term));
  if (filenameHits.length) {
    score += 7 + filenameHits.length * 2;
    reasons.push(`filename questionnaire indicators: ${filenameHits.slice(0, 5).join(", ")}`);
  }

  const contentHits = countMatches(sample, QUESTIONNAIRE_CONTENT_TERMS);
  if (contentHits) {
    score += Math.min(8, contentHits * 1.5);
    reasons.push(`questionnaire/test terms: ${contentHits}`);
  }

  const likertHits = countMatches(sample, LIKERT_TERMS);
  if (likertHits >= 3) {
    score += 6;
    reasons.push(`Likert-style answer options: ${likertHits}`);
  } else if (likertHits > 0) {
    score += likertHits;
  }

  const numberedAnswerVariants = countRegex(sample, /(?:^|\s|\[|\()([1-5])(?:\]|\)|\.|,| )/gm);
  if (numberedAnswerVariants >= 80) {
    score += 8;
    reasons.push(`many numbered answer variants: ${numberedAnswerVariants}`);
  } else if (numberedAnswerVariants >= 25) {
    score += 4;
    reasons.push(`numbered answer variants: ${numberedAnswerVariants}`);
  }

  const questionLikeLines = lines.filter((line) => /[?？]$/.test(line.trim()) || /^\s*\d+[.)]\s+/.test(line)).length;
  if (questionLikeLines >= 40) {
    score += 5;
    reasons.push(`many numbered/question lines: ${questionLikeLines}`);
  } else if (questionLikeLines >= 12) {
    score += 2;
    reasons.push(`some numbered/question lines: ${questionLikeLines}`);
  }

  return { score: Number(score.toFixed(2)), reasons };
}

function ocrNoiseSignals(text, lines) {
  const reasons = [];
  const chars = text.length;
  if (!chars) return { score: 20, reasons: ["empty text"] };

  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const shortLines = nonEmptyLines.filter((line) => line.length <= 3).length;
  const isolatedChars = nonEmptyLines.filter((line) => /^[A-Za-zА-Яа-яЁё]$/.test(line)).length;
  const repeatedSpaces = countRegex(text, / {4,}/g);
  const garbled = countRegex(text, /[�□■●]{1,}|[РС][А-Яа-яA-Za-z]{1,3}/g);
  const letters = countRegex(text, /[A-Za-zА-Яа-яЁё]/g);
  const nonLetters = countRegex(text, /[^A-Za-zА-Яа-яЁё\s]/g);
  const usefulRatio = letters / Math.max(chars, 1);
  const nonLetterRatio = nonLetters / Math.max(chars, 1);
  const avgLineLen = nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / Math.max(nonEmptyLines.length, 1);
  const brokenLineRatio = shortLines / Math.max(nonEmptyLines.length, 1);
  let score = 0;

  if (chars < 500) {
    score += 7;
    reasons.push(`very short useful text: ${chars} chars`);
  } else if (chars < 1500) {
    score += 3;
    reasons.push(`short useful text: ${chars} chars`);
  }

  if (brokenLineRatio > 0.35 && shortLines > 50) {
    score += 7;
    reasons.push(`many very short broken lines: ${shortLines}/${nonEmptyLines.length}`);
  } else if (brokenLineRatio > 0.2 && shortLines > 20) {
    score += 4;
    reasons.push(`short-line fragmentation: ${shortLines}/${nonEmptyLines.length}`);
  }

  if (isolatedChars > 25) {
    score += 5;
    reasons.push(`many isolated characters: ${isolatedChars}`);
  }

  if (repeatedSpaces > 40) {
    score += 4;
    reasons.push(`many repeated spaces: ${repeatedSpaces}`);
  }

  if (nonLetterRatio > 0.45 && chars > 1000) {
    score += 6;
    reasons.push(`high non-letter ratio: ${nonLetterRatio.toFixed(2)}`);
  } else if (nonLetterRatio > 0.32) {
    score += 3;
    reasons.push(`elevated non-letter ratio: ${nonLetterRatio.toFixed(2)}`);
  }

  if (usefulRatio < 0.35) {
    score += 6;
    reasons.push(`low letter ratio: ${usefulRatio.toFixed(2)}`);
  }

  if (avgLineLen < 18 && nonEmptyLines.length > 80) {
    score += 4;
    reasons.push(`abnormal line fragmentation avg=${avgLineLen.toFixed(1)}`);
  }

  if (garbled > 20) {
    score += 5;
    reasons.push(`garbled fragments: ${garbled}`);
  }

  return { score: Number(score.toFixed(2)), reasons };
}

function classify({ fileName, text, lines, isDuplicate }) {
  const questionnaire = questionnaireSignals(fileName, text, lines);
  const ocr = ocrNoiseSignals(text, lines);
  const reasons = [];

  if (isDuplicate) {
    return {
      category: "duplicates",
      questionnaire_score: questionnaire.score,
      ocr_noise_score: ocr.score,
      reasons: ["duplicate hash detected", ...questionnaire.reasons, ...ocr.reasons],
    };
  }

  reasons.push(...questionnaire.reasons, ...ocr.reasons);

  if (questionnaire.score >= 8 && ocr.score >= 8) {
    return {
      category: "review",
      questionnaire_score: questionnaire.score,
      ocr_noise_score: ocr.score,
      reasons: ["mixed questionnaire and OCR/noise signals", ...reasons],
    };
  }

  if (ocr.score >= 10) {
    return {
      category: "ocr_suspect",
      questionnaire_score: questionnaire.score,
      ocr_noise_score: ocr.score,
      reasons: ocr.reasons,
    };
  }

  if (questionnaire.score >= 8) {
    return {
      category: "questionnaires",
      questionnaire_score: questionnaire.score,
      ocr_noise_score: ocr.score,
      reasons: questionnaire.reasons,
    };
  }

  if (text.length >= 1500 && questionnaire.score < 6 && ocr.score < 7) {
    return {
      category: "approved",
      questionnaire_score: questionnaire.score,
      ocr_noise_score: ocr.score,
      reasons: reasons.length ? reasons : ["readable prose, sufficient length"],
    };
  }

  return {
    category: "review",
    questionnaire_score: questionnaire.score,
    ocr_noise_score: ocr.score,
    reasons: reasons.length ? ["low confidence or mixed weak signals", ...reasons] : ["low confidence"],
  };
}

async function buildExistingOutputIndex() {
  const byRawHash = new Map();
  const byNormalizedHash = new Map();
  const byPath = new Map();

  function setHashRecord(map, hash, record) {
    const existing = map.get(hash);
    if (!existing) {
      map.set(hash, record);
      return;
    }
    if (existing.category === "duplicates" && record.category !== "duplicates") {
      map.set(hash, record);
    }
  }

  for (const category of CATEGORIES) {
    for (const path of await listFilesRecursive(OUTPUT_DIRS[category])) {
      if (!path.endsWith(".txt")) continue;
      const text = await fs.readFile(path, "utf-8").catch(() => null);
      if (text === null) continue;
      const rawHash = sha256(text);
      const normalizedHash = sha256(normalizeText(text));
      const record = { path, category, raw_hash: rawHash, normalized_hash: normalizedHash };
      setHashRecord(byRawHash, rawHash, record);
      setHashRecord(byNormalizedHash, normalizedHash, record);
      byPath.set(path, record);
    }
  }

  return { byRawHash, byNormalizedHash, byPath };
}

async function outputPathFor(category, inputPath, rawHash) {
  const dir = OUTPUT_DIRS[category];
  const preferred = join(dir, basename(inputPath));
  if (!(await exists(preferred))) return preferred;

  const existing = await fs.readFile(preferred, "utf-8").catch(() => null);
  if (existing !== null && sha256(existing) === rawHash) return preferred;

  const name = basename(inputPath, ".cleaned.txt");
  return join(dir, `${name}.${rawHash.slice(0, 10)}.cleaned.txt`);
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

  const files = await listCleanedFiles(INPUT_DIR);
  const existing = await buildExistingOutputIndex();
  const seenRaw = new Map();
  const seenNormalized = new Map();
  const items = [];

  for (const sourcePath of files) {
    const itemBase = {
      source_path: repoRelative(sourcePath),
      output_path: null,
      category: null,
      raw_hash: null,
      normalized_hash: null,
      size_chars: 0,
      line_count: 0,
      questionnaire_score: 0,
      ocr_noise_score: 0,
      duplicate_status: "unique",
      reasons: [],
      action: null,
      error: null,
    };

    try {
      const text = await fs.readFile(sourcePath, "utf-8");
      const normalized = normalizeText(text);
      const rawHash = sha256(text);
      const normalizedHash = sha256(normalized);
      const lines = text.split(/\r?\n/);
      const existingRecord = existing.byRawHash.get(rawHash) || existing.byNormalizedHash.get(normalizedHash);
      const duplicateOf = seenRaw.get(rawHash) || seenNormalized.get(normalizedHash) || null;
      const isDuplicate = Boolean(duplicateOf);

      const classification = classify({
        fileName: basename(sourcePath),
        text,
        lines,
        isDuplicate,
      });

      let category = classification.category;
      let duplicateStatus = "unique";

      if (isDuplicate) {
        category = "duplicates";
        duplicateStatus = `duplicate_of:${duplicateOf}`;
      } else if (existingRecord) {
        category = existingRecord.category;
        duplicateStatus = "existing_output";
      }

      const outputPath = await outputPathFor(category, sourcePath, rawHash);
      let action = "review";

      if (existingRecord) {
        action = "skipped";
      } else if (isDuplicate) {
        action = await copyIfNeeded(sourcePath, outputPath, rawHash) === "copied" ? "duplicate" : "skipped";
      } else {
        action = await copyIfNeeded(sourcePath, outputPath, rawHash);
      }

      seenRaw.set(rawHash, repoRelative(sourcePath));
      seenNormalized.set(normalizedHash, repoRelative(sourcePath));

      items.push({
        ...itemBase,
        output_path: repoRelative(outputPath),
        category,
        raw_hash: rawHash,
        normalized_hash: normalizedHash,
        size_chars: text.length,
        line_count: lines.length,
        questionnaire_score: classification.questionnaire_score,
        ocr_noise_score: classification.ocr_noise_score,
        duplicate_status: duplicateStatus,
        reasons: duplicateOf ? [`duplicate of ${duplicateOf}`, ...classification.reasons] : classification.reasons,
        action,
      });
    } catch (err) {
      items.push({
        ...itemBase,
        category: "review",
        action: "review",
        error: err.message,
      });
    }
  }

  const summary = {
    total_files: items.length,
    approved_count: items.filter((item) => item.category === "approved").length,
    questionnaires_count: items.filter((item) => item.category === "questionnaires").length,
    ocr_suspect_count: items.filter((item) => item.category === "ocr_suspect").length,
    duplicates_count: items.filter((item) => item.category === "duplicates").length,
    review_count: items.filter((item) => item.category === "review").length,
    skipped_existing_count: items.filter((item) => item.action === "skipped").length,
    errors_count: items.filter((item) => item.error).length,
  };

  const report = {
    type: "sexologist_classification_report",
    generated_at: new Date().toISOString(),
    safety: {
      target_kb: "sexologist",
      copied_files_only: true,
      source_files_deleted: false,
      psychologist_touched: false,
      knowledge_indexes_touched: false,
      production_touched: false,
      ingestion_started: false,
      staging_started: false,
      promote_started: false,
    },
    input_dir: repoRelative(INPUT_DIR),
    output_dirs: Object.fromEntries(Object.entries(OUTPUT_DIRS).map(([key, value]) => [key, repoRelative(value)])),
    summary,
    items,
  };

  await writeJson(REPORT_PATH, report);

  console.log("Sexologist classification complete.");
  console.log(`Report: ${repoRelative(REPORT_PATH)}`);
  console.log(`Total files: ${summary.total_files}`);
  console.log(`Approved: ${summary.approved_count}`);
  console.log(`Questionnaires: ${summary.questionnaires_count}`);
  console.log(`OCR suspect: ${summary.ocr_suspect_count}`);
  console.log(`Duplicates: ${summary.duplicates_count}`);
  console.log(`Review: ${summary.review_count}`);
  console.log(`Skipped existing: ${summary.skipped_existing_count}`);
  console.log(`Errors: ${summary.errors_count}`);
}

main().catch((err) => {
  console.error(`Sexologist classification failed: ${err.message}`);
  process.exit(1);
});
