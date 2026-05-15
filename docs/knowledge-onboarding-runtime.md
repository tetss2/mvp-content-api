# Knowledge Onboarding Runtime

Lightweight runtime layer for attaching knowledge files to the currently active expert without changing the production retrieval pipeline.

## Scope

This runtime is intentionally minimal:

- uploads expert source files from Telegram;
- stores per-file metadata;
- records ingest status in a JSON registry;
- exposes status/list/source commands.

It does not run ingestion automatically, does not create database migrations, and does not rewrite vector retrieval.

## Commands

`/kb_attach`

Admin/full_access only. Puts the chat into attach mode. The next TXT, MD, PDF or DOCX document is saved for the active runtime expert.

Files are stored in:

```text
runtime_data/expert_sources/<expertId>/
```

Each upload starts with:

```text
ingestStatus: pending
kbType: runtime_onboarding
```

`/kb_status`

Shows the active expert, attached file count, indexed yes/no, retrieval ready yes/no, and status counts.

`/kb_list`

Shows attached files for the current active expert with ingest status, size and upload date.

`/kb_active`

Shows the retrieval source currently used for the active expert.

For Dinara, this stays the existing production retrieval path. Attached runtime files are not used until a future ingestion pipeline marks files as indexed and connects them to retrieval.

## Registry

Runtime registry path:

```text
runtime_data/expert_kb_registry.json
```

Shape:

```json
{
  "version": 1,
  "experts": [
    {
      "expertId": "dinara",
      "kbType": "production_dinara",
      "files": [],
      "createdAt": "2026-05-15T00:00:00.000Z",
      "updatedAt": "2026-05-15T00:00:00.000Z"
    }
  ],
  "updatedAt": "2026-05-15T00:00:00.000Z"
}
```

File statuses reserved for future ingestion:

- `pending`
- `processing`
- `indexed`
- `failed`

## Dinara Safety

The generation path is not changed. Dinara still uses the existing psychologist/sexologist retrieval behavior:

- Supabase/vector retrieval where configured;
- legacy vector fallback;
- `articles.production.json` fallback for psychologist content.

Runtime uploads only prepare source files and metadata for a future ingestion pipeline.
