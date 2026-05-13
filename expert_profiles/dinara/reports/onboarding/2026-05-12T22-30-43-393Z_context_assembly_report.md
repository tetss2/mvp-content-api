# Dinara Context Assembly Report

Generated: 2026-05-12T22:30:43.392Z

Report path: `expert_profiles/dinara/reports/onboarding/2026-05-12T22-30-43-393Z_context_assembly_report.md`

This report is local-only. It did not call OpenAI, deploy, mutate production indexes, mutate FAISS/vector indexes, run ingest, run promote, or change the live Telegram bot runtime.

## Purpose

The context assembly layer turns already-scored retrieval candidates into a curated context pack for future expert generation. Retrieval can find and rerank candidates; assembly decides which candidates are safe, diverse, budget-aware, and useful enough to send forward.

## Supported Intents

| generation_intent | preferred content kinds |
| --- | --- |
| educational_post | educational, therapeutic_case, faq |
| storytelling | storytelling, therapeutic_case, educational |
| faq_answer | faq, educational |
| sales_post | sales, educational, storytelling |
| short_hook | short_hook, storytelling, sales |
| therapeutic_case | therapeutic_case, educational, storytelling |

## Selection Rules

- Prioritize highest `retrieval_trace.final_score`.
- Select generation-safe candidates only.
- Prefer candidates whose `content_kind` matches the generation intent.
- Preserve `retrieval_trace` from metadata-aware scoring.
- Add `selected_because` reasons such as `high_final_score`, `intent_content_match`, `generation_safe`, and diversity signals.

## Diversity Rules

- Max selected items per `content_kind`: 2.
- Max selected items per `source_type`: 3.
- Suppress exact `content_sha256` duplicates.
- Warn when selected context is narrow, has one source type, or safe candidates are scarce.

## Context Budget Rules

- Max context items: 6.
- Max total selected characters: 12000.
- The simulator uses local text excerpts of up to 1600 characters per source to approximate future chunk-level candidates.

## Suppression Logic

Items can be suppressed for `generation_unsafe`, `questionnaire_context`, `noisy_warnings`, `low_final_score`, `duplicate_content_hash`, `content_kind_limit`, `source_type_limit`, `max_context_items_reached`, or `context_budget_exceeded`.

## Intent: educational_post

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.5068 | approved_high_confidence | educational | high | Введение в сексологию.cleaned.txt |
| 2 | 2.4588 | approved_high_confidence | educational | high | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 3 | 2.3728 | approved_high_confidence | therapeutic_case | high | секс дисф. начало (през).cleaned.txt |
| 4 | 2.1728 | approved_dataset | faq | high | Стыд и секс.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.4468 | approved_high_confidence | educational | content_kind_limit | Нетипичный секс.cleaned.txt |
| 2.4348 | approved_high_confidence | educational | content_kind_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.4108 | approved_high_confidence | educational | content_kind_limit | Сексуальные дисгармонии.cleaned.txt |
| 2.3748 | approved_high_confidence | educational | content_kind_limit | Супружеская_совместимость_и_проблемы_отношений_в_браке_.cleaned.txt |
| 2.3688 | approved_high_confidence | faq | source_type_limit | Автостоп. Техника символдрамы.cleaned.txt |
| 2.3468 | approved_dataset | educational | content_kind_limit | Женская сексуальность.cleaned.txt |
| 2.3448 | approved_high_confidence | faq | source_type_limit | Женские сексуальные дисфункции .cleaned.txt |
| 2.3368 | approved_high_confidence | therapeutic_case | source_type_limit | Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt |
| 2.3328 | approved_high_confidence | faq | source_type_limit | Завис (през).cleaned.txt |
| 2.3168 | approved_dataset | educational | content_kind_limit | Женская сексуальность.cleaned.txt duplicate probe |

### Warnings

