# Production Promote Pipeline

This project keeps ingestion and production promotion separate.

Ingestion builds and validates candidate indexes only under:

```text
knowledge_indexes/<kb>/staging/<candidate_id>/
```

The promote script is the only supported writer for production:

```text
knowledge_indexes/<kb>/production/current/
```

## Files

Candidate index:

```text
knowledge_indexes/<kb>/staging/<candidate_id>/faiss.index
knowledge_indexes/<kb>/staging/<candidate_id>/docstore.jsonl
knowledge_indexes/<kb>/staging/<candidate_id>/vectors.jsonl
knowledge_indexes/<kb>/staging/<candidate_id>/index_manifest.json
knowledge_indexes/<kb>/staging/<candidate_id>/ingestion_manifest.json
```

Production index:

```text
knowledge_indexes/<kb>/production/current/faiss.index
knowledge_indexes/<kb>/production/current/docstore.jsonl
knowledge_indexes/<kb>/production/current/index_manifest.json
knowledge_indexes/<kb>/production/current/ingestion_manifest.json
knowledge_indexes/<kb>/production/current/production_manifest.json
knowledge_indexes/<kb>/production/.promote.lock
```

Promote metadata and backups:

```text
knowledge_indexes/<kb>/production/backups/<promote_id>_previous/
knowledge_indexes/<kb>/production/manifests/<promote_id>.json
knowledge_indexes/<kb>/promote_tmp/
```

`promote_tmp` is outside production and is used for isolated copy validation before the final swap.

## Dry Run

Dry-run validates the candidate and does not write production.

```bash
npm run kb:promote:dry -- --kb psychologist --candidate ki_1778536279894_d2be4064
```

The check requires:

- candidate directory exists
- `faiss.index`, `docstore.jsonl`, `index_manifest.json`, and `ingestion_manifest.json` exist
- FAISS vector count equals docstore rows
- manifest chunk counts match docstore rows
- planned source count matches unique source ids
- embedding dimension is supported
- manifest schema version is compatible
- critical quality errors are absent
- session status is `ingestion_staged`
- a successful `ingestion_apply` or `ingestion_validate_staging` report exists

## Promote

Production promote validates the candidate, copies it into an isolated promote temp directory, validates that copy, backs up current production, then swaps the temp directory into `production/current`.

```bash
npm run kb:promote -- --kb psychologist --candidate ki_1778536279894_d2be4064
```

Promotion is not considered successful until post-promote validation passes. If post-promote validation fails, the script attempts rollback from the backup and writes a failed/rolled-back promote manifest.

## Validate Production

```bash
npm run kb:validate:production -- --kb psychologist
```

This reads `knowledge_indexes/<kb>/production/current` and verifies the production index and manifests.

## Rollback

Rollback restores the latest successful promoted manifest that has a backup.

```bash
npm run kb:rollback:latest -- --kb psychologist
```

Rollback uses an atomic swap from the stored backup and writes a rollback manifest into:

```text
knowledge_indexes/<kb>/production/manifests/
```

## Safety Rules

- `knowledge_ingest.js` does not promote and does not write into `knowledge_indexes/<kb>/production`.
- Staging candidates are not moved or rebuilt during promote.
- Production is never overwritten before a backup is made when current production exists.
- The final replacement is a directory rename swap on the same volume for Windows safety.
- During promote or rollback, `production/.promote.lock` prevents concurrent production writes.
- The previous production directory is kept in `promote_tmp` until post-promote validation and manifest commit both succeed.
- If validation is uncertain, promote stops with an error instead of partially updating production.
