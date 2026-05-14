# Runtime Integration Risks Report

Generated: 2026-05-14T15:05:40.526Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_prompt_assembly_dry_run`, `llm_execution_disabled`, `identity_engine_admin_only`, `identity_engine_local_only`, `campaign_memory_admin_only`, `campaign_memory_local_only`, `strategic_brain_admin_only`, `strategic_brain_local_only`, `editorial_director_admin_only`, `editorial_director_local_only`.

## Integration Risks Before Production

- Prompt packages are assembled locally, but final LLM output is not generated in this dry run.
- Runtime and sandbox currently assemble context separately; production integration should decide whether runtime context becomes authoritative.
- CTA pacing warnings must be reviewed before enabling any live consultation CTA.
- Author voice drift should be tested against real generated drafts and human-reviewed samples.
- Prompt length, Telegram caption limits, and Markdown stripping must be validated in a separate Telegram-safe test harness.
- Production integration must include rollback and feature flag boundaries.

## Not Connected Yet

- Telegram polling handlers in `index.js`.
- Cloudinary/FAL/Fish Audio/OpenAI live generation paths.
- Railway deployment.
- Supabase production database writes.
- FAISS/vector index mutation.
- Auto-posting or publishing.

## Must Validate Before Telegram Runtime Integration

- Exact payload shape expected by existing Telegram delivery formats.
- Russian text encoding and Markdown escaping.
- State persistence failure behavior.
- Duplicate-topic suppression under real user sessions.
- CTA escalation under real campaign state.
- Human approval workflow before publishing.

## Current Execution Boundary

- Real local prompt assembly: `true`
- Mock content generation: `false`
- LLM execution mode: `dry_run_prompt_only`
- External API calls: `false`
