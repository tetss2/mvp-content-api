# Dinara Local Generation Sandbox Report

Generated: 2026-05-12T22:57:54.264Z

Report path: `expert_profiles/dinara/reports/onboarding/2026-05-12T22-57-54-264Z_generation_sandbox_report.md`

This report is local-only. Prompts and generated outputs are stored on disk only. This run did not deploy, mutate production indexes, mutate FAISS/vector files, run ingest, run promote, wire prompts into production, or change live Telegram behavior.

## Executed Scenarios

| intent | platform | format | adapter | overall_score | hallucination_risk | cta_quality | warnings |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| educational_post | instagram | post | mock | 0.83 | low | good | none |
| storytelling | telegram | post | mock | 0.78 | low | good | none |
| faq_answer | generic | answer | mock | 0.79 | low | weak | missing_cta |
| short_hook | instagram | hook_list | mock | 0.7 | low | good | none |
| therapeutic_case | instagram | post | mock | 0.81 | low | good | none |

## Generation Strategies Used

- `educational_post`: Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.
- `storytelling`: Create emotional identification and trust through a human narrative that leads to expert meaning.
- `faq_answer`: Answer a concrete reader question directly while preserving safety, nuance, and expert precision.
- `short_hook`: Capture attention quickly with a compact idea that can lead into a post, reel, carousel, or hook list.
- `therapeutic_case`: Explain a pattern through anonymized case logic while protecting confidentiality and generalizing responsibly.

## Artifact Paths

| intent | final_prompt.txt | generated_output.md | evaluation.json |
| --- | --- | --- | --- |
| educational_post | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-448Z_educational-instagram-post/final_prompt.txt` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-448Z_educational-instagram-post/generated_output.md` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-448Z_educational-instagram-post/evaluation.json` |
| storytelling | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-729Z_storytelling-telegram-post/final_prompt.txt` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-729Z_storytelling-telegram-post/generated_output.md` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-729Z_storytelling-telegram-post/evaluation.json` |
| faq_answer | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-883Z_faq-answer/final_prompt.txt` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-883Z_faq-answer/generated_output.md` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-883Z_faq-answer/evaluation.json` |
| short_hook | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-058Z_short-hook-list/final_prompt.txt` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-058Z_short-hook-list/generated_output.md` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-058Z_short-hook-list/evaluation.json` |
| therapeutic_case | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-227Z_therapeutic-case-post/final_prompt.txt` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-227Z_therapeutic-case-post/generated_output.md` | `expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-227Z_therapeutic-case-post/evaluation.json` |

## Prompt Structure Example

Example from `educational_post`:

```json
{
  "system_prompt": [
    "system_instruction",
    "expert_voice_instruction",
    "safety_instruction"
  ],
  "final_prompt": [
    "final_user_request",
    "generation_strategy_instruction",
    "output_constraints_instruction",
    "context_injection_rules",
    "curated_context",
    "safety_instruction"
  ]
}
```

## Evaluation Summary Example

```json
{
  "style_match_score": 0.9,
  "structure_quality_score": 0.8,
  "educational_clarity_score": 0.83,
  "emotional_warmth_score": 0.85,
  "redundancy_score": 1,
  "hallucination_risk": "low",
  "cta_quality": "good",
  "expert_tone_match_score": 0.77,
  "context_utilization_quality_score": 0.65,
  "overall_score": 0.83,
  "warnings": [],
  "metrics": {
    "word_count": 107,
    "repeated_line_ratio": 0,
    "cta_present": true,
    "forbidden_matches": []
  }
}
```

## Comparison Summary

```json
{
  "run_count": 5,
  "average_overall_score": 0.78,
  "best_run": {
    "run_id": "2026-05-12T22-57-53-448Z_educational-instagram-post",
    "intent": "educational_post",
    "platform": "instagram",
    "format": "post",
    "adapter": "mock",
    "overall_score": 0.83,
    "hallucination_risk": "low",
    "cta_quality": "good",
    "warnings": [],
    "output_path": "expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-448Z_educational-instagram-post/generated_output.md"
  },
  "lowest_scoring_run": {
    "run_id": "2026-05-12T22-57-54-058Z_short-hook-list",
    "intent": "short_hook",
    "platform": "instagram",
    "format": "hook_list",
    "adapter": "mock",
    "overall_score": 0.7,
    "hallucination_risk": "low",
    "cta_quality": "good",
    "warnings": [],
    "output_path": "expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-058Z_short-hook-list/generated_output.md"
  },
  "warning_counts": {
    "missing_cta": 1
  }
}
```

## Warnings

- missing_cta: 1

## Recommendations For Future Feedback Learning

- Store human review labels next to `evaluation.json` without overwriting heuristic scores.
- Add reviewer fields for factuality, voice match, usefulness, CTA ethics, and publish readiness.
- Compare prompt strategies by keeping the same context pack and changing only orchestration or output policy.
- Track repeated warnings over time to decide which prompt constraints need tightening.
- Keep the OpenAI adapter local-only until evaluation fixtures and live safety boundaries are approved.
- Never allow suppressed or unsafe context items into final prompts.
