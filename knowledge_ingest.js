import { mkdirSync, promises as fs } from "fs";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import os from "os";
import { dirname, isAbsolute, join, relative } from "path";
import { fileURLToPath } from "url";
import https from "https";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INTAKE_ROOT = join(ROOT, "knowledge_intake");
const SESSIONS_DIR = join(INTAKE_ROOT, "sessions");
const INDEX_ROOT = join(ROOT, "knowledge_indexes");

const KNOWN_KBS = new Set(["psychologist", "sexologist"]);
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const ESTIMATED_EMBEDDING_COST_PER_1M_TOKENS = Number(process.env.EMBEDDING_COST_PER_1M_TOKENS || "0.02");
const MAX_CHUNK_TOKENS = 700;
const CHUNK_OVERLAP_TOKENS = 80;
const RETRYABLE_EMBEDDING_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function repoRelative(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function resolvePath(path) {
  if (!path) return null;
  return isAbsolute(path) ? path : join(ROOT, path);
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

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function parseArgs(argv) {
  const args = {
    kb: null,
    session: null,
    dryRun: false,
    apply: false,
    validateStaging: false,
    promote: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--kb") {
      args.kb = argv[++i];
    } else if (arg === "--session") {
      args.session = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--validate-staging") {
      args.validateStaging = true;
    } else if (arg === "--promote") {
      args.promote = true;
    } else if (arg === "--force") {
      args.force = true;
    }
  }
  return args;
}

function validateArgs(args) {
  if (!args.kb) throw new Error("Missing required --kb.");
  if (!KNOWN_KBS.has(args.kb)) throw new Error(`Unknown kb "${args.kb}". Expected: psychologist or sexologist.`);
  if (!args.session) throw new Error("Missing required --session.");
  const modes = [args.dryRun, args.apply, args.validateStaging, args.promote].filter(Boolean).length;
  if (modes !== 1) throw new Error("Choose exactly one mode: --dry-run, --apply, --validate-staging, or --promote.");
}

function kbPaths(kb, sessionId = null) {
  const base = join(INDEX_ROOT, kb);
  return {
    base,
    current: join(base, "current"),
    stagingRoot: join(base, "staging"),
    staging: sessionId ? join(base, "staging", sessionId) : null,
    backups: join(base, "backups"),
    reports: join(base, "reports"),
  };
}

async function ensureKbDirs(kb) {
  const paths = kbPaths(kb);
  await fs.mkdir(paths.current, { recursive: true });
  await fs.mkdir(paths.stagingRoot, { recursive: true });
  await fs.mkdir(paths.backups, { recursive: true });
  await fs.mkdir(paths.reports, { recursive: true });
}

async function loadSession(kb, sessionId) {
  const sessionPath = join(SESSIONS_DIR, `${sessionId}.json`);
  if (!(await exists(sessionPath))) throw new Error(`Session manifest not found: ${repoRelative(sessionPath)}`);
  const session = await readJson(sessionPath);
  if (session.target_kb !== kb) {
    throw new Error(`Session target_kb mismatch: session=${session.target_kb}, --kb=${kb}`);
  }
  return { sessionPath, session };
}

async function loadCleaningReport(kb, sessionId) {
  const reportPath = join(INTAKE_ROOT, kb, "reports", `${sessionId}_cleaning_report.json`);
  if (!(await exists(reportPath))) throw new Error(`Cleaning report not found: ${repoRelative(reportPath)}`);
  return { reportPath, report: await readJson(reportPath) };
}

function includeItemForIngestion(item) {
  const label = item.quality_label;
  const action = item.recommended_action;
  if (label === "REJECT") return false;
  if (label === "LOW" && action !== "keep") return false;
  return ["HIGH", "MEDIUM"].includes(label) && ["keep", "manual_review"].includes(action);
}

function splitParagraphs(text) {
  return (text || "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function chunkText(text, maxTokens = MAX_CHUNK_TOKENS, overlapTokens = CHUNK_OVERLAP_TOKENS) {
  const paragraphs = splitParagraphs(text);
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const tokens = estimateTokens(paragraph);
    if (current.length && currentTokens + tokens > maxTokens) {
      chunks.push(current.join("\n\n"));
      const overlap = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0; i -= 1) {
        const p = current[i];
        const pTokens = estimateTokens(p);
        if (overlapCount + pTokens > overlapTokens) break;
        overlap.unshift(p);
        overlapCount += pTokens;
      }
      current = overlap;
      currentTokens = overlapCount;
    }
    current.push(paragraph);
    currentTokens += tokens;
  }

  if (current.length) chunks.push(current.join("\n\n"));
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

async function loadCurrentDocstoreHashes(kb) {
  const currentDocstore = join(kbPaths(kb).current, "docstore.jsonl");
  const hashes = new Set();
  if (!(await exists(currentDocstore))) return hashes;
  const raw = await fs.readFile(currentDocstore, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.text) hashes.add(sha1(row.text.toLowerCase().replace(/\s+/g, " ").trim()));
    } catch {
      // Ignore malformed legacy rows during dry-run duplicate estimation.
    }
  }
  return hashes;
}

