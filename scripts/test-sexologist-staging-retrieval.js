import { mkdirSync, promises as fs } from "fs";
import { spawnSync } from "child_process";
import https from "https";
import os from "os";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGING_ROOT = join(ROOT, "knowledge_indexes", "sexologist", "staging");
const REPORTS_DIR = join(ROOT, "knowledge_indexes", "sexologist", "reports");
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const TOP_K = 5;
const QUERIES = [
  "женская сексуальная дисфункция",
  "сексуальное желание у женщин",
  "мужская сексуальность",
  "сексуальный интеллект",
  "оргазм у женщин",
];

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
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

async function latestStagingDir() {
  const entries = await fs.readdir(STAGING_ROOT, { withFileTypes: true }).catch(() => []);
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(STAGING_ROOT, entry.name);
    const stat = await fs.stat(path);
    dirs.push({ sessionId: entry.name, path, mtimeMs: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!dirs.length) throw new Error(`No staging directories found under ${repoRelative(STAGING_ROOT)}`);
  return dirs[0];
}

async function readDocstore(path) {
  const raw = await fs.readFile(path, "utf-8");
  if (path.endsWith(".jsonl")) {
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.docstore)) return parsed.docstore;
  throw new Error(`Unsupported docstore JSON shape: ${repoRelative(path)}`);
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
            reject(new Error(`OpenAI embeddings HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
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

async function embedQuery(query) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for staging retrieval smoke test.");
  const response = await openAiEmbeddingRequest(query, apiKey);
  const embedding = response.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Query embedding dim mismatch: ${embedding?.length || 0} != ${EMBEDDING_DIM}`);
  }
  return embedding;
}

async function searchFaiss(indexPath, queryEmbedding, topK) {
  const tempDir = join(os.tmpdir(), "mvp-content-api-faiss-staging-test", timestampId());
  const tempIndexPath = join(tempDir, "faiss.index");
  const queryPath = join(tempDir, "query.json");
  mkdirSync(tempDir, { recursive: true });
  const script = `
import json, sys
import faiss
import numpy as np
index_path, query_path, top_k = sys.argv[1], sys.argv[2], int(sys.argv[3])
index = faiss.read_index(index_path)
with open(query_path, "r", encoding="utf-8") as handle:
    vector = json.load(handle)
arr = np.array([vector], dtype="float32")
if arr.ndim != 2 or arr.shape[1] != ${EMBEDDING_DIM}:
    raise SystemExit(f"Invalid query vector shape: {arr.shape}")
faiss.normalize_L2(arr)
scores, ids = index.search(arr, top_k)
print(json.dumps({"scores": scores[0].tolist(), "ids": ids[0].tolist(), "index_vectors": index.ntotal}))
`;
  try {
    await fs.copyFile(indexPath, tempIndexPath);
    await fs.writeFile(queryPath, JSON.stringify(queryEmbedding), "utf-8");
    const result = spawnSync("python", ["-c", script, tempIndexPath, queryPath, String(topK)], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`FAISS staging search failed: ${result.stderr || result.stdout || result.error?.message}`);
    }
    return JSON.parse(result.stdout);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sourceFilename(row) {
  const metadata = row.metadata || {};
  return metadata.source_file || metadata.cleaned_file || row.source_file || row.cleaned_file || row.chunk_id || "unknown";
}

function preview(text) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

async function main() {
  const staging = await latestStagingDir();
  const manifestPath = join(staging.path, "index_manifest.json");
  if (!(await exists(manifestPath))) throw new Error(`Missing ${repoRelative(manifestPath)}`);
  const manifest = await readJson(manifestPath);
  if (manifest.kb_id !== "sexologist") throw new Error(`Expected sexologist staging, got kb_id=${manifest.kb_id}`);
  if (manifest.embedding_model !== EMBEDDING_MODEL) throw new Error(`Expected ${EMBEDDING_MODEL}, got ${manifest.embedding_model}`);
  if (manifest.embedding_dim !== EMBEDDING_DIM) throw new Error(`Expected embedding_dim ${EMBEDDING_DIM}, got ${manifest.embedding_dim}`);

  const indexPath = join(staging.path, manifest.faiss_index || "faiss.index");
  const docstorePath = join(staging.path, manifest.docstore || "docstore.jsonl");
  const fallbackDocstorePath = join(staging.path, "docstore.json");
  const resolvedDocstorePath = await exists(docstorePath) ? docstorePath : fallbackDocstorePath;

  for (const required of [indexPath, resolvedDocstorePath]) {
    if (!(await exists(required))) throw new Error(`Missing staging artifact: ${repoRelative(required)}`);
  }

  const docstore = await readDocstore(resolvedDocstorePath);
  const queryResults = [];
  const warnings = [];
  if (manifest.vectors !== docstore.length) {
    warnings.push(`Manifest vectors ${manifest.vectors} != docstore rows ${docstore.length}`);
  }

  for (const query of QUERIES) {
    const embedding = await embedQuery(query);
    const search = await searchFaiss(indexPath, embedding, TOP_K);
    const results = [];
    search.ids.forEach((vectorId, index) => {
      if (vectorId < 0 || vectorId >= docstore.length) return;
      const row = docstore[vectorId];
      results.push({
        rank: results.length + 1,
        score: Number(search.scores[index]),
        vector_id: vectorId,
        chunk_id: row.chunk_id || row.metadata?.chunk_id || null,
        source_file: sourceFilename(row),
        preview: preview(row.text),
      });
    });
    queryResults.push({
      query,
      top_results_count: results.length,
      index_vectors: search.index_vectors,
      results,
    });
  }

  const report = {
    type: "sexologist_staging_retrieval_test",
    generated_at: nowIso(),
    safety: {
      staging_read_only: true,
      production_current_touched: false,
      psychologist_touched: false,
      promoted_automatically: false,
      retrieval_runtime_modified: false,
      openai_embedding_calls_only: true,
    },
    session_id: staging.sessionId,
    staging_dir: repoRelative(staging.path),
    artifacts: {
      faiss_index: repoRelative(indexPath),
      docstore: repoRelative(resolvedDocstorePath),
      index_manifest: repoRelative(manifestPath),
    },
    embedding_model: EMBEDDING_MODEL,
    top_k: TOP_K,
    manifest_vectors: manifest.vectors,
    docstore_rows: docstore.length,
    warnings,
    queries: queryResults,
  };

  const reportPath = join(REPORTS_DIR, `${staging.sessionId}_staging_retrieval_test.json`);
  await writeJson(reportPath, report);

  console.log("Sexologist staging retrieval smoke test");
  console.log(`Session: ${staging.sessionId}`);
  console.log(`Staging: ${repoRelative(staging.path)}`);
  console.log(`Report: ${repoRelative(reportPath)}`);
  console.log(`Docstore rows: ${docstore.length}`);
  console.log(`Manifest vectors: ${manifest.vectors}`);
  if (warnings.length) console.log(`Warnings: ${warnings.join("; ")}`);
  for (const item of queryResults) {
    console.log("");
    console.log(`Query: ${item.query}`);
    console.log(`Top results count: ${item.top_results_count}`);
    for (const result of item.results.slice(0, 3)) {
      console.log(`  #${result.rank} score=${result.score.toFixed(4)} source=${result.source_file}`);
      console.log(`     ${result.preview}`);
    }
  }
}

main().catch((err) => {
  console.error(`Sexologist staging retrieval smoke test failed: ${err.message}`);
  process.exit(1);
});