- none

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "Введение в сексологию.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "educational",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8268,
        "final_score": 2.5068,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "educational_match:+0.2"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "educational_post",
        "content_kind": "educational",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "educational",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7788,
        "final_score": 2.4588,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "educational_match:+0.2"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "educational_post",
        "content_kind": "educational",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "секс дисф. начало (през).cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "therapeutic_case",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7428,
        "final_score": 2.3728,
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
    }
  ],
  "context_summary": {
    "selected_count": 4,
    "suppressed_count": 17,
    "candidate_count": 21,
    "total_selected_chars": 6400,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "educational": 2,
      "therapeutic_case": 1,
      "faq": 1
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 1
    },
    "safe_candidate_count": 20,
    "warnings": []
  }
}
```

## Intent: storytelling

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.3888 | approved_high_confidence | storytelling | high | Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.cleaned.txt |
| 2 | 2.3428 | approved_high_confidence | therapeutic_case | high | секс дисф. начало (през).cleaned.txt |
| 3 | 2.3188 | approved_high_confidence | faq | high | Автостоп. Техника символдрамы.cleaned.txt |
| 4 | 2.1468 | approved_dataset | educational | high | Женская сексуальность.cleaned.txt |
| 5 | 2.1228 | approved_dataset | faq | high | Стыд и секс.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.3068 | approved_high_confidence | educational | source_type_limit | Введение в сексологию.cleaned.txt |
| 2.3068 | approved_high_confidence | therapeutic_case | source_type_limit | Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt |
| 2.2948 | approved_high_confidence | faq | source_type_limit | Женские сексуальные дисфункции .cleaned.txt |
| 2.2828 | approved_high_confidence | therapeutic_case | source_type_limit | ЭГ в пт секс дисфункций.cleaned.txt |
| 2.2828 | approved_high_confidence | faq | source_type_limit | Завис (през).cleaned.txt |
| 2.2708 | approved_high_confidence | short_hook | source_type_limit | Мужская сексуальность.cleaned.txt |
| 2.2588 | approved_high_confidence | educational | source_type_limit | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 2.2468 | approved_high_confidence | educational | source_type_limit | Нетипичный секс.cleaned.txt |
| 2.2348 | approved_high_confidence | educational | source_type_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.2108 | approved_high_confidence | educational | source_type_limit | Сексуальные дисгармонии.cleaned.txt |

### Warnings

- duplicate_suppressed

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "storytelling",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "storytelling",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.6588,
        "final_score": 2.3888,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "storytelling_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "storytelling",
        "content_kind": "storytelling",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "секс дисф. начало (през).cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "therapeutic_case",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7428,
        "final_score": 2.3428,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "therapeutic_case_match:+0.12"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "storytelling",
        "content_kind": "therapeutic_case",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "Автостоп. Техника символдрамы.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "faq",
      "selected_because": [
        "high_final_score",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8388,
        "final_score": 2.3188,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "storytelling",
        "content_kind": "faq",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    }
  ],
  "context_summary": {
    "selected_count": 5,
    "suppressed_count": 16,
    "candidate_count": 21,
    "total_selected_chars": 8000,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "storytelling": 1,
      "therapeutic_case": 1,
      "faq": 2,
      "educational": 1
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 2
    },
    "safe_candidate_count": 20,
    "warnings": [
      "duplicate_suppressed"
    ]
  }
}
```

