import { promises as fs } from "fs";
import { spawnSync } from "child_process";
import https from "https";
import os from "os";
import { dirname, join, relative } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INDEX_ROOT = join(ROOT, "knowledge_indexes");
const KNOWN_KBS = new Set(["psychologist", "sexologist"]);
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const DEFAULT_TOP_K = 5;
const RETRYABLE_EMBEDDING_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const DEBUG = process.env.KB_RETRIEVAL_DEBUG === "1" || process.env.KB_RETRIEVAL_DEBUG === "true";

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function repoRelative(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function debugLog(event, payload = {}) {
  if (!DEBUG) return;
  console.log("[retrieval-debug]", JSON.stringify({ event, ...payload }));
}

function errorPayload(err) {
  if (!err) return null;
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
    json: JSON.stringify(err, Object.getOwnPropertyNames(err)),
  };
}

function productionPaths(kb) {
  const current = join(INDEX_ROOT, kb, "production", "current");
  return {
    current,
    faissIndex: join(current, "faiss.index"),
    docstore: join(current, "docstore.jsonl"),
    indexManifest: join(current, "index_manifest.json"),
    productionManifest: join(current, "production_manifest.json"),
  };
}

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(path) {
  try {
    const stat = await fs.stat(path);
    return stat.size;
  } catch {
    return null;
  }
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf-8"));
}

async function readJsonlRows(path) {
  const raw = await fs.readFile(path, "utf-8");
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at ${repoRelative(path)}:${index + 1}: ${err.message}`);
    }
  });
}

function parseArgs(argv) {
  const args = {
    retrieve: false,
    kb: null,
    query: null,
    topK: DEFAULT_TOP_K,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--retrieve") args.retrieve = true;
    else if (arg === "--kb") args.kb = argv[++i];
    else if (arg === "--query") args.query = argv[++i];
    else if (arg === "--topK" || arg === "--top-k") args.topK = Number(argv[++i]);
  }
  return args;
}

function validateArgs(args) {
  if (!args.retrieve) throw new Error("Choose mode: --retrieve.");
  if (!args.kb) throw new Error("Missing required --kb.");
  if (!KNOWN_KBS.has(args.kb)) throw new Error(`Unknown kb "${args.kb}". Expected: psychologist or sexologist.`);
  if (!args.query || !args.query.trim()) throw new Error("Missing required --query.");
  if (!Number.isInteger(args.topK) || args.topK <= 0) throw new Error("--topK must be a positive integer.");
}

async function loadProductionKb(kb) {
  const paths = productionPaths(kb);
  const checks = {
    current: await exists(paths.current),
    faissIndex: await exists(paths.faissIndex),
    docstore: await exists(paths.docstore),
    indexManifest: await exists(paths.indexManifest),
    productionManifest: await exists(paths.productionManifest),
  };

  debugLog("production_paths", {
    cwd: process.cwd(),
    node_env: process.env.NODE_ENV || null,
    kb_id: kb,
    paths,
    exists: checks,
    sizes: {
      faissIndex: await fileSize(paths.faissIndex),
      docstore: await fileSize(paths.docstore),
      productionManifest: await fileSize(paths.productionManifest),
    },
  });

  if (!checks.current) throw new Error(`Production current not found: ${repoRelative(paths.current)}. Run a successful promote first.`);
  if (!checks.faissIndex) throw new Error(`Missing production FAISS index: ${repoRelative(paths.faissIndex)}`);
  if (!checks.docstore) throw new Error(`Missing production docstore: ${repoRelative(paths.docstore)}`);
  if (!checks.indexManifest) throw new Error(`Missing production index manifest: ${repoRelative(paths.indexManifest)}`);
  if (!checks.productionManifest) throw new Error(`Missing production manifest: ${repoRelative(paths.productionManifest)}`);

  const indexManifest = await readJson(paths.indexManifest);
  const productionManifest = await readJson(paths.productionManifest);
  const docstore = await readJsonlRows(paths.docstore);

  debugLog("production_loaded", {
    kb_id: kb,
    docstore_rows: docstore.length,
    index_vectors: indexManifest.vectors,
    embedding_dim: indexManifest.embedding_dim,
    production_version: productionManifest.new_production_version || productionManifest.production_version || null,
  });

  if (indexManifest.embedding_dim !== EMBEDDING_DIM) {
    throw new Error(`Production index embedding_dim ${indexManifest.embedding_dim} != ${EMBEDDING_DIM}`);
  }
  if (indexManifest.vectors !== docstore.length) {
    throw new Error(`Production index vectors ${indexManifest.vectors} != docstore rows ${docstore.length}`);
  }

  docstore.forEach((row, index) => {
    if (row.vector_id !== index) throw new Error(`Docstore vector_id mismatch at row ${index}: ${row.vector_id}`);
    if (row.embedding_dim !== EMBEDDING_DIM || row.metadata?.embedding_dim !== EMBEDDING_DIM) {
      throw new Error(`Docstore embedding_dim mismatch at row ${index}`);
    }
  });

  return { paths, indexManifest, productionManifest, docstore };
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

async function embedQuery(query, apiKey, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      debugLog("embedding_request", {
        embedding_model: EMBEDDING_MODEL,
        query_chars: query.length,
        attempt: attempt + 1,
      });
      const response = await openAiEmbeddingRequest(query, apiKey);
      const embedding = response.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Query embedding dim mismatch: ${embedding?.length || 0} != ${EMBEDDING_DIM}`);
      }
      debugLog("embedding_response", {
        embedding_model: EMBEDDING_MODEL,
        embedding_dim: embedding.length,
        first_3_values: embedding.slice(0, 3),
      });
      return embedding;
    } catch (err) {
      const retryable = RETRYABLE_EMBEDDING_STATUS.has(err.statusCode);
      if (!retryable || attempt === retries) throw err;
      const delaySeconds = err.retryAfter > 0 ? err.retryAfter : Math.min(20, 2 ** attempt);
      console.error(`Embedding retry in ${delaySeconds}s (attempt ${attempt + 1}/${retries})`);
      await sleep(delaySeconds * 1000);
    }
  }
  throw new Error("OpenAI embeddings retry loop exited unexpectedly.");
}

