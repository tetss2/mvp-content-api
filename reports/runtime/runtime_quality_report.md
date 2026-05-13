# Runtime Quality Report

Generated: 2026-05-13T19:14:17.506Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`.

## Score Summary

- Average final quality: 0.681
- Average author voice score: 0.462
- Average base production score: 0.829

## Example Runtime Output Structure

```json
{
  "output_type": "runtime_generation_pack",
  "publication_status": "not_published_local_simulation",
  "telegram_runtime_mutation": false,
  "external_api_calls": false,
  "faiss_or_index_mutation": false,
  "validation_status": "pass_with_warnings",
  "warnings": [
    "author_voice_drift"
  ],
  "primary_output_shape": {
    "output_id": "dinara_runtime_day_01_educational_post",
    "output_format": "educational_post",
    "content_block_count": 5
  }
}
```
