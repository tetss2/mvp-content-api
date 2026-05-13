# Runtime Integration Risks Report

Generated: 2026-05-13T19:23:40.241Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_mock_only`.

## Integration Risks Before Production

- Mock output is not representative enough for final author voice scoring.
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

## Local Artifacts Written

- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/request.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/context_pack.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/orchestration_plan.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/final_prompt.txt`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/generated_output.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/evaluation.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/run_summary.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/request.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/context_pack.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/orchestration_plan.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/final_prompt.txt`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/generated_output.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/evaluation.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-676Z_normal-telegram-post/run_summary.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/request.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/context_pack.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/orchestration_plan.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/final_prompt.txt`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/generated_output.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/evaluation.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-860Z_long-article-mode/run_summary.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/request.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/context_pack.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/orchestration_plan.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/final_prompt.txt`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/generated_output.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/evaluation.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-057Z_direct-faq-answer/run_summary.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/request.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/context_pack.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/orchestration_plan.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/final_prompt.txt`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/generated_output.md`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/evaluation.json`
- `expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-40-213Z_soft-sales-consultation/run_summary.md`