## Intent: faq_answer

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.5688 | approved_high_confidence | faq | high | Автостоп. Техника символдрамы.cleaned.txt |
| 2 | 2.5448 | approved_high_confidence | faq | high | Женские сексуальные дисфункции .cleaned.txt |
| 3 | 2.3868 | approved_high_confidence | educational | high | Введение в сексологию.cleaned.txt |
| 4 | 2.2268 | approved_dataset | educational | high | Женская сексуальность.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.5328 | approved_high_confidence | faq | content_kind_limit | Завис (през).cleaned.txt |
| 2.4008 | approved_high_confidence | faq | content_kind_limit | Эмили Нагоски - Как хочет женщина.cleaned.txt |
| 2.3728 | approved_dataset | faq | content_kind_limit | Стыд и секс.cleaned.txt |
| 2.3388 | approved_high_confidence | educational | source_type_limit | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 2.3268 | approved_high_confidence | educational | source_type_limit | Нетипичный секс.cleaned.txt |
| 2.3148 | approved_high_confidence | educational | source_type_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.2908 | approved_high_confidence | educational | source_type_limit | Сексуальные дисгармонии.cleaned.txt |
| 2.2708 | approved_high_confidence | short_hook | source_type_limit | Мужская сексуальность.cleaned.txt |
| 2.2548 | approved_high_confidence | educational | source_type_limit | Супружеская_совместимость_и_проблемы_отношений_в_браке_.cleaned.txt |
| 2.2228 | approved_high_confidence | therapeutic_case | source_type_limit | секс дисф. начало (през).cleaned.txt |

### Warnings

- duplicate_suppressed

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "faq_answer",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "Автостоп. Техника символдрамы.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "faq",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8388,
        "final_score": 2.5688,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "faq_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "faq_answer",
        "content_kind": "faq",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "Женские сексуальные дисфункции .cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "faq",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8148,
        "final_score": 2.5448,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "faq_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "faq_answer",
        "content_kind": "faq",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "Введение в сексологию.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "educational",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8268,
        "final_score": 2.3868,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "educational_match:+0.08"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "faq_answer",
        "content_kind": "educational",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    }
  ],
  "context_summary": {
    "selected_count": 4,
    "suppressed_count": 17,
    "candidate_count": 21,
    "total_selected_chars": 6400,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "faq": 2,
      "educational": 2
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 1
    },
    "safe_candidate_count": 20,
    "warnings": [
      "duplicate_suppressed"
    ]
  }
}
```

## Intent: sales_post

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.4488 | approved_high_confidence | sales | high | Сексуальный интеллект.cleaned.txt |
| 2 | 2.3508 | approved_high_confidence | short_hook | high | Мужская сексуальность.cleaned.txt |
| 3 | 2.3188 | approved_high_confidence | faq | high | Автостоп. Техника символдрамы.cleaned.txt |
| 4 | 2.1468 | approved_dataset | educational | high | Женская сексуальность.cleaned.txt |
| 5 | 2.1228 | approved_dataset | faq | high | Стыд и секс.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.3068 | approved_high_confidence | educational | source_type_limit | Введение в сексологию.cleaned.txt |
| 2.2948 | approved_high_confidence | faq | source_type_limit | Женские сексуальные дисфункции .cleaned.txt |
| 2.2828 | approved_high_confidence | faq | source_type_limit | Завис (през).cleaned.txt |
| 2.2588 | approved_high_confidence | educational | source_type_limit | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 2.2468 | approved_high_confidence | educational | source_type_limit | Нетипичный секс.cleaned.txt |
| 2.2348 | approved_high_confidence | educational | source_type_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.2228 | approved_high_confidence | therapeutic_case | source_type_limit | секс дисф. начало (през).cleaned.txt |
| 2.2108 | approved_high_confidence | educational | source_type_limit | Сексуальные дисгармонии.cleaned.txt |
| 2.1868 | approved_high_confidence | therapeutic_case | source_type_limit | Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt |
| 2.1748 | approved_high_confidence | educational | source_type_limit | Супружеская_совместимость_и_проблемы_отношений_в_браке_.cleaned.txt |

### Warnings

- duplicate_suppressed

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "sales_post",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "Сексуальный интеллект.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "sales",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7188,
        "final_score": 2.4488,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "sales_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "sales_post",
        "content_kind": "sales",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "Мужская сексуальность.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "short_hook",
      "selected_because": [
        "high_final_score",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7908,
        "final_score": 2.3508,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "short_hook_match:+0.08"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "sales_post",
        "content_kind": "short_hook",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "Автостоп. Техника символдрамы.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "faq",
      "selected_because": [
        "high_final_score",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8388,
        "final_score": 2.3188,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "sales_post",
        "content_kind": "faq",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    }
  ],
  "context_summary": {
    "selected_count": 5,
    "suppressed_count": 16,
    "candidate_count": 21,
    "total_selected_chars": 8000,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "sales": 1,
      "short_hook": 1,
      "faq": 2,
      "educational": 1
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 2
    },
    "safe_candidate_count": 20,
    "warnings": [
      "duplicate_suppressed"
    ]
  }
}
```

