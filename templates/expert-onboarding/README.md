# Expert Onboarding Template

This template defines the local-only folder and file contract for adding a future expert to the multi-expert platform foundation.

It prepares automation inputs only. It must not ingest datasets, promote indexes, mutate FAISS/vector files, deploy, fine-tune, or wire an expert into Telegram runtime.

## Required Folder Contract

- `configs/experts/<expert_id>/`
- `expert_profiles/<expert_id>/voice/`
- `expert_profiles/<expert_id>/feedback_memory/`
- `expert_profiles/<expert_id>/reports/onboarding/`
- `expert_profiles/<expert_id>/reports/generation_runs/`
- `knowledge_intake/<expert_id>/incoming/`
- `knowledge_intake/<expert_id>/cleaned/`
- `knowledge_indexes/<expert_id>/staging/`

## Required Config Contract

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

## Required Report Contract

- onboarding inventory report
- source path inventory
- taxonomy summary
- retrieval scoring report
- context assembly report
- generation orchestration report
- generation sandbox report
- author voice report
- feedback memory report
- isolation validation report

## Runtime Isolation Rules

- Every path must include the expert id or explicitly point to a shared template.
- Retrieval must require a namespace filter.
- Voice profile and feedback memory must be separate scopes.
- Generation policy must forbid shared prompt memory.
- Style constraints must forbid cross-expert voice examples.
