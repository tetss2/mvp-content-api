# Runtime Adapter Report

Generated: 2026-05-13T19:23:40.238Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_mock_only`.

## Connected Files

- `scripts/unified-generation-runtime.js`
- `scripts/expert-generation-sandbox.js`
- `scripts/expert-context-assembly.js`
- `scripts/expert-generation-orchestration.js`
- `scripts/expert-retrieval-intelligence.js`
- `scripts/expert-output-evaluation.js`
- `scripts/adapters/mock-generation-adapter.js`

## What Is Real

- Unified runtime state loading and decision routing.
- Local cognition JSON loading and updating.
- Local metadata retrieval candidates from expert sidecars.
- Local context assembly through `expert-context-assembly.js`.
- Local generation orchestration through `expert-generation-orchestration.js`.
- Local output evaluation through `expert-output-evaluation.js`.
- Local artifact writing under expert report folders.

## What Remains Simulated

- Final draft generation uses `scripts/adapters/mock-generation-adapter.js`.
- Production publishing is not connected.
- Telegram handlers are not connected.
- External model calls are intentionally blocked by adapter choice.

## State Loading Flow

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
  }
}
```

## Adapter Request Shape

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "user_request": "Короткий пост о тревоге в отношениях",
  "output_constraints": {
    "platform": "instagram",
    "length": "short",
    "format": "post",
    "tone": "expert_warm",
    "cta_style": "soft",
    "language": "ru",
    "runtime_decision_context": {
      "hook_type": "recognition_hook",
      "emotional_depth": "moderate",
      "cta_strength": "medium",
      "authority_framing": "low_pressure_expertise",
      "narrative_continuation": "open_new_thread",
      "content_pacing": "insight_forward"
    }
  },
  "adapter": "mock",
  "run_name": "short-instagram-post",
  "max_context_items": 6,
  "max_total_chars": 12000
}
```
