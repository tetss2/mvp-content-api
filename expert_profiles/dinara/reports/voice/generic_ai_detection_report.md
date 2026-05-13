# Generic AI Detection Report

Generated: 2026-05-12T23:17:43.125Z

## Example Forbidden AI Phrase

```json
{
  "phrase": "Важно понимать",
  "detected_in_sources": true,
  "suppression_reason": "generic_ai_or_robotic_transition"
}
```

## Suppression List

```json
{
  "phrases": [
    {
      "phrase": "Важно понимать",
      "detected_in_sources": true,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Следует отметить",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "В современном мире",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Данная тема",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Подводя итог",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Необходимо подчеркнуть",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Таким образом",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "В заключение",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Важно отметить",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Стоит отметить",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "В данной статье",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Существует множество факторов",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Это является важным аспектом",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    },
    {
      "phrase": "Рассмотрим подробнее",
      "detected_in_sources": false,
      "suppression_reason": "generic_ai_or_robotic_transition"
    }
  ],
  "structural_patterns": [
    {
      "pattern": "repetitive numbered over-structuring",
      "suppression_reason": "low-human rhythm unless requested as hook list or checklist"
    },
    {
      "pattern": "formulaic intro -> list -> conclusion",
      "suppression_reason": "generic GPT article shape"
    },
    {
      "pattern": "corporate neutral abstraction",
      "suppression_reason": "weak conversational warmth"
    }
  ]
}
```

## Generated Output Risk

| output | generic_ai_risk | hits |
| --- | --- | --- |
| expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-448Z_educational-instagram-post/generated_output.md | medium | Важно понимать |
| expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-729Z_storytelling-telegram-post/generated_output.md | low | none |
| expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-53-883Z_faq-answer/generated_output.md | low | none |
| expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-058Z_short-hook-list/generated_output.md | low | none |
| expert_profiles/dinara/reports/generation_runs/2026-05-12T22-57-54-227Z_therapeutic-case-post/generated_output.md | low | none |
