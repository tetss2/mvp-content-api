import { createHash } from "crypto";
import { mkdirSync, promises as fs } from "fs";
import { spawnSync } from "child_process";
import os from "os";
import { dirname, isAbsolute, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const INDEX_ROOT = join(ROOT, "knowledge_indexes");
const SESSIONS_DIR = join(ROOT, "knowledge_intake", "sessions");

const KNOWN_KBS = new Set(["psychologist", "sexologist"]);
const EMBEDDING_DIM = 1536;
const SUPPORTED_MANIFEST_SCHEMA_VERSIONS = new Set([1]);

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

function pathsFor(kb, candidateId = null) {
  const base = join(INDEX_ROOT, kb);
  const productionRoot = join(base, "production");
  return {
    base,
    stagingRoot: join(base, "staging"),
    candidate: candidateId ? join(base, "staging", candidateId) : null,
    productionRoot,
    promoteLock: join(productionRoot, ".promote.lock"),
    current: join(productionRoot, "current"),
    backups: join(productionRoot, "backups"),
    manifests: join(productionRoot, "manifests"),
    promoteTmp: join(base, "promote_tmp"),
    reports: join(base, "reports"),
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

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf-8"));
}

async function writeJson(path, value) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

async function readJsonlRows(path) {
  const raw = await fs.readFile(path, "utf-8");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function readFaissCount(indexPath) {
  const tempFaissDir = join(os.tmpdir(), "mvp-content-api-faiss", timestampId());
  const tempIndexPath = join(tempFaissDir, "faiss.index");
  mkdirSync(tempFaissDir, { recursive: true });
  const script = `
import faiss, sys
index = faiss.read_index(sys.argv[1])
print(index.ntotal)
`;
  try {
    await fs.copyFile(indexPath, tempIndexPath);
    const result = spawnSync("python", ["-c", script, tempIndexPath], { cwd: ROOT, encoding: "utf-8" });
    if (result.status !== 0) throw new Error(`FAISS validation failed: ${result.stderr || result.stdout}`);
    return Number(result.stdout.trim());
  } finally {
    await fs.rm(tempFaissDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {
    kb: null,
    candidate: null,
    dryRun: false,
    promote: false,
    rollbackLatest: false,
    validateProduction: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--kb") args.kb = argv[++i];
    else if (arg === "--candidate" || arg === "--session") args.candidate = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--promote") args.promote = true;
    else if (arg === "--rollback-latest") args.rollbackLatest = true;
    else if (arg === "--validate-production") args.validateProduction = true;
  }
  return args;
}

function validateArgs(args) {
  if (!args.kb) throw new Error("Missing required --kb.");
  if (!KNOWN_KBS.has(args.kb)) throw new Error(`Unknown kb "${args.kb}". Expected: psychologist or sexologist.`);
  const modes = [args.dryRun, args.promote, args.rollbackLatest, args.validateProduction].filter(Boolean).length;
  if (modes !== 1) throw new Error("Choose exactly one mode: --dry-run, --promote, --rollback-latest, or --validate-production.");
  if ((args.dryRun || args.promote) && !args.candidate) throw new Error("Promote requires --candidate <staging_id>.");
}

async function ensurePromoteDirs(kb) {
  const paths = pathsFor(kb);
  await fs.mkdir(paths.productionRoot, { recursive: true });
  await fs.mkdir(paths.backups, { recursive: true });
  await fs.mkdir(paths.manifests, { recursive: true });
  await fs.mkdir(paths.promoteTmp, { recursive: true });
}

async function acquirePromoteLock(kb, operation) {
  const paths = pathsFor(kb);
  const lock = {
    operation,
    pid: process.pid,
    created_at: nowIso(),
  };
  try {
    await fs.writeFile(paths.promoteLock, JSON.stringify(lock, null, 2), { encoding: "utf-8", flag: "wx" });
    return paths.promoteLock;
  } catch (err) {
    if (err.code === "EEXIST") {
      throw new Error(`Promote lock exists: ${repoRelative(paths.promoteLock)}. Another promote/rollback may be running.`);
    }
    throw err;
  }
}

async function releasePromoteLock(lockPath) {
  if (lockPath) await fs.rm(lockPath, { force: true });
}

function isInside(child, parent) {
  const rel = relative(parent, child);
  return rel && !rel.startsWith("..") && !isAbsolute(rel);
}

function assertCandidatePath(kb, candidatePath) {
  const paths = pathsFor(kb);
  if (!isInside(candidatePath, paths.stagingRoot)) {
    throw new Error(`Candidate must be inside staging: ${repoRelative(candidatePath)}`);
  }
}

function countCriticalQualityErrors(ingestionManifest) {
  const explicit = ingestionManifest.critical_quality_errors;
  if (Array.isArray(explicit)) return explicit.length;
  const qualityErrors = ingestionManifest.quality_errors;
  if (Array.isArray(qualityErrors)) {
    return qualityErrors.filter((item) => String(item.severity || "").toLowerCase() === "critical").length;
  }
  return 0;
}

async function validateIndexDir(indexDir, options = {}) {
  const errors = [];
  const warnings = [];
  const indexPath = join(indexDir, "faiss.index");
  const docstorePath = join(indexDir, "docstore.jsonl");
  const indexManifestPath = join(indexDir, "index_manifest.json");
  const ingestionManifestPath = join(indexDir, "ingestion_manifest.json");

  for (const required of [indexPath, docstorePath, indexManifestPath]) {
    if (!(await exists(required))) errors.push(`Missing ${repoRelative(required)}`);
  }
  if (options.requireIngestionManifest && !(await exists(ingestionManifestPath))) {
    errors.push(`Missing ${repoRelative(ingestionManifestPath)}`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  const indexManifest = await readJson(indexManifestPath);
  const ingestionManifest = (await exists(ingestionManifestPath)) ? await readJson(ingestionManifestPath) : null;
  const rows = await readJsonlRows(docstorePath);
  const faissCount = await readFaissCount(indexPath);
  const schemaVersion = Number(indexManifest.manifest_schema_version || indexManifest.schema_version || 1);
  const chunkIds = new Set();
  const sourceIds = new Set();
  let duplicateChunkIds = 0;
  let emptyChunks = 0;
  let badEmbeddingDim = false;
  let badVectorId = false;

  rows.forEach((row, index) => {
    if (row.vector_id !== index) badVectorId = true;
    if (!row.text || !row.text.trim()) emptyChunks += 1;
    if (chunkIds.has(row.chunk_id)) duplicateChunkIds += 1;
    chunkIds.add(row.chunk_id);
    if (row.metadata?.source_id) sourceIds.add(row.metadata.source_id);
    if (row.embedding_dim !== EMBEDDING_DIM || row.metadata?.embedding_dim !== EMBEDDING_DIM) badEmbeddingDim = true;
  });

  if (!SUPPORTED_MANIFEST_SCHEMA_VERSIONS.has(schemaVersion)) {
    errors.push(`Unsupported manifest schema version ${schemaVersion}. Supported: ${[...SUPPORTED_MANIFEST_SCHEMA_VERSIONS].join(", ")}`);
  }
  if (!indexManifest.index_type || indexManifest.index_type !== "faiss.IndexFlatIP") errors.push(`Unsupported index_type: ${indexManifest.index_type}`);
  if (indexManifest.embedding_dim !== EMBEDDING_DIM) errors.push(`index_manifest embedding_dim ${indexManifest.embedding_dim} != ${EMBEDDING_DIM}`);
  if (indexManifest.vectors !== rows.length) errors.push(`index_manifest vectors ${indexManifest.vectors} != docstore rows ${rows.length}`);
  if (faissCount !== rows.length) errors.push(`FAISS vectors count ${faissCount} != docstore rows ${rows.length}`);
  if (duplicateChunkIds) errors.push(`Duplicate chunk_id found: ${duplicateChunkIds}`);
  if (emptyChunks) errors.push(`Empty chunks found: ${emptyChunks}`);
  if (badEmbeddingDim) errors.push("One or more docstore rows have invalid embedding_dim.");
  if (badVectorId) errors.push("One or more docstore rows have non-sequential vector_id.");

  if (ingestionManifest) {
    if (ingestionManifest.kb_id && indexManifest.kb_id && ingestionManifest.kb_id !== indexManifest.kb_id) {
      errors.push(`kb_id mismatch: ingestion=${ingestionManifest.kb_id}, index=${indexManifest.kb_id}`);
    }
    if (ingestionManifest.session_id && indexManifest.session_id && ingestionManifest.session_id !== indexManifest.session_id) {
      errors.push(`session_id mismatch: ingestion=${ingestionManifest.session_id}, index=${indexManifest.session_id}`);
    }
    const summary = ingestionManifest.summary || {};
    if (typeof summary.planned_chunks === "number" && summary.planned_chunks !== rows.length) {
      errors.push(`ingestion_manifest planned_chunks ${summary.planned_chunks} != docstore rows ${rows.length}`);
    }
    if (typeof summary.planned_sources === "number" && summary.planned_sources !== sourceIds.size) {
      errors.push(`ingestion_manifest planned_sources ${summary.planned_sources} != docstore unique sources ${sourceIds.size}`);
    }
    const criticalQualityErrors = countCriticalQualityErrors(ingestionManifest);
    if (criticalQualityErrors > 0) errors.push(`Critical quality errors found: ${criticalQualityErrors}`);
    if (ingestionManifest.safeguards?.wrote_only_staging !== true) {
      warnings.push("ingestion_manifest does not confirm wrote_only_staging=true.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    faiss_vectors: faissCount,
    docstore_rows: rows.length,
    source_files: sourceIds.size,
    embedding_dim: indexManifest.embedding_dim,
    index_manifest: indexManifest,
    ingestion_manifest: ingestionManifest,
    content_hash: sha1(JSON.stringify({
      chunk_ids: [...chunkIds].sort(),
      vectors: indexManifest.vectors,
      embedding_dim: indexManifest.embedding_dim,
    })),
  };
}

async function validateCandidate(kb, candidateId) {
  const paths = pathsFor(kb, candidateId);
  const candidatePath = resolvePath(paths.candidate);
  assertCandidatePath(kb, candidatePath);
  if (!(await exists(candidatePath))) throw new Error(`Candidate index not found: ${repoRelative(candidatePath)}`);
  const validation = await validateIndexDir(candidatePath, { requireIngestionManifest: true });
  if (validation.index_manifest?.kb_id && validation.index_manifest.kb_id !== kb) {
    validation.ok = false;
    validation.errors.push(`Candidate kb_id ${validation.index_manifest.kb_id} != --kb ${kb}`);
  }
  const validationStatus = await loadCandidateValidationStatus(kb, candidateId);
  validation.validation_status = validationStatus;
  if (!validationStatus.ok) {
    validation.ok = false;
    validation.errors.push(validationStatus.error);
  }
  const { session } = await loadSession(candidateId);
  if (session && session.status !== "ingestion_staged") {
    validation.ok = false;
    validation.errors.push(`Candidate session status must be ingestion_staged, got ${session.status}`);
  }
  return { candidatePath, validation };
}

async function loadCandidateValidationStatus(kb, candidateId) {
  const reportsDir = pathsFor(kb).reports;
  const candidateReports = [
    join(reportsDir, `${candidateId}_ingestion_validate_staging.json`),
    join(reportsDir, `${candidateId}_ingestion_apply.json`),
  ];
  for (const reportPath of candidateReports) {
    if (!(await exists(reportPath))) continue;
    const report = await readJson(reportPath);
    if (report.validation?.ok === true) {
      return { ok: true, source: repoRelative(reportPath), checked_at: report.generated_at || null };
    }
    return {
      ok: false,
      source: repoRelative(reportPath),
      error: `Candidate validation report is not successful: ${repoRelative(reportPath)}`,
    };
  }
  return {
    ok: false,
    source: null,
    error: `Missing successful candidate validation report for ${candidateId}`,
  };
}

async function loadSession(candidateId) {
  const sessionPath = join(SESSIONS_DIR, `${candidateId}.json`);
  if (!(await exists(sessionPath))) return { sessionPath, session: null };
  return { sessionPath, session: await readJson(sessionPath) };
}

async function currentVersion(kb) {
  const currentManifestPath = join(pathsFor(kb).current, "production_manifest.json");
  if (!(await exists(currentManifestPath))) return null;
  const manifest = await readJson(currentManifestPath);
  return manifest.new_production_version || manifest.production_version || null;
}

async function isNonEmptyDir(path) {
  if (!(await exists(path))) return false;
  const entries = await fs.readdir(path).catch(() => []);
  return entries.length > 0;
}

async function copyDir(src, dest) {
  await fs.mkdir(dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true, force: false, errorOnExist: true });
}

async function backupCurrent(kb, promoteId) {
  const paths = pathsFor(kb);
  if (!(await isNonEmptyDir(paths.current))) return null;
  const backupPath = join(paths.backups, `${promoteId}_previous`);
  await copyDir(paths.current, backupPath);
  const backupValidation = await validateIndexDir(backupPath, { requireIngestionManifest: false });
  if (!backupValidation.ok) {
    throw new Error(`Backup validation failed: ${backupValidation.errors.join("; ")}`);
  }
  return { backupPath, backupValidation };
}

async function atomicSwapIntoCurrent(kb, incomingPath) {
  const paths = pathsFor(kb);
  const swapOldPath = join(paths.promoteTmp, `swap_old_${timestampId()}`);
  const currentExists = await exists(paths.current);
  if (currentExists) await fs.rename(paths.current, swapOldPath);
  try {
    await fs.mkdir(paths.productionRoot, { recursive: true });
    await fs.rename(incomingPath, paths.current);
    return {
      oldProductionPath: currentExists ? swapOldPath : null,
    };
  } catch (err) {
    if (await exists(paths.current)) {
      await fs.rm(paths.current, { recursive: true, force: true });
    }
    if (await exists(swapOldPath)) await fs.rename(swapOldPath, paths.current);
    throw err;
  }
}

async function rollbackFromOldProduction(kb, oldProductionPath, promoteId) {
  const paths = pathsFor(kb);
  if (!oldProductionPath || !(await exists(oldProductionPath))) {
    return { attempted: false, ok: false, reason: "old_production_missing" };
  }
  const failedCurrentPath = join(paths.promoteTmp, `${promoteId}_failed_current_${timestampId()}`);
  try {
    if (await exists(paths.current)) await fs.rename(paths.current, failedCurrentPath);
    await fs.rename(oldProductionPath, paths.current);
    const validation = await validateIndexDir(paths.current, { requireIngestionManifest: false });
    return {
      attempted: true,
      ok: validation.ok,
      restored_from: repoRelative(oldProductionPath),
      failed_current_path: repoRelative(failedCurrentPath),
      validation,
    };
  } catch (err) {
    if (!(await exists(oldProductionPath)) && await exists(paths.current)) {
      await fs.rename(paths.current, oldProductionPath).catch(() => {});
    }
    if (!(await exists(paths.current)) && await exists(failedCurrentPath)) {
      await fs.rename(failedCurrentPath, paths.current).catch(() => {});
    }
    return {
      attempted: true,
      ok: false,
      restored_from: repoRelative(oldProductionPath),
      failed_current_path: repoRelative(failedCurrentPath),
      error: err.message,
    };
  }
}

async function rollbackFromBackup(kb, backupPath, promoteId) {
  const paths = pathsFor(kb);
  if (!backupPath || !(await exists(backupPath))) {
    return { attempted: false, ok: false, reason: "backup_missing" };
  }
  const incomingRollback = join(paths.promoteTmp, `${promoteId}_rollback_incoming`);
  await fs.rm(incomingRollback, { recursive: true, force: true });
  await copyDir(backupPath, incomingRollback);
  const swap = await atomicSwapIntoCurrent(kb, incomingRollback);
  const validation = await validateIndexDir(paths.current, { requireIngestionManifest: false });
  return {
    attempted: true,
    ok: validation.ok,
    backup_path: repoRelative(backupPath),
    old_production_path: swap.oldProductionPath ? repoRelative(swap.oldProductionPath) : null,
    validation,
  };
}

async function writePromoteManifest(kb, manifest) {
  const paths = pathsFor(kb);
  const manifestPath = join(paths.manifests, `${manifest.promote_id}.json`);
  await writeJson(manifestPath, manifest);
  if (manifest.status === "promoted" || manifest.status === "rollback_completed") {
    await writeJson(join(paths.current, "production_manifest.json"), manifest);
  }
  return repoRelative(manifestPath);
}

function printResult(result) {
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

async function dryRunPromote(kb, candidateId) {
  console.error(`[promote:dry-run] Checking candidate ${candidateId} for ${kb}`);
  const { candidatePath, validation } = await validateCandidate(kb, candidateId);
  const result = {
    type: "promote_dry_run",
    kb_id: kb,
    source_candidate_id: candidateId,
    candidate_path: repoRelative(candidatePath),
    generated_at: nowIso(),
    would_write_production: false,
    validation,
  };
  if (!validation.ok) {
    throw new Error(`Dry-run failed: ${validation.errors.join("; ")}`);
  }
  console.error("[promote:dry-run] Candidate is valid. Production was not modified.");
  return result;
}

async function promoteCandidate(kb, candidateId) {
  const promoteId = `promote_${timestampId()}_${candidateId}`;
  const newProductionVersion = `prod_${timestampId()}`;
  const paths = pathsFor(kb, candidateId);
  let backup = null;
  let manifest = null;
  let lockPath = null;
  let swap = { oldProductionPath: null };
  let validation = null;
  let previousProductionVersion = null;

  lockPath = await acquirePromoteLock(kb, "promote");
  const incomingPath = join(paths.promoteTmp, `${promoteId}_incoming`);
  try {
    console.error(`[promote] ${promoteId}: validating candidate ${candidateId}`);
    const candidateResult = await validateCandidate(kb, candidateId);
    const candidatePath = candidateResult.candidatePath;
    validation = candidateResult.validation;
    if (!validation.ok) throw new Error(`Candidate validation failed: ${validation.errors.join("; ")}`);

    previousProductionVersion = await currentVersion(kb);
    await fs.rm(incomingPath, { recursive: true, force: true });

    console.error("[promote] Copying candidate to isolated promote temp directory");
    await copyDir(candidatePath, incomingPath);
    const incomingValidation = await validateIndexDir(incomingPath, { requireIngestionManifest: true });
    if (!incomingValidation.ok) throw new Error(`Promote temp validation failed: ${incomingValidation.errors.join("; ")}`);

    console.error("[promote] Creating timestamped backup of current production");
    backup = await backupCurrent(kb, promoteId);

    console.error("[promote] Performing atomic swap");
    swap = await atomicSwapIntoCurrent(kb, incomingPath);

    console.error("[promote] Running post-promote validation");
    const postValidation = await validateIndexDir(paths.current, { requireIngestionManifest: true });
    if (!postValidation.ok) {
      const rollback = await rollbackFromOldProduction(kb, swap.oldProductionPath, promoteId);
      manifest = {
        manifest_schema_version: 1,
        status: rollback.ok ? "rolled_back" : "rollback_failed",
        promote_id: promoteId,
        promoted_at: nowIso(),
        source_candidate_id: candidateId,
        previous_production_version: previousProductionVersion,
        new_production_version: newProductionVersion,
        backup_path: backup ? repoRelative(backup.backupPath) : null,
        old_production_path: swap.oldProductionPath ? repoRelative(swap.oldProductionPath) : null,
        validation_result: { pre_promote: validation, post_promote: postValidation },
        rollback_status: rollback,
      };
      manifest.manifest_path = await writePromoteManifest(kb, manifest);
      throw new Error(`Post-promote validation failed and rollback was attempted: ${postValidation.errors.join("; ")}`);
    }

    const { sessionPath, session } = await loadSession(candidateId);
    if (session) {
      session.status = "ingestion_promoted";
      session.promoted_at = nowIso();
      session.production_index_dir = repoRelative(paths.current);
      session.updated_at = session.promoted_at;
      await writeJson(sessionPath, session);
    }

    manifest = {
      manifest_schema_version: 1,
      status: "promoted",
      promote_id: promoteId,
      promoted_at: nowIso(),
      source_candidate_id: candidateId,
      previous_production_version: previousProductionVersion,
      new_production_version: newProductionVersion,
      backup_path: backup ? repoRelative(backup.backupPath) : null,
      old_production_path: swap.oldProductionPath ? repoRelative(swap.oldProductionPath) : null,
      validation_result: {
        pre_promote: validation,
        promote_temp: incomingValidation,
        post_promote: postValidation,
      },
      rollback_status: { attempted: false, ok: null },
    };
    manifest.manifest_path = await writePromoteManifest(kb, manifest);
    if (swap.oldProductionPath) {
      try {
        await fs.rm(swap.oldProductionPath, { recursive: true, force: true });
        manifest.old_production_cleanup = { attempted: true, ok: true };
      } catch (cleanupErr) {
        manifest.old_production_cleanup = { attempted: true, ok: false, error: cleanupErr.message };
      }
      await writePromoteManifest(kb, manifest);
    }
    console.error(`[promote] Success. Production version: ${newProductionVersion}`);
    return manifest;
  } catch (err) {
    await fs.rm(incomingPath, { recursive: true, force: true });
    if (!manifest) {
      manifest = {
        manifest_schema_version: 1,
        status: "failed",
        promote_id: promoteId,
        promoted_at: nowIso(),
        source_candidate_id: candidateId,
        previous_production_version: previousProductionVersion,
        new_production_version: newProductionVersion,
        backup_path: backup ? repoRelative(backup.backupPath) : null,
        old_production_path: swap.oldProductionPath ? repoRelative(swap.oldProductionPath) : null,
        validation_result: { pre_promote: validation },
        rollback_status: { attempted: false, ok: null },
        error: err.message,
      };
      manifest.manifest_path = await writePromoteManifest(kb, manifest);
    }
    throw err;
  } finally {
    await releasePromoteLock(lockPath);
  }
}

async function validateProduction(kb) {
  const paths = pathsFor(kb);
  console.error(`[production:validate] Validating ${repoRelative(paths.current)}`);
  if (!(await exists(paths.current))) throw new Error(`Production current not found: ${repoRelative(paths.current)}`);
  const validation = await validateIndexDir(paths.current, { requireIngestionManifest: true });
  return {
    type: "production_validation",
    kb_id: kb,
    generated_at: nowIso(),
    production_path: repoRelative(paths.current),
    validation,
  };
}

async function latestPromoteManifest(kb) {
  const paths = pathsFor(kb);
  if (!(await exists(paths.manifests))) throw new Error(`No promote manifests found: ${repoRelative(paths.manifests)}`);
  const entries = (await fs.readdir(paths.manifests))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse();
  for (const entry of entries) {
    const manifest = await readJson(join(paths.manifests, entry));
    if (manifest.status === "promoted" && manifest.backup_path) return manifest;
  }
  throw new Error("No promoted manifest with a backup_path found.");
}

async function rollbackLatest(kb) {
  const lockPath = await acquirePromoteLock(kb, "rollback_latest");
  try {
    const manifest = await latestPromoteManifest(kb);
    const rollbackId = `rollback_${timestampId()}_${manifest.promote_id}`;
    const backupPath = resolvePath(manifest.backup_path);
    console.error(`[rollback] Rolling back ${kb} from ${repoRelative(backupPath)}`);
    const rollback = await rollbackFromBackup(kb, backupPath, rollbackId);
    if (!rollback.ok) throw new Error(`Rollback failed: ${rollback.reason || rollback.validation?.errors?.join("; ")}`);
    const rollbackManifest = {
      manifest_schema_version: 1,
      status: "rollback_completed",
      promote_id: rollbackId,
      promoted_at: nowIso(),
      source_candidate_id: manifest.source_candidate_id,
      previous_production_version: manifest.new_production_version,
      new_production_version: manifest.previous_production_version,
      backup_path: manifest.backup_path,
      validation_result: { post_rollback: rollback.validation },
      rollback_status: rollback,
      rolled_back_promote_id: manifest.promote_id,
    };
    rollbackManifest.manifest_path = await writePromoteManifest(kb, rollbackManifest);
    return rollbackManifest;
  } finally {
    await releasePromoteLock(lockPath);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);
  await ensurePromoteDirs(args.kb);

  let result;
  if (args.dryRun) result = await dryRunPromote(args.kb, args.candidate);
  else if (args.promote) result = await promoteCandidate(args.kb, args.candidate);
  else if (args.rollbackLatest) result = await rollbackLatest(args.kb);
  else if (args.validateProduction) result = await validateProduction(args.kb);

  printResult(result);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
