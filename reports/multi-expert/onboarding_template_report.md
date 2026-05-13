# Onboarding Template Report

Generated: 2026-05-12T23:28:09.892Z

## Template Root

`templates/expert-onboarding/`

## Required Folders

- `configs/experts/<expert_id>/`
- `expert_profiles/<expert_id>/voice/`
- `expert_profiles/<expert_id>/feedback_memory/`
- `expert_profiles/<expert_id>/reports/onboarding/`
- `expert_profiles/<expert_id>/reports/generation_runs/`
- `knowledge_intake/<expert_id>/incoming/`
- `knowledge_intake/<expert_id>/cleaned/`
- `knowledge_indexes/<expert_id>/staging/`

## Required Configs

- `expert.json`
- `capabilities.json`
- `retrieval.json`
- `generation-policy.json`
- `tone.json`
- `cta.json`
- `safety-policy.json`
- `style-constraints.json`
- `context-policy.json`
- `output-policy.json`

## Required Reports

- onboarding inventory report
- source path inventory
- taxonomy summary
- retrieval scoring report
- context assembly report
- generation orchestration report
- sandbox report
- author voice report
- feedback memory report
- isolation validation report

## Automation Boundary

The template prepares future onboarding automation only. It does not ingest, promote, mutate indexes, deploy, fine-tune, or alter Telegram runtime behavior.
