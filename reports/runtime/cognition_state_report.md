# Cognition State Report

Generated: 2026-05-13T19:14:17.490Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`.

## Example Cognition Loading

```json
{
  "loaded_from_disk": true,
  "storage_paths": {
    "topicGraphState": "storage/cognition/dinara/topic-graph-state.json",
    "trustMemory": "storage/cognition/dinara/trust-memory.json",
    "ctaHistory": "storage/cognition/dinara/cta-history.json",
    "audienceMemory": "storage/cognition/dinara/audience-memory.json",
    "narrativeMemory": "storage/cognition/dinara/narrative-memory.json",
    "emotionalCycles": "storage/cognition/dinara/emotional-cycles.json",
    "optimizationHistory": "storage/cognition/dinara/optimization-history.json"
  },
  "persisted_after_run": true
}
```

## Persistent State Snapshot

- Loaded from disk on final run: `true`
- Persisted after run: `true`
- Cognitive day: 30
- Topic nodes: 10
- Topic relationships: 12
- Optimization events: 30

## Storage Files

- `storage/cognition/dinara/topic-graph-state.json`
- `storage/cognition/dinara/trust-memory.json`
- `storage/cognition/dinara/cta-history.json`
- `storage/cognition/dinara/audience-memory.json`
- `storage/cognition/dinara/narrative-memory.json`
- `storage/cognition/dinara/emotional-cycles.json`
- `storage/cognition/dinara/optimization-history.json`
