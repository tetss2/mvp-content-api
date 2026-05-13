# Runtime Generation Validation Report

Generated: 2026-05-13T19:35:38.443Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_prompt_assembly_dry_run`, `llm_execution_disabled`.

## Validation Coverage

- Runtime repetition risk
- Runtime trust and CTA pacing
- Runtime author voice status
- Prompt assembly validation
- Context assembly warnings
- Dry-run execution boundary

## Per-Run Validation

- short-instagram-post: status `pass_with_warnings`, combined quality 0.764, repetition `pass`, CTA risk `low`, author voice 0.458. Warnings: author_voice_drift.
- normal-telegram-post: status `pass_with_warnings`, combined quality 0.765, repetition `pass`, CTA risk `low`, author voice 0.467. Warnings: author_voice_drift.
- long-article-mode: status `pass_with_warnings`, combined quality 0.757, repetition `pass`, CTA risk `low`, author voice 0.423. Warnings: author_voice_drift.
- direct-faq-answer: status `pass_with_warnings`, combined quality 0.754, repetition `pass`, CTA risk `medium`, author voice 0.407. Warnings: author_voice_drift.
- soft-sales-consultation: status `pass_with_warnings`, combined quality 0.726, repetition `pass`, CTA risk `high`, author voice 0.429. Warnings: reduce_cta_strength, author_voice_drift.
