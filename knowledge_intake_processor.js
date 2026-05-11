import { promises as fs } from "fs";
import { createRequire } from "module";
import { dirname, extname, isAbsolute, join, relative } from "path";
import { fileURLToPath } from "url";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const ROOT = dirname(fileURLToPath(import.meta.url));
const INTAKE_ROOT = join(ROOT, "knowledge_intake");
const SESSIONS_DIR = join(INTAKE_ROOT, "sessions");

const SUPPORTED_TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv"]);
const SUPPORTED_DOCX_EXTENSIONS = new Set([".docx"]);
const SUPPORTED_PDF_EXTENSIONS = new Set([".pdf"]);

function nowIso() {
  return new Date().toISOString();
}

function repoRelative(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function resolveLocalPath(localPath) {
  if (!localPath) return null;
  return isAbsolute(localPath) ? localPath : join(ROOT, localPath);
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf-8"));
}

async function writeJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function detectLanguage(text) {
  const sample = (text || "").slice(0, 20_000);
  const cyrillic = (sample.match(/[а-яё]/gi) || []).length;
  const latin = (sample.match(/[a-z]/gi) || []).length;
  if (cyrillic < 20 && latin < 20) return "unknown";
  if (cyrillic > latin * 2) return "ru";
  if (latin > cyrillic * 2) return "en";
  return "mixed";
}

function garbageSignals(text) {
  const signals = [];
  const normalized = text || "";
  const chars = normalized.length;
  if (chars === 0) {
    signals.push("empty_text");
    return signals;
  }
  const replacementChars = (normalized.match(/�/g) || []).length;
  const mojibake = (normalized.match(/[РС][А-Яа-яA-Za-z]{1,3}/g) || []).length;
  const whitespaceRatio = (normalized.match(/\s/g) || []).length / chars;
  const alphaRatio = (normalized.match(/[a-zа-яё]/gi) || []).length / chars;
  const longTokenCount = normalized.split(/\s+/).filter((token) => token.length > 45).length;
  if (replacementChars > 5) signals.push("replacement_characters");
  if (mojibake > 30) signals.push("possible_mojibake");
  if (whitespaceRatio > 0.45) signals.push("excessive_whitespace");
  if (alphaRatio < 0.35) signals.push("low_alpha_ratio");
  if (longTokenCount > 5) signals.push("many_overlong_tokens");
  if (chars < 300) signals.push("very_short_text");
  return signals;
}

function qualityScore(text, extractionStatus, signals) {
  if (["unsupported", "ocr_required", "url_pending"].includes(extractionStatus)) return 0;
  let score = 1.0;
  if ((text || "").length < 1_000) score -= 0.25;
  if ((text || "").length < 300) score -= 0.25;
  score -= signals.length * 0.12;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function recommendedAction(extractionStatus, score, duplicateRisk) {
  if (extractionStatus === "ocr_required") return "send_to_ocr";
  if (extractionStatus === "url_pending") return "fetch_url_or_manual_review";
  if (extractionStatus === "unsupported") return "reject_or_convert_manually";
  if (duplicateRisk === "high") return "review_duplicate_before_cleaning";
  if (score >= 0.65) return "ready_for_cleaning";
  return "needs_review";
}

function finalStatus(extractionStatus, score, duplicateRisk) {
  if (extractionStatus === "ocr_required") return "ocr_required";
  if (extractionStatus === "url_pending") return "url_pending";
  if (extractionStatus === "unsupported") return "unsupported";
  if (duplicateRisk === "high" || score < 0.65) return "needs_review";
  return "ready_for_cleaning";
}

function normalizeForHash(text) {
  return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function extractTextFromFile(path, ext) {
  if (SUPPORTED_TEXT_EXTENSIONS.has(ext)) {
    return await fs.readFile(path, "utf-8");
  }
  if (SUPPORTED_DOCX_EXTENSIONS.has(ext)) {
    const result = await mammoth.extractRawText({ path });
    return result.value || "";
  }
  if (SUPPORTED_PDF_EXTENSIONS.has(ext)) {
    const buffer = await fs.readFile(path);
    const result = await pdfParse(buffer);
    return result.text || "";
  }
  return null;
}

async function loadApprovedSessions(sessionId = null) {
  const files = await fs.readdir(SESSIONS_DIR).catch(() => []);
  const sessions = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const path = join(SESSIONS_DIR, file);
    const session = await readJson(path);
    if (sessionId && session.session_id !== sessionId) continue;
    if (session.status === "approved_for_processing") {
      sessions.push({ path, session });
    }
  }
  return sessions;
}

async function processItem(session, item, seenTextHashes) {
  const sourceType = item.type;
  const originalName = item.original_name || "";
  const path = resolveLocalPath(item.local_path);
  const ext = extname(originalName || item.local_path || "").toLowerCase();
  let extractedText = "";
  let extractionStatus = "unsupported";
  let error = null;

  item.status = "extracting";
  item.processing_started_at = nowIso();

  try {
    if (sourceType === "url") {
      extractionStatus = "url_pending";
      extractedText = "";
    } else if (sourceType === "text") {
      extractedText = path ? await fs.readFile(path, "utf-8") : "";
      extractionStatus = extractedText.trim() ? "extracted" : "needs_review";
    } else if (sourceType === "file") {
      if (!path) {
        extractionStatus = "unsupported";
        error = "missing_local_path";
      } else if (![...SUPPORTED_TEXT_EXTENSIONS, ...SUPPORTED_DOCX_EXTENSIONS, ...SUPPORTED_PDF_EXTENSIONS].includes(ext)) {
        extractionStatus = "unsupported";
      } else {
        extractedText = await extractTextFromFile(path, ext);
        if (SUPPORTED_PDF_EXTENSIONS.has(ext) && extractedText.trim().length < 500) {
          extractionStatus = "ocr_required";
        } else {
          extractionStatus = extractedText.trim() ? "extracted" : "needs_review";
        }
      }
    }
  } catch (err) {
    extractionStatus = "needs_review";
    error = err.message;
  }

  const signals = garbageSignals(extractedText);
  const score = qualityScore(extractedText, extractionStatus, signals);
  const textHash = normalizeForHash(extractedText);
  const duplicateRisk = textHash && seenTextHashes.has(textHash) ? "high" : "low";
  if (textHash) seenTextHashes.add(textHash);
  const itemStatus = finalStatus(extractionStatus, score, duplicateRisk);
  const action = recommendedAction(extractionStatus, score, duplicateRisk);

  let extractedTextPath = null;
  if (extractionStatus === "extracted" && extractedText.trim()) {
    const outDir = join(INTAKE_ROOT, session.target_kb, "extracted", session.session_id);
    await fs.mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `${item.item_id}.txt`);
    await fs.writeFile(outPath, extractedText, "utf-8");
    extractedTextPath = repoRelative(outPath);
  }

  item.status = itemStatus;
  item.quality_status = itemStatus === "ready_for_cleaning" ? "ready_for_cleaning" : "needs_review";
  item.extraction_status = extractionStatus;
  item.extracted_text_path = extractedTextPath;
  item.processing_finished_at = nowIso();
  if (error) item.processing_error = error;

  return {
    item_id: item.item_id,
    source_type: sourceType,
    extension: ext || null,
    extraction_status: extractionStatus,
    status: itemStatus,
    char_count: extractedText.length,
    estimated_tokens: estimateTokens(extractedText),
    detected_language: detectLanguage(extractedText),
    quality_score: score,
    garbage_signals: signals,
    duplicate_risk: duplicateRisk,
    recommended_action: action,
    original_name: originalName,
    local_path: item.local_path,
    extracted_text_path: extractedTextPath,
    error,
  };
}

function summarizeReports(itemReports) {
  const summary = {
    accepted_sources: itemReports.length,
    extracted: 0,
    ocr_required: 0,
    url_pending: 0,
    unsupported: 0,
    needs_review: 0,
    ready_for_cleaning: 0,
    rejected: 0,
  };
  for (const report of itemReports) {
    if (summary[report.extraction_status] !== undefined) summary[report.extraction_status] += 1;
    if (summary[report.status] !== undefined && report.status !== report.extraction_status) summary[report.status] += 1;
  }
  return summary;
}

function buildMarkdownReport(report) {
  const lines = [
    `# Knowledge Intake Processing Report`,
    ``,
    `Session: \`${report.session_id}\``,
    `Target KB: \`${report.target_kb}\``,
    `Status: \`${report.session_status}\``,
    `Processed at: ${report.processed_at}`,
    ``,
    `## Summary`,
    ``,
    `- Accepted sources: ${report.summary.accepted_sources}`,
    `- Extracted: ${report.summary.extracted}`,
    `- OCR required: ${report.summary.ocr_required}`,
    `- URL pending: ${report.summary.url_pending}`,
    `- Unsupported: ${report.summary.unsupported}`,
    `- Needs review: ${report.summary.needs_review}`,
    `- Ready for cleaning: ${report.summary.ready_for_cleaning}`,
    `- Rejected: ${report.summary.rejected}`,
    ``,
    `## Items`,
    ``,
  ];
  for (const item of report.items) {
    lines.push(
      `### ${item.item_id}`,
      ``,
      `- Type: ${item.source_type}`,
      `- Original name: ${item.original_name || ""}`,
      `- Status: ${item.status}`,
      `- Extraction status: ${item.extraction_status}`,
      `- Characters: ${item.char_count}`,
      `- Estimated tokens: ${item.estimated_tokens}`,
      `- Detected language: ${item.detected_language}`,
      `- Quality score: ${item.quality_score}`,
      `- Garbage signals: ${item.garbage_signals.length ? item.garbage_signals.join(", ") : "none"}`,
      `- Duplicate risk: ${item.duplicate_risk}`,
      `- Recommended action: ${item.recommended_action}`,
      ``
    );
  }
  return lines.join("\n");
}

async function processSession(sessionPath, session) {
  const seenTextHashes = new Set();
  const itemReports = [];
  for (const item of session.items || []) {
    itemReports.push(await processItem(session, item, seenTextHashes));
  }

  session.status = "processed_needs_review";
  session.processed_at = nowIso();
  session.updated_at = session.processed_at;

  const summary = summarizeReports(itemReports);
  const report = {
    session_id: session.session_id,
    user_id: session.user_id,
    target_kb: session.target_kb,
    session_status: session.status,
    processed_at: session.processed_at,
    summary,
    items: itemReports,
    safety: {
      embeddings_started: false,
      faiss_rebuild_started: false,
      production_ingestion_started: false,
    },
  };

  const reportsDir = join(INTAKE_ROOT, session.target_kb, "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const jsonReportPath = join(reportsDir, `${session.session_id}_processing_report.json`);
  const mdReportPath = join(reportsDir, `${session.session_id}_processing_report.md`);
  await writeJson(jsonReportPath, report);
  await fs.writeFile(mdReportPath, buildMarkdownReport(report), "utf-8");

  session.processing_report_json = repoRelative(jsonReportPath);
  session.processing_report_md = repoRelative(mdReportPath);
  await writeJson(sessionPath, session);

  return {
    session_id: session.session_id,
    target_kb: session.target_kb,
    status: session.status,
    summary,
    reports: {
      json: repoRelative(jsonReportPath),
      markdown: repoRelative(mdReportPath),
    },
  };
}

function parseArgs(argv) {
  const args = { session: null, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--session") {
      args.session = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--all") {
      args.all = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const approved = await loadApprovedSessions(args.session);
  const processed = [];
  for (const { path, session } of approved) {
    processed.push(await processSession(path, session));
  }
  console.log(JSON.stringify({
    ok: true,
    mode: args.session ? "single_session" : "all_approved",
    processed_count: processed.length,
    processed,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
