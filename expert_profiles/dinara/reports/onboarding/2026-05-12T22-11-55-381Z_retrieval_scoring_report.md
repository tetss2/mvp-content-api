# Dinara Retrieval Scoring Report

Generated: 2026-05-12T22:11:55.276Z

This report is local-only. It does not mutate Railway, production indexes, FAISS files, ingestion state, promotion state, Telegram runtime behavior, or generation prompts.

## Purpose

The metadata-aware retrieval scoring layer reranks already-retrieved documents after vector or semantic retrieval. It treats vector similarity as the base score, then applies deterministic metadata boosts and penalties from onboarding intelligence sidecars.

## Scoring Rules

Final score is:

```text
base vector score
+ source_type adjustment
+ confidence_level adjustment
+ expert_signal_score adjustment
+ optional content_kind intent match
- generation safety and warning penalties
```

The layer is additive, explainable, and backward compatible: callers can keep using plain retrieval results, or call the reranker as a post-processing step.

## Source Type Weights

| source_type | adjustment |
| --- | ---: |
| approved_high_confidence | +1 |
| approved_dataset | +0.85 |
| b17_article | +0.95 |
| website_vercel | +0.9 |
| telegram_channel | +0.75 |
| approved_medium_confidence | +0.78 |
| raw_sample | +0.45 |
| questionnaire | -1 |
| unknown | +0 |

## Confidence Boosts

| confidence_level | adjustment |
| --- | ---: |
| high | +0.25 |
| medium | +0.1 |
| low | -0.35 |

## Expert Signal

`expert_signal_score` is converted into a small continuous adjustment: values above 0.50 boost the result, values below 0.50 penalize it. This keeps expert-specific material influential without letting the metadata overwhelm semantic relevance.

## Safety Penalties

- `is_generation_safe: false`: -2
- each actionable warning except reference bookkeeping: -0.12

Unsafe documents are suppressed but not deleted. This preserves auditability and allows future assessment-specific workflows to opt into questionnaires deliberately.

## Content Kind Boosts

| generation_intent | content_kind boosts |
| --- | --- |
| educational_post | educational:+0.2, therapeutic_case:+0.15, faq:+0.05 |
| storytelling | storytelling:+0.25, therapeutic_case:+0.12 |
| faq_answer | faq:+0.25, educational:+0.08 |
| sales_post | sales:+0.25, short_hook:+0.08 |
| short_hook | short_hook:+0.25, sales:+0.08, storytelling:+0.05 |
| therapeutic_case | therapeutic_case:+0.25, educational:+0.12, storytelling:+0.08 |

Simulation intent used here: `educational_post`.

## Before Ranking

| rank | score | source_type | confidence | content_kind | safe | title |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 0.9200 | approved_dataset | high | educational | true | Женская сексуальность.cleaned.txt |
| 2 | 0.8850 | approved_high_confidence | high | therapeutic_case | true | секс дисф. начало (през).cleaned.txt |
| 3 | 0.8500 | approved_dataset | high | faq | true | Стыд и секс.cleaned.txt |
| 4 | 0.8150 | approved_high_confidence | high | short_hook | true | Мужская сексуальность.cleaned.txt |
| 5 | 0.7800 | approved_high_confidence | high | sales | true | Сексуальный интеллект.cleaned.txt |
| 6 | 0.7450 | questionnaire | low | storytelling | false | «Когда мы не ладим» Упражнение .cleaned.txt |
| 7 | 0.7100 | questionnaire | low | questionnaire | true | Секс. обслед. Ж (1).cleaned.txt |
| 8 | 0.6750 | approved_high_confidence | high | faq | true | Автостоп. Техника символдрамы.cleaned.txt |
| 9 | 0.6400 | approved_high_confidence | high | educational | true | Введение в сексологию.cleaned.txt |
| 10 | 0.6050 | approved_high_confidence | high | storytelling | true | Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.cleaned.txt |

## After Metadata-Aware Reranking

| rank | score | source_type | confidence | content_kind | safe | title |
| ---: | ---: | --- | --- | --- | --- | --- |
| 1 | 2.5150 | approved_high_confidence | high | therapeutic_case | true | секс дисф. начало (през).cleaned.txt |
| 2 | 2.4000 | approved_dataset | high | educational | true | Женская сексуальность.cleaned.txt |
| 3 | 2.3200 | approved_high_confidence | high | educational | true | Введение в сексологию.cleaned.txt |
| 4 | 2.2950 | approved_high_confidence | high | short_hook | true | Мужская сексуальность.cleaned.txt |
| 5 | 2.2600 | approved_high_confidence | high | sales | true | Сексуальный интеллект.cleaned.txt |
| 6 | 2.2050 | approved_high_confidence | high | faq | true | Автостоп. Техника символдрамы.cleaned.txt |
| 7 | 2.1800 | approved_dataset | high | faq | true | Стыд и секс.cleaned.txt |
| 8 | 2.0850 | approved_high_confidence | high | storytelling | true | Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.cleaned.txt |
| 9 | -0.8900 | questionnaire | low | questionnaire | true | Секс. обслед. Ж (1).cleaned.txt |
| 10 | -2.9750 | questionnaire | low | storytelling | false | «Когда мы не ладим» Упражнение .cleaned.txt |

## Noisy Document Suppression Examples

- knowledge_intake/sexologist/approved/Секс. обслед. Ж (1).cleaned.txt: questionnaire:-1, confidence_low:-0.35, expert_signal_0:-0.25; final -0.89
- knowledge_intake/sexologist/approved/«Когда мы не ладим» Упражнение .cleaned.txt: questionnaire:-1, confidence_low:-0.35, expert_signal_0:-0.25, generation_unsafe:-2, warning_probable_questionnaire:-0.12; final -2.975

## Explainability Examples

### Top Reranked Item

```json
{
  "base_score": 0.885,
  "final_score": 2.515,
  "boosts": [
    "approved_high_confidence:+1",
    "confidence_high:+0.25",
    "expert_signal_0.96:+0.23",
    "therapeutic_case_match:+0.15"
  ],
  "penalties": [],
  "generation_safe": true,
  "generation_intent": "educational_post",
  "content_kind": "therapeutic_case",
  "source_type": "approved_high_confidence",
  "confidence_level": "high"
}
```

### Largest Suppressed Item

```json
{
  "base_score": 0.745,
  "final_score": -2.975,
  "boosts": [],
  "penalties": [
    "questionnaire:-1",
    "confidence_low:-0.35",
    "expert_signal_0:-0.25",
    "generation_unsafe:-2",
    "warning_probable_questionnaire:-0.12"
  ],
  "generation_safe": false,
  "generation_intent": "educational_post",
  "content_kind": "storytelling",
  "source_type": "questionnaire",
  "confidence_level": "low"
}
```

## Future Recommendations

- Wire this as an optional post-retrieval reranker in a retrieval service adapter, not inside generation prompts.
- Keep `generation_intent` explicit at the API boundary so Instagram, Telegram, and future expert surfaces can choose intent independently.
- Add offline evaluation snapshots comparing plain vector ranking with metadata-aware reranking.
- Consider hard exclusion only for known unsafe source classes after human review; keep the current layer as a soft reranker for now.
- Extend sidecar matching from source-level metadata to chunk-level metadata when production indexes are rebuilt intentionally.
