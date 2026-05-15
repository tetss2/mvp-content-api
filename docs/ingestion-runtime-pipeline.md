# Ingestion Runtime Pipeline

Lightweight runtime ingestion lets an admin or full-access user index files attached to the active runtime expert without changing Dinara production retrieval, Supabase vector retrieval, or the promoted `knowledge_indexes/*/production/current` indexes.

## Commands

- `/ingest_status` shows the active expert, pending files, indexed files, failed files, retrieval readiness, chunk count, embedding count, and last ingest date.
- `/ingest_queue` shows in-memory ingestion jobs for this bot process.
- `/ingest_run` starts ingestion for the active expert. It is admin/full_access only.

Dinara (`expertId: dinara`) is protected: `/ingest_run` does not run for her because she keeps using the existing production retrieval path.

## States

Each pending file moves through:

1. `pending`
2. `cleaning`
3. `chunking`
4. `embedding`
5. `indexing`
6. `completed`
7. `failed`

The registry also keeps aggregate fields per expert:

- `ingestStatus`
- `indexed`
- `retrievalReady`
- `chunksCount`
- `embeddingCount`
- `lastIngestAt`

## Files

Runtime source files are stored by `/kb_attach` under:

```text
runtime_data/expert_sources/<expertId>/
```

Runtime indexes are written to:

```text
runtime_data/expert_indexes/<expertId>/
```

Each index directory contains:

- `faiss.index`
- `docstore.jsonl`
- `vectors.jsonl`
- `index_manifest.json`
- `ingestion_manifest.json`

The registry is updated at:

```text
runtime_data/expert_kb_registry.json
```

## Retrieval Isolation

If the active expert is `dinara`, generation keeps the existing Dinara retrieval behavior.

If the active expert is not `dinara`, generation first tries the runtime FAISS index under `runtime_data/expert_indexes/<expertId>/`. If no runtime index is ready or retrieval fails, generation falls back to the runtime expert profile only and explicitly avoids Dinara identity, examples, voice, and claims.

## Protection

- No vector DB rewrite.
- No Redis.
- No database migration.
- No production/main index promotion.
- Ingestion has a timeout (`INGESTION_RUNTIME_TIMEOUT_MS`, default 180 seconds).
- Runtime retrieval has a timeout (`RUNTIME_RETRIEVAL_TIMEOUT_MS`, default 8 seconds).
- Failed ingestion marks pending files as `failed` with `ingestError`.