async function preparePlan(kb, session, cleaningReport) {
  const currentHashes = await loadCurrentDocstoreHashes(kb);
  const seen = new Map();
  const plannedSources = [];
  const plannedChunks = [];
  const duplicateCandidates = [];
  const rejectedItems = [];

  for (const item of cleaningReport.items || []) {
    if (!includeItemForIngestion(item) || !item.cleaned_path) {
      rejectedItems.push({
        item_id: item.item_id,
        quality_label: item.quality_label,
        recommended_action: item.recommended_action,
        reason: "excluded_by_quality_policy",
      });
      continue;
    }

    const cleanedPath = resolvePath(item.cleaned_path);
    const text = await fs.readFile(cleanedPath, "utf-8");
    const sourceChunks = chunkText(text);
    plannedSources.push({
      item_id: item.item_id,
      source_type: item.source_type,
      cleaned_path: item.cleaned_path,
      quality_label: item.quality_label,
      quality_score: item.quality_score,
      recommended_action: item.recommended_action,
      planned_chunks: sourceChunks.length,
      estimated_tokens: estimateTokens(text),
    });

    sourceChunks.forEach((chunk, index) => {
      const normalizedHash = sha1(chunk.toLowerCase().replace(/\s+/g, " ").trim());
      const duplicateStatus = currentHashes.has(normalizedHash)
        ? "duplicate_candidate_current"
        : seen.has(normalizedHash)
          ? "duplicate_candidate_session"
          : "canonical_or_unique";
      if (duplicateStatus !== "canonical_or_unique") {
        duplicateCandidates.push({
          item_id: item.item_id,
          chunk_index: index,
          duplicate_status: duplicateStatus,
          duplicate_of: seen.get(normalizedHash) || null,
        });
      }
      const chunkId = sha1(`${kb}:${session.session_id}:${item.item_id}:${index}:${normalizedHash}`);
      const tokenEstimate = estimateTokens(chunk);
      plannedChunks.push({
        text: chunk,
        metadata: {
          kb_id: kb,
          session_id: session.session_id,
          source_id: item.item_id,
          source_file: item.original_name || item.input_path || item.cleaned_path,
          cleaned_file: item.cleaned_path,
          chunk_id: chunkId,
          chunk_index: index,
          token_estimate: tokenEstimate,
          quality_label: item.quality_label,
          quality_score: item.quality_score,
          recommended_action: item.recommended_action,
          ingestion_timestamp: nowIso(),
          embedding_model: EMBEDDING_MODEL,
          embedding_dim: EMBEDDING_DIM,
          duplicate_status: duplicateStatus,
          source_type: item.source_type,
        },
      });
      seen.set(normalizedHash, chunkId);
    });
  }

  return { plannedSources, plannedChunks, duplicateCandidates, rejectedItems };
}

