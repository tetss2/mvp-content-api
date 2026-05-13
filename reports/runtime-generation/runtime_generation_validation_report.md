# Runtime Generation Validation Report

Generated: 2026-05-13T19:23:40.239Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_mock_only`.

## Validation Coverage

- Runtime repetition risk
- Runtime trust and CTA pacing
- Runtime author voice status
- Generation sandbox output evaluation
- Context assembly warnings
- Mock adapter warnings

## Per-Run Validation

- short-instagram-post: status `pass_with_warnings`, combined quality 0.752, repetition `pass`, CTA risk `low`, author voice 0.458. Warnings: author_voice_drift, mock_adapter_used.
- normal-telegram-post: status `pass_with_warnings`, combined quality 0.732, repetition `pass`, CTA risk `low`, author voice 0.467. Warnings: author_voice_drift, mock_adapter_used.
- long-article-mode: status `pass_with_warnings`, combined quality 0.746, repetition `pass`, CTA risk `low`, author voice 0.423. Warnings: author_voice_drift, mock_adapter_used.
- direct-faq-answer: status `pass_with_warnings`, combined quality 0.725, repetition `pass`, CTA risk `medium`, author voice 0.407. Warnings: author_voice_drift, missing_cta, mock_adapter_used.
- soft-sales-consultation: status `pass_with_warnings`, combined quality 0.717, repetition `pass`, CTA risk `high`, author voice 0.429. Warnings: reduce_cta_strength, author_voice_drift, mock_adapter_used.
