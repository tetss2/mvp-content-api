# Required Folders

```text
configs/experts/<expert_id>/
expert_profiles/<expert_id>/voice/
expert_profiles/<expert_id>/feedback_memory/
expert_profiles/<expert_id>/reports/onboarding/
expert_profiles/<expert_id>/reports/generation_runs/
knowledge_intake/<expert_id>/incoming/
knowledge_intake/<expert_id>/cleaned/
knowledge_indexes/<expert_id>/staging/
```

The staging index folder is reserved for future local onboarding workflows. Creating this template must not create or mutate FAISS files.