function summarizePlan(cleaningReport, plan) {
  const estimatedTokens = plan.plannedChunks.reduce((sum, chunk) => sum + chunk.metadata.token_estimate, 0);
  return {
    total_cleaning_items: cleaningReport.items?.length || 0,
    planned_sources: plan.plannedSources.length,
    planned_chunks: plan.plannedChunks.length,
    rejected_or_skipped_items: plan.rejectedItems.length,
    estimated_tokens: estimatedTokens,
    estimated_embedding_cost_usd: Number((estimatedTokens / 1_000_000 * ESTIMATED_EMBEDDING_COST_PER_1M_TOKENS).toFixed(8)),
    duplicate_candidates: plan.duplicateCandidates.length,
    quality_summary: {
      high: (cleaningReport.items || []).filter((item) => item.quality_label === "HIGH").length,
      medium: (cleaningReport.items || []).filter((item) => item.quality_label === "MEDIUM").length,
      low: (cleaningReport.items || []).filter((item) => item.quality_label === "LOW").length,
      reject: (cleaningReport.items || []).filter((item) => item.quality_label === "REJECT").length,
    },
  };
}

function dryRunMarkdown(report) {
  return [
    `# Ingestion Dry Run`,
    ``,
    `KB: \`${report.kb_id}\``,
    `Session: \`${report.session_id}\``,
    `Generated at: ${report.generated_at}`,
    ``,
    `## Summary`,
    ``,
    `- Planned sources: ${report.summary.planned_sources}`,
    `- Planned chunks: ${report.summary.planned_chunks}`,
    `- Estimated tokens: ${report.summary.estimated_tokens}`,
    `- Estimated embedding cost USD: ${report.summary.estimated_embedding_cost_usd}`,
    `- Duplicate candidates: ${report.summary.duplicate_candidates}`,
    `- Rejected/skipped items: ${report.summary.rejected_or_skipped_items}`,
    ``,
    `## Quality Summary`,
    ``,
    `- HIGH: ${report.summary.quality_summary.high}`,
    `- MEDIUM: ${report.summary.quality_summary.medium}`,
    `- LOW: ${report.summary.quality_summary.low}`,
    `- REJECT: ${report.summary.quality_summary.reject}`,
    ``,
    `## Safeguards`,
    ``,
    `- OpenAI API called: false`,
    `- Production current index modified: false`,
    `- FAISS rebuild/promote: false`,
  ].join("\n");
}

function applyMarkdown(report) {
  return [
    `# Ingestion Apply`,
    ``,
    `KB: \`${report.kb_id}\``,
    `Session: \`${report.session_id}\``,
    `Generated at: ${report.generated_at}`,
    ``,
    `## Summary`,
    ``,
    `- Staging dir: \`${report.staging_dir}\``,
    `- Planned sources: ${report.summary.planned_sources}`,
    `- Planned chunks: ${report.summary.planned_chunks}`,
    `- Estimated tokens: ${report.summary.estimated_tokens}`,
    `- Duplicate candidates: ${report.summary.duplicate_candidates}`,
    ``,
    `## Safeguards`,
    ``,
    `- OpenAI API called: true`,
    `- Production current index modified: false`,
    `- Promoted automatically: false`,
    `- Staging validated: ${report.validation?.ok === true}`,
  ].join("\n");
}

function validateMarkdown(report) {
  return [
    `# Ingestion Staging Validation`,
    ``,
    `KB: \`${report.kb_id}\``,
    `Session: \`${report.session_id}\``,
    `Generated at: ${report.generated_at}`,
    `Staging: \`${report.staging_dir}\``,
    `OK: ${report.validation.ok}`,
    `Vectors: ${report.validation.faiss_vectors || 0}`,
    `Docstore rows: ${report.validation.docstore_rows || 0}`,
    ``,
    `## Errors`,
    ``,
    ...(report.validation.errors?.length ? report.validation.errors.map((error) => `- ${error}`) : [`- none`]),
  ].join("\n");
}