## Intent: short_hook

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.5208 | approved_high_confidence | short_hook | high | Мужская сексуальность.cleaned.txt |
| 2 | 2.3188 | approved_high_confidence | faq | high | Автостоп. Техника символдрамы.cleaned.txt |
| 3 | 2.3068 | approved_high_confidence | educational | high | Введение в сексологию.cleaned.txt |
| 4 | 2.1468 | approved_dataset | educational | high | Женская сексуальность.cleaned.txt |
| 5 | 2.1228 | approved_dataset | faq | high | Стыд и секс.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.2948 | approved_high_confidence | faq | source_type_limit | Женские сексуальные дисфункции .cleaned.txt |
| 2.2828 | approved_high_confidence | faq | source_type_limit | Завис (през).cleaned.txt |
| 2.2788 | approved_high_confidence | sales | source_type_limit | Сексуальный интеллект.cleaned.txt |
| 2.2588 | approved_high_confidence | educational | source_type_limit | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 2.2468 | approved_high_confidence | educational | source_type_limit | Нетипичный секс.cleaned.txt |
| 2.2348 | approved_high_confidence | educational | source_type_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.2228 | approved_high_confidence | therapeutic_case | source_type_limit | секс дисф. начало (през).cleaned.txt |
| 2.2108 | approved_high_confidence | educational | source_type_limit | Сексуальные дисгармонии.cleaned.txt |
| 2.1888 | approved_high_confidence | storytelling | source_type_limit | Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.cleaned.txt |
| 2.1868 | approved_high_confidence | therapeutic_case | source_type_limit | Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt |

### Warnings

