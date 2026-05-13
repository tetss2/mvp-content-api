# Required Evaluation Files

Future onboarding automation should create or verify these files before any live integration is considered:

- `expert_profiles/<expert_id>/reports/onboarding/*_inventory_report.md`
- `expert_profiles/<expert_id>/reports/onboarding/*_taxonomy_summary.md`
- `expert_profiles/<expert_id>/reports/onboarding/*_retrieval_scoring_report.md`
- `expert_profiles/<expert_id>/reports/onboarding/*_context_assembly_report.md`
- `expert_profiles/<expert_id>/reports/onboarding/*_generation_orchestration_report.md`
- `expert_profiles/<expert_id>/reports/onboarding/*_generation_sandbox_report.md`
- `expert_profiles/<expert_id>/reports/voice/author_voice_report.md`
- `expert_profiles/<expert_id>/reports/feedback_memory/feedback_memory_report.md`

These reports are review artifacts. They must not trigger ingest, promote, live routing, fine-tuning, or automatic prompt mutation.
