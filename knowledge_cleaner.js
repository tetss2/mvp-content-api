import { promises as fs } from "fs";
import { dirname, isAbsolute, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INTAKE_ROOT = join(ROOT, "knowledge_intake");
const SESSIONS_DIR = join(INTAKE_ROOT, "sessions");

const NAVIGATION_PATTERNS = [
  /^\s*\d+\s*$/,
  /^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i,
  /^\s*стр\.?\s*\d+\s*$/i,
  /^\s*страница\s+\d+\s*$/i,
  /^\s*оглавление\s*$/i,
  /^\s*содержание\s*$/i,
  /^\s*copyright\b/i,
  /^\s*all rights reserved\b/i,
  /^\s*www\.[^\s]+$/i,
  /^\s*https?:\/\/\S+\s*$/i,
];

const GARBAGE_KEYWORDS = {
  tests: [/тест\b/i, /\btest\b/i, /ключ\s+к\s+тесту/i, /результат[ы]?\s+теста/i],
  questionnaires: [/опросник/i, /анкета/i, /questionnaire/i, /шкала\s+оцен/i],
  forms: [/заполните/i, /форма/i, /подпись\s*:/i, /фио\s*:/i, /дата\s*:/i],
  checklists: [/чек[-\s]?лист/i, /checklist/i, /^\s*[☐☑✓✔]\s+/m],
};

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

function normalizeUtf8(text) {
  return (text || "")
    .normalize("NFKC")
    .replace(/\uFEFF/g, "")
    .replace(/\u00AD/g, "")
    .replace(/[�□■●◆◇]/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

function normalizeWhitespace(text) {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeBrokenHyphenation(text) {
  return text.replace(/([A-Za-zА-Яа-яЁё])-\n([A-Za-zА-Яа-яЁё])/g, "$1$2");
}

function isNavigationGarbage(line) {
  return NAVIGATION_PATTERNS.some((pattern) => pattern.test(line));
}

function cleanLines(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const seen = new Map();
  const cleaned = [];
  let removedEmpty = 0;
  let removedNavigation = 0;
  let removedRepeated = 0;

  for (const line of lines) {
    if (!line) {
      removedEmpty += 1;
      if (cleaned[cleaned.length - 1] !== "") cleaned.push("");
      continue;
    }
    if (isNavigationGarbage(line)) {
      removedNavigation += 1;
      continue;
    }
    const key = line.toLowerCase().replace(/\s+/g, " ");
    const count = seen.get(key) || 0;
    if (count >= 1) {
      removedRepeated += 1;
      seen.set(key, count + 1);
      continue;
    }
    seen.set(key, count + 1);
    cleaned.push(line);
  }

  return {
    text: cleaned.join("\n"),
    cleaning_stats: {
      removed_empty_fragments: removedEmpty,
      removed_navigation_lines: removedNavigation,
      removed_repeated_lines: removedRepeated,
    },
  };
}

function detectGarbage(text) {
  const signals = [];
  const lower = text.toLowerCase();
  const chars = text.length;
  const alpha = (text.match(/[a-zа-яё]/gi) || []).length;
  const cyrillic = (text.match(/[а-яё]/gi) || []).length;
  const mojibake = (text.match(/[РС][\u0400-\u04FFA-Za-z]{2,}/g) || []).length;
  const mojibakeMarkers = (text.match(/[РСЃЊЉЌЋЏЂ™њќў]|вЂ/g) || []).length;
  const replacement = (text.match(/�/g) || []).length;
  const repeatedPunctuation = (text.match(/[._\-–—=]{6,}/g) || []).length;
  const repeatedLines = text.split(/\n/).length - new Set(text.split(/\n/).map((line) => line.trim())).size;

  if (chars < 300) signals.push("ultra_short_fragments");
  if (chars > 0 && alpha / chars < 0.35) signals.push("low_semantic_density");
  if (
    mojibake > 15 ||
    mojibakeMarkers > 40 ||
    (mojibake > 6 && cyrillic / Math.max(alpha, 1) > 0.5)
  ) {
    signals.push("corrupted_ocr_or_mojibake");
  }
  if (replacement > 5) signals.push("broken_symbols");
  if (repeatedPunctuation > 3) signals.push("repeated_patterns");
  if (repeatedLines > 5) signals.push("repeated_lines");

  for (const [kind, patterns] of Object.entries(GARBAGE_KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(text) || pattern.test(lower))) signals.push(kind);
  }

  return [...new Set(signals)];
}

function qualityFromSignals(cleanedText, signals) {
  if (!cleanedText.trim()) {
    return { quality_score: 0, quality_label: "REJECT", recommended_action: "reject" };
  }

  const severe = new Set(["corrupted_ocr_or_mojibake", "low_semantic_density"]);
  let score = 100;
  if (cleanedText.length < 1_000) score -= 15;
  if (cleanedText.length < 300) score -= 35;
  for (const signal of signals) {
    score -= severe.has(signal) ? 35 : 12;
  }
  score = Math.max(0, Math.min(100, score));

  if (score < 35 || signals.includes("corrupted_ocr_or_mojibake")) {
    return { quality_score: score, quality_label: "REJECT", recommended_action: "reject" };
  }
  if (score < 55) return { quality_score: score, quality_label: "LOW", recommended_action: "manual_review" };
  if (score < 80) return { quality_score: score, quality_label: "MEDIUM", recommended_action: "manual_review" };
  return { quality_score: score, quality_label: "HIGH", recommended_action: "keep" };
}

function cleanText(rawText) {
  const originalChars = rawText.length;
  let text = normalizeUtf8(rawText);
  text = removeBrokenHyphenation(text);
  const lineResult = cleanLines(text);
  text = normalizeWhitespace(lineResult.text);
  const garbage_signals = detectGarbage(text);
  const quality = qualityFromSignals(text, garbage_signals);
  return {
    cleaned_text: text,
    original_chars: originalChars,
    cleaned_chars: text.length,
    estimated_tokens: estimateTokens(text),
    garbage_signals,
    ...quality,
    cleaning_stats: lineResult.cleaning_stats,
  };
}

async function loadSessions(sessionId = null) {
  const files = await fs.readdir(SESSIONS_DIR).catch(() => []);
  const sessions = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const path = join(SESSIONS_DIR, file);
    const session = await readJson(path);
    if (sessionId && session.session_id !== sessionId) continue;
    if (session.status === "processed_needs_review") sessions.push({ path, session });
  }
  return sessions;
}

async function cleanSession(sessionPath, session) {
  const cleanedDir = join(INTAKE_ROOT, session.target_kb, "cleaned", session.session_id);
  const reportsDir = join(INTAKE_ROOT, session.target_kb, "reports");
  await fs.mkdir(cleanedDir, { recursive: true });
  await fs.mkdir(reportsDir, { recursive: true });

  const itemReports = [];
  for (const item of session.items || []) {
    const report = {
      item_id: item.item_id,
      source_type: item.type,
      original_name: item.original_name,
      extraction_status: item.extraction_status || item.status,
      input_path: item.extracted_text_path || null,
      cleaned_path: null,
      original_chars: 0,
      cleaned_chars: 0,
      estimated_tokens: 0,
      estimated_chunks: 0,
      quality_score: 0,
      quality_label: "REJECT",
      garbage_signals: [],
      recommended_action: "reject",
      cleaning_stats: {},
    };

    if (item.extraction_status === "extracted" && item.extracted_text_path) {
      const inputPath = resolveLocalPath(item.extracted_text_path);
      const rawText = await fs.readFile(inputPath, "utf-8");
      const result = cleanText(rawText);
      const { cleaned_text: cleanedText, ...reportFields } = result;
      Object.assign(report, reportFields);
      report.estimated_chunks = Math.max(1, Math.ceil(result.estimated_tokens / 700));

      if (result.recommended_action !== "reject") {
        const outputPath = join(cleanedDir, `${item.item_id}.cleaned.txt`);
        await fs.writeFile(outputPath, cleanedText, "utf-8");
        report.cleaned_path = repoRelative(outputPath);
        item.cleaned_text_path = report.cleaned_path;
      }
      item.cleaning_status = result.quality_label === "REJECT" ? "rejected" : "cleaned";
      item.quality_status = result.quality_label;
      item.recommended_action = result.recommended_action;
    } else {
      report.garbage_signals = ["not_extracted"];
      report.recommended_action = "manual_review";
      report.quality_label = "LOW";
      item.cleaning_status = "skipped_not_extracted";
      item.quality_status = "LOW";
      item.recommended_action = "manual_review";
    }

    itemReports.push(report);
  }

  const summary = summarize(itemReports);
  session.status = "cleaned_ready_for_ingestion";
  session.cleaned_at = nowIso();
  session.updated_at = session.cleaned_at;

  const report = {
    session_id: session.session_id,
    user_id: session.user_id,
    target_kb: session.target_kb,
    session_status: session.status,
    cleaned_at: session.cleaned_at,
    summary,
    items: itemReports,
    safety: {
      embeddings_started: false,
      chunking_into_production_started: false,
      faiss_rebuild_started: false,
      production_ingestion_started: false,
    },
  };

  const jsonPath = join(reportsDir, `${session.session_id}_cleaning_report.json`);
  const mdPath = join(reportsDir, `${session.session_id}_cleaning_report.md`);
  await writeJson(jsonPath, report);
  await fs.writeFile(mdPath, buildMarkdownReport(report), "utf-8");

  session.cleaning_report_json = repoRelative(jsonPath);
  session.cleaning_report_md = repoRelative(mdPath);
  await writeJson(sessionPath, session);

  return {
    session_id: session.session_id,
    target_kb: session.target_kb,
    status: session.status,
    summary,
    reports: {
      json: repoRelative(jsonPath),
      markdown: repoRelative(mdPath),
    },
  };
}

function summarize(itemReports) {
  const summary = {
    total_items: itemReports.length,
    cleaned: 0,
    rejected: 0,
    high_quality: 0,
    medium_quality: 0,
    low_quality: 0,
    estimated_chunks: 0,
    estimated_tokens: 0,
  };

  for (const item of itemReports) {
    if (item.cleaned_path) summary.cleaned += 1;
    if (item.recommended_action === "reject") summary.rejected += 1;
    if (item.quality_label === "HIGH") summary.high_quality += 1;
    if (item.quality_label === "MEDIUM") summary.medium_quality += 1;
    if (item.quality_label === "LOW") summary.low_quality += 1;
    summary.estimated_chunks += item.cleaned_path ? item.estimated_chunks : 0;
    summary.estimated_tokens += item.cleaned_path ? item.estimated_tokens : 0;
  }

  return summary;
}

function buildMarkdownReport(report) {
  const lines = [
    `# Knowledge Intake Cleaning Report`,
    ``,
    `Session: \`${report.session_id}\``,
    `Target KB: \`${report.target_kb}\``,
    `Status: \`${report.session_status}\``,
    `Cleaned at: ${report.cleaned_at}`,
    ``,
    `## Summary`,
    ``,
    `- Total items: ${report.summary.total_items}`,
    `- Cleaned: ${report.summary.cleaned}`,
    `- Rejected: ${report.summary.rejected}`,
    `- High quality: ${report.summary.high_quality}`,
    `- Medium quality: ${report.summary.medium_quality}`,
    `- Low quality: ${report.summary.low_quality}`,
    `- Estimated chunks: ${report.summary.estimated_chunks}`,
    `- Estimated tokens: ${report.summary.estimated_tokens}`,
    ``,
    `## Quality Scoring Logic`,
    ``,
    `- HIGH: score >= 80, recommended_action=keep`,
    `- MEDIUM: score 55-79, recommended_action=manual_review`,
    `- LOW: score 35-54, recommended_action=manual_review`,
    `- REJECT: score < 35 or corrupted OCR/mojibake, recommended_action=reject`,
    ``,
    `## Items`,
    ``,
  ];

  for (const item of report.items) {
    lines.push(
      `### ${item.item_id}`,
      ``,
      `- Source type: ${item.source_type}`,
      `- Original name: ${item.original_name || ""}`,
      `- Extraction status: ${item.extraction_status}`,
      `- Cleaned path: ${item.cleaned_path || ""}`,
      `- Original chars: ${item.original_chars}`,
      `- Cleaned chars: ${item.cleaned_chars}`,
      `- Estimated tokens: ${item.estimated_tokens}`,
      `- Estimated chunks: ${item.estimated_chunks}`,
      `- Quality: ${item.quality_label} (${item.quality_score})`,
      `- Garbage signals: ${item.garbage_signals.length ? item.garbage_signals.join(", ") : "none"}`,
      `- Recommended action: ${item.recommended_action}`,
      ``
    );
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const args = { session: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--session") {
      args.session = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessions = await loadSessions(args.session);
  const cleaned = [];
  for (const { path, session } of sessions) {
    cleaned.push(await cleanSession(path, session));
  }
  console.log(JSON.stringify({
    ok: true,
    mode: args.session ? "single_session" : "all_processed_needs_review",
    cleaned_count: cleaned.length,
    cleaned,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
