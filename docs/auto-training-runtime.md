# Auto Training Runtime

Automatic expert training is a lightweight runtime pipeline for user-created experts. It keeps Dinara on the existing production retrieval path and does not introduce database migrations, Redis, BullMQ, microservices, or production index promotion.

## Flow

1. Admin/full_access user runs `/kb_attach`.
2. The next TXT, MD, PDF, or DOCX file is saved under `runtime_data/expert_sources/<expertId>/`.
3. The file is registered in `runtime_data/expert_kb_registry.json` as `pending`.
4. For non-Dinara runtime experts, the file is automatically moved to `queued`.
5. The in-memory ingestion worker processes one job at a time.
6. On success, `runtime_data/expert_indexes/<expertId>/` is rebuilt and marked retrieval-ready.

Dinara (`expertId: dinara`) is protected. Attached files can be registered, but automatic runtime ingestion is skipped so the old Supabase/articles production retrieval path stays unchanged.

## Statuses

Files move through:

- `pending`
- `queued`
- `cleaning`
- `chunking`
- `embedding`
- `indexing`
- `completed`
- `failed`

Telegram progress messages are sent at queueing, cleaning, chunking, embedding, indexing, completion, retry, and final failure.

## Worker

The worker is intentionally process-local:

- concurrency: `1`
- processing: sequential
- queue storage: in-memory `Map`
- timeout: `INGESTION_RUNTIME_TIMEOUT_MS`, default `180000`
- retries: `INGESTION_RUNTIME_MAX_RETRIES`, default `2`
- retry delay: `INGESTION_RUNTIME_RETRY_DELAY_MS`, default `30000`

This is enough for the paid beta runtime without adding external infrastructure.

## Commands

- `/kb_attach` saves a file and automatically queues ingestion for non-Dinara runtime experts.
- `/ingest_status` shows file status, indexed files, failed files, chunks, embeddings, and retrieval readiness.
- `/ingest_queue` shows queued, running, retry-wait, completed, and failed in-memory jobs.
- `/ingest_run` manually queues pending files for the active runtime expert.
- `/retry_failed` moves failed files for the active runtime expert back to pending and queues them again. Admin/full_access only.
- `/runtime_metrics` shows experts count, KB files, indexed experts, queue size, active jobs, failed jobs, total chunks, and total embeddings. Admin/full_access only.

## Retrieval

Generation checks the active runtime expert. If it is not Dinara and its runtime KB is retrieval-ready, the bot automatically retrieves from:

```text
runtime_data/expert_indexes/<expertId>/
```

If the runtime index is missing or unavailable, generation falls back to the runtime expert profile and explicitly avoids Dinara-specific identity, voice, examples, and claims.

For Dinara, the existing retrieval path remains unchanged:

- psychologist: Supabase/vector fallback plus articles fallback;
- sexologist: production FAISS retrieval and legacy fallback.

## Validation

Run:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
node --check knowledge_ingest.js
node --check knowledge_retrieval.js
```