- duplicate_suppressed

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "short_hook",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "Мужская сексуальность.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "short_hook",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7908,
        "final_score": 2.5208,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "short_hook_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "short_hook",
        "content_kind": "short_hook",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "Автостоп. Техника символдрамы.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "faq",
      "selected_because": [
        "high_final_score",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8388,
        "final_score": 2.3188,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "short_hook",
        "content_kind": "faq",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "Введение в сексологию.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "educational",
      "selected_because": [
        "high_final_score",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8268,
        "final_score": 2.3068,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "short_hook",
        "content_kind": "educational",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    }
  ],
  "context_summary": {
    "selected_count": 5,
    "suppressed_count": 16,
    "candidate_count": 21,
    "total_selected_chars": 8000,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "short_hook": 1,
      "faq": 2,
      "educational": 2
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 2
    },
    "safe_candidate_count": 20,
    "warnings": [
      "duplicate_suppressed"
    ]
  }
}
```

## Intent: therapeutic_case

### Selected Items

| rank | final_score | source_type | content_kind | confidence | title |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 2.4728 | approved_high_confidence | therapeutic_case | high | секс дисф. начало (през).cleaned.txt |
| 2 | 2.4368 | approved_high_confidence | therapeutic_case | high | Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt |
| 3 | 2.4268 | approved_high_confidence | educational | high | Введение в сексологию.cleaned.txt |
| 4 | 2.2668 | approved_dataset | educational | high | Женская сексуальность.cleaned.txt |
| 5 | 2.1228 | approved_dataset | faq | high | Стыд и секс.cleaned.txt |

### Suppressed Items

| final_score | source_type | content_kind | suppressed_because | title |
| ---: | --- | --- | --- | --- |
| 2.4128 | approved_high_confidence | therapeutic_case | content_kind_limit, source_type_limit | ЭГ в пт секс дисфункций.cleaned.txt |
| 2.3788 | approved_high_confidence | educational | source_type_limit | Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt |
| 2.3668 | approved_high_confidence | educational | source_type_limit | Нетипичный секс.cleaned.txt |
| 2.3548 | approved_high_confidence | educational | source_type_limit | ПСР_психосексуальное_развитие_в_норме.cleaned.txt |
| 2.3308 | approved_high_confidence | educational | source_type_limit | Сексуальные дисгармонии.cleaned.txt |
| 2.3188 | approved_high_confidence | faq | source_type_limit | Автостоп. Техника символдрамы.cleaned.txt |
| 2.2948 | approved_high_confidence | educational | source_type_limit | Супружеская_совместимость_и_проблемы_отношений_в_браке_.cleaned.txt |
| 2.2948 | approved_high_confidence | faq | source_type_limit | Женские сексуальные дисфункции .cleaned.txt |
| 2.2828 | approved_high_confidence | faq | source_type_limit | Завис (през).cleaned.txt |
| 2.2708 | approved_high_confidence | short_hook | source_type_limit | Мужская сексуальность.cleaned.txt |

### Warnings

- duplicate_suppressed

### Example Context Pack

```json
{
  "expert_id": "dinara",
  "generation_intent": "therapeutic_case",
  "selected_items": [
    {
      "selection_rank": 1,
      "title": "секс дисф. начало (през).cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "therapeutic_case",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7428,
        "final_score": 2.4728,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "therapeutic_case_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "therapeutic_case",
        "content_kind": "therapeutic_case",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 2,
      "title": "Стратегии_с_неврозами,_диссоциацией,_окр_и_тп.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "therapeutic_case",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.7068,
        "final_score": 2.4368,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "therapeutic_case_match:+0.25"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "therapeutic_case",
        "content_kind": "therapeutic_case",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    },
    {
      "selection_rank": 3,
      "title": "Введение в сексологию.cleaned.txt",
      "source_type": "approved_high_confidence",
      "content_kind": "educational",
      "selected_because": [
        "high_final_score",
        "intent_content_match",
        "generation_safe",
        "source_diversity",
        "content_kind_diversity"
      ],
      "retrieval_trace": {
        "base_score": 0.8268,
        "final_score": 2.4268,
        "boosts": [
          "approved_high_confidence:+1",
          "confidence_high:+0.25",
          "expert_signal_0.96:+0.23",
          "educational_match:+0.12"
        ],
        "penalties": [],
        "generation_safe": true,
        "generation_intent": "therapeutic_case",
        "content_kind": "educational",
        "source_type": "approved_high_confidence",
        "confidence_level": "high"
      }
    }
  ],
  "context_summary": {
    "selected_count": 5,
    "suppressed_count": 16,
    "candidate_count": 21,
    "total_selected_chars": 8000,
    "max_context_items": 6,
    "max_total_chars": 12000,
    "content_kind_counts": {
      "therapeutic_case": 2,
      "educational": 2,
      "faq": 1
    },
    "source_type_counts": {
      "approved_high_confidence": 3,
      "approved_dataset": 2
    },
    "safe_candidate_count": 20,
    "warnings": [
      "duplicate_suppressed"
    ]
  }
}
```

## Recommended Future Integration Points

- Place assembly after metadata-aware reranking and before prompt/context construction.
- Keep `generation_intent` explicit at the orchestration boundary for Telegram, Instagram, and future expert surfaces.
- Feed `selected_items[].content` into generation only after a separate prompt-building layer is designed.
- Store `assembly_trace` with generation diagnostics for support and evaluation.
- Move from source-level sidecars to chunk-level sidecar joins when indexes are intentionally rebuilt.
