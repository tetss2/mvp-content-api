import { promises as fs } from "fs";
import { createHash } from "crypto";
import { createRequire } from "module";
import { basename, dirname, extname, join, relative } from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = join(ROOT, "sources", "sexologist");
const SORTED_DIR = join(ROOT, "sorted_sources", "sexologist");
const INTAKE_DIR = join(ROOT, "knowledge_intake", "sexologist");
const STAGING_DIR = join(ROOT, "knowledge_indexes", "sexologist", "staging");
const INDEX_REPORTS_DIR = join(ROOT, "knowledge_indexes", "sexologist", "reports");
const REPORTS_DIR = join(ROOT, "reports");
const REPORT_PATH = join(REPORTS_DIR, "sexologist_extraction_report.json");

const SUPPORTED_EXTENSIONS = new Set([".docx", ".pdf"]);
const TEXTFUL_PDF_MIN_CHARS = 50;

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

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf-8"));
}

async function writeJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function normalizeText(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function outputNameFor(sourcePath) {
  const ext = extname(sourcePath);
  const name = basename(sourcePath, ext);
  return `${name}.cleaned.txt`;
}

async function listFiles(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function extractDocx(path) {
  const result = await mammoth.extractRawText({ path });
  return normalizeText(result.value || "");
}

async function extractPdf(path) {
  const buffer = await fs.readFile(path);
  const result = await pdfParse(buffer);
  return normalizeText(result.text || "");
}

function addKnownValue(map, key, value) {
  if (!value) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(String(value));
}

function addKnownPath(index, path, status) {
  if (!path) return;
  const file = basename(path);
  addKnownValue(index.byFilename, file, status);
  addKnownValue(index.byFilename, basename(file, extname(file)), status);
}

function ingestJsonValue(index, value, status) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => ingestJsonValue(index, item, status));
    return;
  }
  if (typeof value !== "object") return;

  for (const key of ["source_file", "original_name", "input_path", "local_path", "cleaned_file", "cleaned_path", "extracted_text_path"]) {
    addKnownPath(index, value[key], status);
  }
  for (const key of ["content_hash", "source_hash", "file_hash", "sha256", "normalized_hash", "text_hash"]) {
    addKnownValue(index.byHash, value[key], status);
  }
  if (value.filesize || value.file_size || value.size) {
    const name = value.source_file || value.original_name || value.input_path || value.local_path;
    if (name) addKnownValue(index.byFilenameSize, `${basename(name)}:${value.filesize || value.file_size || value.size}`, status);
  }

  Object.values(value).forEach((child) => ingestJsonValue(index, child, status));
}

async function buildKnownIndex() {
  const index = {
    byFilename: new Map(),
    byFilenameSize: new Map(),
    byHash: new Map(),
    existingCleaned: new Map(),
  };

  for (const path of await listFiles(SORTED_DIR)) {
    if (path.endsWith(".cleaned.txt")) {
      const text = await fs.readFile(path, "utf-8").catch(() => "");
      index.existingCleaned.set(basename(path), {
        path,
        text_hash: sha256Text(normalizeText(text)),
      });
      addKnownPath(index, path, "already_extracted");
      addKnownValue(index.byHash, sha256Text(normalizeText(text)), "already_extracted");
    }
  }

  for (const path of await listFiles(INTAKE_DIR)) {
    if (path.endsWith(".txt")) {
      addKnownPath(index, path, "already_extracted");
      const text = await fs.readFile(path, "utf-8").catch(() => "");
      addKnownValue(index.byHash, sha256Text(normalizeText(text)), "already_extracted");
    } else if (path.endsWith(".json")) {
      ingestJsonValue(index, await readJson(path).catch(() => null), "already_extracted");
    }
  }

  for (const path of [...await listFiles(STAGING_DIR), ...await listFiles(INDEX_REPORTS_DIR)]) {
    if (path.endsWith(".json")) {
      ingestJsonValue(index, await readJson(path).catch(() => null), "already_indexed");
    } else if (path.endsWith(".jsonl")) {
      const raw = await fs.readFile(path, "utf-8").catch(() => "");
      for (const line of raw.split(/\r?\n/).filter(Boolean)) {
        try {
          ingestJsonValue(index, JSON.parse(line), "already_indexed");
        } catch {
          // Ignore malformed legacy report rows.
        }
      }
    }
  }

  return index;
}

function firstKnownStatus(index, sourcePath, size, contentHash, textHash = null) {
  const file = basename(sourcePath);
  const stem = basename(sourcePath, extname(sourcePath));
  const filenameSize = `${file}:${size}`;

  if (index.byFilenameSize.has(filenameSize)) return [...index.byFilenameSize.get(filenameSize)][0];
  if (index.byHash.has(contentHash)) return [...index.byHash.get(contentHash)][0];
  if (textHash && index.byHash.has(textHash)) return [...index.byHash.get(textHash)][0];
  if (index.byFilename.has(file)) return [...index.byFilename.get(file)][0];
  if (index.byFilename.has(stem)) return [...index.byFilename.get(stem)][0];
  return null;
}