async function searchFaiss(indexPath, queryEmbedding, topK) {
  const tempDir = join(os.tmpdir(), "mvp-content-api-faiss", timestampId());
  const tempIndexPath = join(tempDir, "faiss.index");
  const queryPath = join(tempDir, "query.json");
  await fs.mkdir(tempDir, { recursive: true });
  const script = `
import json, sys, traceback
debug_enabled = ${DEBUG ? "True" : "False"}
def debug(payload):
    if debug_enabled:
        print(json.dumps(payload), file=sys.stderr)
try:
    import faiss
    import numpy as np
except Exception as exc:
    debug({"debug_event": "faiss_import_error", "error_name": exc.__class__.__name__, "error_message": str(exc)})
    raise
index_path, query_path, top_k = sys.argv[1], sys.argv[2], int(sys.argv[3])
debug({"debug_event": "before_faiss_load", "index_path": index_path, "top_k": top_k})
try:
    index = faiss.read_index(index_path)
except Exception as exc:
    debug({
        "debug_event": "faiss_load_error",
        "error_name": exc.__class__.__name__,
        "error_message": str(exc),
        "error_stack": traceback.format_exc(),
    })
    raise
index_vectors = index.ntotal if hasattr(index, "ntotal") else None
debug({"debug_event": "after_faiss_load", "index_vectors": index_vectors})
with open(query_path, "r", encoding="utf-8") as handle:
    vector = json.load(handle)
arr = np.array([vector], dtype="float32")
if arr.ndim != 2 or arr.shape[1] != ${EMBEDDING_DIM}:
    raise SystemExit(f"Invalid query vector shape: {arr.shape}")
faiss.normalize_L2(arr)
try:
    scores, ids = index.search(arr, top_k)
except Exception as exc:
    debug({
        "debug_event": "faiss_search_error",
        "error_name": exc.__class__.__name__,
        "error_message": str(exc),
        "error_stack": traceback.format_exc(),
    })
    raise
result = {"scores": scores[0].tolist(), "ids": ids[0].tolist(), "index_vectors": index_vectors}
print(json.dumps(result))
`;
  try {
    await fs.copyFile(indexPath, tempIndexPath);
    await fs.writeFile(queryPath, JSON.stringify(queryEmbedding), "utf-8");
    debugLog("faiss_search_start", {
      topK,
      indexPath,
      tempDir,
      tempIndexPath,
      queryPath,
      embedding_dim: queryEmbedding.length,
      embedding_first_3_values: queryEmbedding.slice(0, 3),
    });
    const result = spawnSync("python3", ["-c", script, tempIndexPath, queryPath, String(topK)], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    debugLog("faiss_spawn_result", {
      status: result.status,
      signal: result.signal,
      error: errorPayload(result.error),
      stdout_chars: result.stdout?.length || 0,
      stderr_chars: result.stderr?.length || 0,
      stdout_preview: result.stdout?.slice(0, 2000) || null,
      stderr_preview: result.stderr?.slice(0, 4000) || null,
    });
    if (result.error) {
      debugLog("faiss_spawn_error", errorPayload(result.error));
    }
    if (result.status !== 0) {
      debugLog("faiss_search_failed", {
        error: errorPayload(result.error),
        status: result.status,
        signal: result.signal,
        stdout: result.stdout || null,
        stderr: result.stderr || null,
      });
      throw new Error(`FAISS search failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout);
    debugLog("faiss_search_result", {
      topK,
      raw_shape: {
        scores_is_array: Array.isArray(parsed.scores),
        ids_is_array: Array.isArray(parsed.ids),
      },
      scores_count: parsed.scores?.length || 0,
      ids_count: parsed.ids?.length || 0,
      index_vectors: parsed.index_vectors ?? null,
    });
    return parsed;
  } catch (err) {
    debugLog("faiss_search_throw", errorPayload(err));
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sourceMetadata(metadata = {}) {
  return {
    source_id: metadata.source_id || null,
    source_file: metadata.source_file || null,
    cleaned_file: metadata.cleaned_file || null,
    source_type: metadata.source_type || null,
    quality_label: metadata.quality_label || null,
    quality_score: metadata.quality_score ?? null,
    recommended_action: metadata.recommended_action || null,
    chunk_index: metadata.chunk_index ?? null,
    session_id: metadata.session_id || null,
  };
}

export async function retrieve(kb, query, topK) {
  debugLog("retrieve_start", {
    cwd: process.cwd(),
    node_env: process.env.NODE_ENV || null,
    kb_id: kb,
    topK,
  });
  const loaded = await loadProductionKb(kb);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for query embeddings.");

  const queryEmbedding = await embedQuery(query, apiKey);
  const search = await searchFaiss(loaded.paths.faissIndex, queryEmbedding, topK);
  const productionVersion = loaded.productionManifest.new_production_version || loaded.productionManifest.production_version || null;
  const results = [];

  search.ids.forEach((vectorId, index) => {
    if (vectorId < 0 || vectorId >= loaded.docstore.length) return;
    const row = loaded.docstore[vectorId];
    results.push({
      rank: results.length + 1,
      score: Number(search.scores[index]),
      vector_id: vectorId,
      chunk_id: row.chunk_id,
      text: row.text,
      metadata: row.metadata || {},
      source: sourceMetadata(row.metadata || {}),
      kb_id: kb,
      production_version: productionVersion,
    });
  });

  debugLog("search_mapping", {
    kb_id: kb,
    topK,
    docstore_rows_count: loaded.docstore.length,
    index_vectors_count: loaded.indexManifest.vectors,
    scores_count: search.scores?.length || 0,
    ids_count: search.ids?.length || 0,
    result_count: results.length,
  });

  return {
    type: "production_kb_retrieval",
    generated_at: nowIso(),
    query,
    kb_id: kb,
    production_version: productionVersion,
    topK,
    result_count: results.length,
    embedding_model: EMBEDDING_MODEL,
    manifest_info: {
      promote_id: loaded.productionManifest.promote_id || null,
      promoted_at: loaded.productionManifest.promoted_at || null,
      source_candidate_id: loaded.productionManifest.source_candidate_id || null,
      manifest_schema_version: loaded.productionManifest.manifest_schema_version || null,
      manifest_path: repoRelative(loaded.paths.productionManifest),
      index_generated_at: loaded.indexManifest.generated_at || null,
      index_vectors: loaded.indexManifest.vectors,
    },
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  const result = await retrieve(args.kb, args.query.trim(), args.topK || DEFAULT_TOP_K);
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exit(1);
  });
}
