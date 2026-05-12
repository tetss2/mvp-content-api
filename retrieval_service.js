import { retrieve as retrieveProductionKb } from "./knowledge_retrieval.js";

const DEFAULT_TOP_K = Number(process.env.KB_RETRIEVAL_TOP_K || 5);
const DEFAULT_TIMEOUT_MS = Number(process.env.KB_RETRIEVAL_TIMEOUT_MS || 8000);
const DEFAULT_MIN_SCORE = Number(process.env.KB_RETRIEVAL_MIN_SCORE || 0.05);
const DEFAULT_CONTEXT_LIMIT_CHARS = Number(process.env.KB_RETRIEVAL_CONTEXT_LIMIT_CHARS || 5200);
const DEFAULT_CHUNK_LIMIT_CHARS = Number(process.env.KB_RETRIEVAL_CHUNK_LIMIT_CHARS || 1400);
const DEBUG = process.env.KB_RETRIEVAL_DEBUG === "1" || process.env.KB_RETRIEVAL_DEBUG === "true";

function isEnabled() {
  return process.env.KB_RETRIEVAL_ENABLED !== "0" && process.env.KB_RETRIEVAL_ENABLED !== "false";
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Retrieval timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeText(text = "") {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeChunks(chunks) {
  const seen = new Set();
  const result = [];

  for (const chunk of chunks) {
    const key = chunk.chunk_id || normalizeText(chunk.text).slice(0, 500);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }

  return result;
}

function sourceLabel(chunk) {
  const source = chunk.source || {};
  return source.source_file || source.cleaned_file || source.source_id || chunk.chunk_id || "unknown";
}

function trimText(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  return `${text.slice(0, maxChars).trim()}...`;
}

function buildContext(chunks, contextLimitChars, chunkLimitChars) {
  const blocks = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const text = trimText(chunk.text, chunkLimitChars);
    const block = [
      `[${blocks.length + 1}] score=${chunk.score.toFixed(3)} source=${sourceLabel(chunk)}`,
      text,
    ].join("\n");

    if (usedChars + block.length > contextLimitChars) break;
    blocks.push(block);
    usedChars += block.length + 2;
  }

  return blocks.join("\n\n");
}

function logDebug(payload) {
  if (!DEBUG) return;
  console.log("[retrieval]", JSON.stringify(payload));
}

export async function retrieveGroundingContext(query, scenario, options = {}) {
  if (!isEnabled()) {
    logDebug({ event: "disabled", scenario });
    return null;
  }

  const kb = scenario === "sexologist" ? "sexologist" : "psychologist";
  const topK = options.topK || DEFAULT_TOP_K;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const contextLimitChars = options.contextLimitChars || DEFAULT_CONTEXT_LIMIT_CHARS;
  const chunkLimitChars = options.chunkLimitChars || DEFAULT_CHUNK_LIMIT_CHARS;

  try {
    const retrieval = await withTimeout(retrieveProductionKb(kb, query, topK), timeoutMs);
    const filtered = (retrieval.results || [])
      .filter((chunk) => Number.isFinite(chunk.score) && chunk.score >= minScore);
    const chunks = dedupeChunks(filtered);
    const context = buildContext(chunks, contextLimitChars, chunkLimitChars);

    logDebug({
      event: "ok",
      kb,
      query,
      requested_top_k: topK,
      raw_count: retrieval.result_count,
      used_count: chunks.length,
      min_score: minScore,
      context_chars: context.length,
      production_version: retrieval.production_version,
    });

    if (!context) return null;

    return {
      context,
      chunks,
      productionVersion: retrieval.production_version,
      manifestInfo: retrieval.manifest_info,
    };
  } catch (err) {
    console.error("[retrieval] failed:", err.message);
    logDebug({ event: "failed", scenario, query, error: err.message });
    return null;
  }
}