async function writeReport(kb, sessionId, kind, report, markdown) {
  const reportsDir = kbPaths(kb).reports;
  await fs.mkdir(reportsDir, { recursive: true });
  const jsonPath = join(reportsDir, `${sessionId}_${kind}.json`);
  const mdPath = join(reportsDir, `${sessionId}_${kind}.md`);
  await writeJson(jsonPath, report);
  await fs.writeFile(mdPath, markdown, "utf-8");
  return { json: repoRelative(jsonPath), markdown: repoRelative(mdPath) };
}

async function dryRun(kb, session, cleaningReport) {
  if (session.status !== "cleaned_ready_for_ingestion") {
    throw new Error(`Dry-run requires session status cleaned_ready_for_ingestion, got ${session.status}`);
  }
  const plan = await preparePlan(kb, session, cleaningReport);
  const report = {
    type: "ingestion_dry_run",
    kb_id: kb,
    session_id: session.session_id,
    generated_at: nowIso(),
    summary: summarizePlan(cleaningReport, plan),
    planned_sources: plan.plannedSources,
    duplicate_candidates: plan.duplicateCandidates,
    rejected_items: plan.rejectedItems,
    safeguards: {
      openai_api_called: false,
      production_current_index_modified: false,
      faiss_rebuild_started: false,
      production_ingestion_started: false,
    },
  };
  report.reports = await writeReport(kb, session.session_id, "ingestion_dry_run", report, dryRunMarkdown(report));
  return report;
}

function openAiEmbeddingRequest(input, apiKey) {
  const body = JSON.stringify({ model: EMBEDDING_MODEL, input });
  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`OpenAI embeddings HTTP ${res.statusCode}: ${data.slice(0, 500)}`);
            error.statusCode = res.statusCode;
            error.retryAfter = Number(res.headers["retry-after"] || 0);
            reject(error);
            return;
          }
          resolve(JSON.parse(data));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openAiEmbeddingRequestWithRetry(input, apiKey, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await openAiEmbeddingRequest(input, apiKey);
    } catch (err) {
      const retryable = RETRYABLE_EMBEDDING_STATUS.has(err.statusCode);
      if (!retryable || attempt === retries) throw err;
      const delaySeconds = err.retryAfter > 0 ? err.retryAfter : Math.min(20, 2 ** attempt);
      console.error(`Embedding batch retry in ${delaySeconds}s (attempt ${attempt + 1}/${retries})`);
      await sleep(delaySeconds * 1000);
    }
  }
  throw new Error("OpenAI embeddings retry loop exited unexpectedly.");
}

async function embedChunks(chunks, apiKey) {
  const embeddings = [];
  const batchSize = 64;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const response = await openAiEmbeddingRequestWithRetry(batch.map((chunk) => chunk.text), apiKey);
    for (const item of response.data) embeddings.push(item.embedding);
  }
  return embeddings;
}

async function buildFaissIndex(stagingDir, vectorsPath) {
  mkdirSync(dirname(stagingDir), { recursive: true });
  mkdirSync(stagingDir, { recursive: true });
  const tempFaissDir = join(os.tmpdir(), "mvp-content-api-faiss", timestampId());
  const tempIndexPath = join(tempFaissDir, "faiss.index");
  mkdirSync(tempFaissDir, { recursive: true });
  const script = `
import json, sys, os
from pathlib import Path
import faiss
import numpy as np
vectors_path, index_path = sys.argv[1], sys.argv[2]
vectors = []
with open(vectors_path, "r", encoding="utf-8") as handle:
    for line in handle:
        if line.strip():
            vectors.append(json.loads(line)["embedding"])
arr = np.array(vectors, dtype="float32")
if arr.ndim != 2 or arr.shape[1] != ${EMBEDDING_DIM}:
    raise SystemExit(f"Invalid vector shape: {arr.shape}")
faiss.normalize_L2(arr)
index = faiss.IndexFlatIP(${EMBEDDING_DIM})
index.add(arr)
os.makedirs(os.path.dirname(index_path), exist_ok=True)
faiss.write_index(index, index_path)
`;
  try {
    const result = spawnSync("python", ["-c", script, vectorsPath, tempIndexPath], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`FAISS build failed: ${result.stderr || result.stdout}`);
    }
    await fs.copyFile(tempIndexPath, join(stagingDir, "faiss.index"));
  } finally {
    await fs.rm(tempFaissDir, { recursive: true, force: true });
  }
}