async function extractSource(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".docx") return { text: await extractDocx(path), status: "extracted" };
  if (ext === ".pdf") {
    const text = await extractPdf(path);
    if (text.trim().length < TEXTFUL_PDF_MIN_CHARS) return { text, status: "needs_ocr" };
    return { text, status: "extracted" };
  }
  return { text: "", status: "error", error: `Unsupported extension: ${ext}` };
}

async function processSources() {
  await fs.mkdir(SORTED_DIR, { recursive: true });
  const known = await buildKnownIndex();
  const sourceFiles = (await listFiles(SOURCE_DIR))
    .filter((path) => SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort((a, b) => repoRelative(a).localeCompare(repoRelative(b)));
  const seenHashes = new Map();
  const items = [];

  for (const sourcePath of sourceFiles) {
    const ext = extname(sourcePath).toLowerCase();
    const stat = await fs.stat(sourcePath);
    const sourceBuffer = await fs.readFile(sourcePath);
    const contentHash = sha256Buffer(sourceBuffer);
    const outputPath = join(SORTED_DIR, outputNameFor(sourcePath));
    const outputFile = repoRelative(outputPath);
    const baseItem = {
      source_file: repoRelative(sourcePath),
      output_file: outputFile,
      file_type: ext.slice(1),
      filesize: stat.size,
      content_hash: contentHash,
      text_hash: null,
      extracted_chars: 0,
      status: null,
      error: null,
    };

    if (seenHashes.has(contentHash)) {
      items.push({
        ...baseItem,
        status: "skipped_duplicate",
        error: `Duplicate of ${seenHashes.get(contentHash)}`,
      });
      continue;
    }
    seenHashes.set(contentHash, repoRelative(sourcePath));

    const knownStatus = firstKnownStatus(known, sourcePath, stat.size, contentHash);
    if (knownStatus === "already_indexed") {
      items.push({ ...baseItem, status: "already_indexed" });
      continue;
    }

    if (await exists(outputPath)) {
      const existingText = normalizeText(await fs.readFile(outputPath, "utf-8"));
      const existingHash = sha256Text(existingText);
      const extracted = await extractSource(sourcePath);
      const textHash = sha256Text(normalizeText(extracted.text));
      items.push({
        ...baseItem,
        text_hash: textHash,
        extracted_chars: normalizeText(extracted.text).length,
        status: existingHash === textHash ? "already_extracted" : "skipped_duplicate",
        error: existingHash === textHash ? null : "Output file already exists with different text hash; not overwritten.",
      });
      continue;
    }

    try {
      const extracted = await extractSource(sourcePath);
      const text = normalizeText(extracted.text);
      const textHash = sha256Text(text);
      const statusFromKnown = firstKnownStatus(known, sourcePath, stat.size, contentHash, textHash);

      if (statusFromKnown === "already_indexed" || statusFromKnown === "already_extracted") {
        items.push({
          ...baseItem,
          text_hash: textHash,
          extracted_chars: text.length,
          status: statusFromKnown,
        });
        continue;
      }

      if (extracted.status === "needs_ocr") {
        items.push({
          ...baseItem,
          text_hash: textHash,
          extracted_chars: text.length,
          status: "needs_ocr",
        });
        continue;
      }

      await fs.writeFile(outputPath, `${text}\n`, { encoding: "utf-8", flag: "wx" });
      items.push({
        ...baseItem,
        text_hash: textHash,
        extracted_chars: text.length,
        status: "extracted",
      });
    } catch (err) {
      items.push({
        ...baseItem,
        status: "error",
        error: err.message,
      });
    }
  }

  const summary = {
    total_source_files: items.length,
    extracted_new: items.filter((item) => item.status === "extracted").length,
    skipped_already_processed: items.filter((item) => ["already_extracted", "already_indexed", "skipped_duplicate"].includes(item.status)).length,
    needs_ocr: items.filter((item) => item.status === "needs_ocr").length,
    errors: items.filter((item) => item.status === "error").length,
  };

  const report = {
    type: "sexologist_extraction_report",
    generated_at: nowIso(),
    safety: {
      target_kb: "sexologist",
      wrote_only_sorted_sources: true,
      ingestion_started: false,
      staging_modified: false,
      production_modified: false,
      ocr_started: false,
    },
    scanned_paths: [
      repoRelative(SOURCE_DIR),
      repoRelative(SORTED_DIR),
      repoRelative(INTAKE_DIR),
      repoRelative(STAGING_DIR),
      repoRelative(INDEX_REPORTS_DIR),
    ],
    summary,
    items,
  };

  await writeJson(REPORT_PATH, report);
  return report;
}

processSources()
  .then((report) => {
    console.log("Sexologist extraction complete.");
    console.log(`Report: ${repoRelative(REPORT_PATH)}`);
    console.log(`Total source files: ${report.summary.total_source_files}`);
    console.log(`Extracted new: ${report.summary.extracted_new}`);
    console.log(`Skipped already processed: ${report.summary.skipped_already_processed}`);
    console.log(`Needs OCR: ${report.summary.needs_ocr}`);
    console.log(`Errors: ${report.summary.errors}`);
  })
  .catch((err) => {
    console.error(`Sexologist extraction failed: ${err.message}`);
    process.exit(1);
  });