async function applyIngestion(kb, sessionPath, session, cleaningReport, force) {
  if (session.status === "ingestion_completed" && !force) {
    throw new Error("Session already ingestion_completed. Use --force to re-ingest intentionally.");
  }
  if (session.status !== "cleaned_ready_for_ingestion" && !force) {
    throw new Error(`Apply requires cleaned_ready_for_ingestion, got ${session.status}. Use --force only if intentional.`);
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for --apply.");

  const paths = kbPaths(kb, session.session_id);
  const tempStaging = join(paths.stagingRoot, `${session.session_id}.tmp_${timestampId()}`);
  if (await exists(paths.staging)) {
    if (!force) throw new Error(`Staging already exists for session. Use --force to replace: ${repoRelative(paths.staging)}`);
    await fs.rm(paths.staging, { recursive: true, force: true });
  }
  await fs.mkdir(tempStaging, { recursive: true });

  try {
    const plan = await preparePlan(kb, session, cleaningReport);
    if (!plan.plannedChunks.length) throw new Error("No chunks eligible for ingestion.");
    const embeddings = await embedChunks(plan.plannedChunks, process.env.OPENAI_API_KEY);

    const vectorsPath = join(tempStaging, "vectors.jsonl");
    const docstorePath = join(tempStaging, "docstore.jsonl");
    const vectorLines = [];
    const docstoreLines = [];
    plan.plannedChunks.forEach((chunk, index) => {
      const embedding = embeddings[index];
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Embedding dim mismatch for chunk ${chunk.metadata.chunk_id}`);
      }
      vectorLines.push(JSON.stringify({ chunk_id: chunk.metadata.chunk_id, embedding }));
      docstoreLines.push(JSON.stringify({
        vector_id: index,
        chunk_id: chunk.metadata.chunk_id,
        text: chunk.text,
        metadata: chunk.metadata,
        embedding_model: EMBEDDING_MODEL,
        embedding_dim: EMBEDDING_DIM,
      }));
    });
    await fs.writeFile(vectorsPath, vectorLines.join("\n") + "\n", "utf-8");
    await fs.writeFile(docstorePath, docstoreLines.join("\n") + "\n", "utf-8");
    await buildFaissIndex(tempStaging, vectorsPath);

    const indexManifest = {
      generated_at: nowIso(),
      kb_id: kb,
      session_id: session.session_id,
      index_type: "faiss.IndexFlatIP",
      similarity: "cosine_similarity_via_l2_normalized_inner_product",
      embedding_model: EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM,
      vectors: plan.plannedChunks.length,
      faiss_index: "faiss.index",
      docstore: "docstore.jsonl",
    };
    const ingestionManifest = {
      generated_at: nowIso(),
      kb_id: kb,
      session_id: session.session_id,
      source_status: session.status,
      summary: summarizePlan(cleaningReport, plan),
      safeguards: {
        wrote_only_staging: true,
        current_index_modified: false,
        promoted_automatically: false,
      },
    };
    await writeJson(join(tempStaging, "index_manifest.json"), indexManifest);
    await writeJson(join(tempStaging, "ingestion_manifest.json"), ingestionManifest);

    const validation = await validateStaging(tempStaging);
    if (!validation.ok) {
      throw new Error(`Generated staging validation failed: ${validation.errors.join("; ")}`);
    }
    mkdirSync(dirname(paths.staging), { recursive: true });
    await fs.rename(tempStaging, paths.staging);

    session.status = "ingestion_staged";
    session.ingestion_staged_at = nowIso();
    session.ingestion_staging_dir = repoRelative(paths.staging);
    session.updated_at = session.ingestion_staged_at;
    await writeJson(sessionPath, session);

    const report = {
      type: "ingestion_apply",
      kb_id: kb,
      session_id: session.session_id,
      generated_at: nowIso(),
      staging_dir: repoRelative(paths.staging),
      summary: ingestionManifest.summary,
      validation,
      safeguards: ingestionManifest.safeguards,
    };
    report.reports = await writeReport(kb, session.session_id, "ingestion_apply", report, applyMarkdown(report));
    session.ingestion_apply_report_json = report.reports.json;
    session.ingestion_apply_report_md = report.reports.markdown;
    await writeJson(sessionPath, session);
    return report;
  } catch (err) {
    await fs.rm(tempStaging, { recursive: true, force: true });
    throw err;
  }
}

async function readJsonlRows(path) {
  const raw = await fs.readFile(path, "utf-8");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function readFaissCount(indexPath) {
  const script = `
import faiss, sys
index = faiss.read_index(sys.argv[1])
print(index.ntotal)
`;
  const result = spawnSync("python", ["-c", script, indexPath], { cwd: ROOT, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`FAISS validation failed: ${result.stderr || result.stdout}`);
  return Number(result.stdout.trim());
}

async function validateStaging(stagingDir) {
  const errors = [];
  const indexPath = join(stagingDir, "faiss.index");
  const docstorePath = join(stagingDir, "docstore.jsonl");
  const manifestPath = join(stagingDir, "index_manifest.json");

  for (const required of [indexPath, docstorePath, manifestPath]) {
    if (!(await exists(required))) errors.push(`Missing ${repoRelative(required)}`);
  }
  if (errors.length) return { ok: false, errors };

  const manifest = await readJson(manifestPath);
  const rows = await readJsonlRows(docstorePath);
  const faissCount = readFaissCount(indexPath);
  const chunkIds = new Set();
  let emptyChunks = 0;
  let duplicateChunkIds = 0;
  let badDim = false;
  for (const row of rows) {
    if (!row.text || !row.text.trim()) emptyChunks += 1;
    if (chunkIds.has(row.chunk_id)) duplicateChunkIds += 1;
    chunkIds.add(row.chunk_id);
    if (row.embedding_dim !== EMBEDDING_DIM || row.metadata?.embedding_dim !== EMBEDDING_DIM) badDim = true;
  }
  if (faissCount !== rows.length) errors.push(`FAISS vectors count ${faissCount} != docstore rows ${rows.length}`);
  if (manifest.embedding_dim !== EMBEDDING_DIM) errors.push(`index_manifest embedding_dim ${manifest.embedding_dim} != ${EMBEDDING_DIM}`);
  if (badDim) errors.push("One or more docstore rows have invalid embedding_dim.");
  if (emptyChunks) errors.push(`Empty chunks found: ${emptyChunks}`);
  if (duplicateChunkIds) errors.push(`Duplicate chunk_id found: ${duplicateChunkIds}`);
  if (manifest.vectors !== rows.length) errors.push(`index_manifest vectors ${manifest.vectors} != docstore rows ${rows.length}`);
  return {
    ok: errors.length === 0,
    errors,
    faiss_vectors: faissCount,
    docstore_rows: rows.length,
    embedding_dim: manifest.embedding_dim,
    manifest,
  };
}

async function validateStagingForSession(kb, session) {
  const paths = kbPaths(kb, session.session_id);
  if (!(await exists(paths.staging))) throw new Error(`Cannot validate missing staging: ${repoRelative(paths.staging)}`);
  const validation = await validateStaging(paths.staging);
  const report = {
    type: "ingestion_validate_staging",
    kb_id: kb,
    session_id: session.session_id,
    generated_at: nowIso(),
    staging_dir: repoRelative(paths.staging),
    validation,
    safeguards: {
      read_only_validation: true,
      production_current_index_modified: false,
      promoted_automatically: false,
    },
  };
  report.reports = await writeReport(kb, session.session_id, "ingestion_validate_staging", report, validateMarkdown(report));
  return report;
}

async function copyDir(src, dest) {
  await fs.mkdir(dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true, force: false, errorOnExist: true });
}

async function promote(kb, sessionPath, session, force) {
  if (session.status === "ingestion_completed" && !force) {
    throw new Error("Session already ingestion_completed. Use --force to promote intentionally.");
  }
  if (session.status !== "ingestion_staged" && !force) {
    throw new Error(`Promote requires ingestion_staged, got ${session.status}. Use --force only if intentional.`);
  }
  const paths = kbPaths(kb, session.session_id);
  if (!(await exists(paths.staging))) throw new Error(`Cannot promote without staging: ${repoRelative(paths.staging)}`);
  const validation = await validateStaging(paths.staging);
  if (!validation.ok) {
    throw new Error(`Staging validation failed: ${validation.errors.join("; ")}`);
  }

  await fs.mkdir(paths.backups, { recursive: true });
  const currentExists = await exists(paths.current);
  const currentEntries = currentExists ? await fs.readdir(paths.current).catch(() => []) : [];
  let backupPath = null;
  if (currentExists && currentEntries.length > 0) {
    backupPath = join(paths.backups, timestampId());
    await copyDir(paths.current, backupPath);
    const backupEntries = await fs.readdir(backupPath);
    if (!backupEntries.length) throw new Error("Backup verification failed: backup directory is empty.");
  }

  const oldCurrent = join(paths.base, `current_old_${timestampId()}`);
  if (currentExists) {
    await fs.rename(paths.current, oldCurrent);
  }
  try {
    await fs.rename(paths.staging, paths.current);
    await fs.rm(oldCurrent, { recursive: true, force: true });
  } catch (err) {
    if (await exists(oldCurrent)) await fs.rename(oldCurrent, paths.current);
    throw err;
  }

  session.status = "ingestion_completed";
  session.ingestion_completed_at = nowIso();
  session.current_index_dir = repoRelative(paths.current);
  if (backupPath) session.previous_index_backup = repoRelative(backupPath);
  session.updated_at = session.ingestion_completed_at;
  await writeJson(sessionPath, session);

  const report = {
    type: "ingestion_promote",
    kb_id: kb,
    session_id: session.session_id,
    generated_at: nowIso(),
    validation,
    backup: backupPath ? repoRelative(backupPath) : null,
    current: repoRelative(paths.current),
    safeguards: {
      staging_validated_before_promote: true,
      backup_created_before_overwrite: Boolean(backupPath) || currentEntries.length === 0,
      atomic_swap_attempted: true,
      demo_users_touched: false,
      data_users_written: false,
    },
  };
  report.reports = await writeReport(kb, session.session_id, "ingestion_promote", report, [
    `# Ingestion Promote`,
    ``,
    `KB: \`${kb}\``,
    `Session: \`${session.session_id}\``,
    `Current: \`${report.current}\``,
    `Backup: \`${report.backup || "none (no previous current index)"}\``,
    `Vectors: ${validation.faiss_vectors}`,
    `Docstore rows: ${validation.docstore_rows}`,
  ].join("\n"));
  session.ingestion_promote_report_json = report.reports.json;
  session.ingestion_promote_report_md = report.reports.markdown;
  await writeJson(sessionPath, session);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  await ensureKbDirs(args.kb);
  const { sessionPath, session } = await loadSession(args.kb, args.session);

  let result;
  if (args.dryRun) {
    const { report: cleaningReport } = await loadCleaningReport(args.kb, args.session);
    result = await dryRun(args.kb, session, cleaningReport);
  } else if (args.apply) {
    const { report: cleaningReport } = await loadCleaningReport(args.kb, args.session);
    result = await applyIngestion(args.kb, sessionPath, session, cleaningReport, args.force);
  } else if (args.validateStaging) {
    result = await validateStagingForSession(args.kb, session);
  } else if (args.promote) {
    result = await promote(args.kb, sessionPath, session, args.force);
  }

  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
