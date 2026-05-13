# Dinara Generation Orchestration Report

Generated: 2026-05-12T22:47:47.687Z

Report path: `expert_profiles/dinara/reports/onboarding/2026-05-12T22-47-47-687Z_generation_orchestration_report.md`

This report is local-only. It did not call OpenAI, deploy, mutate production indexes, mutate FAISS/vector indexes, run ingest, run promote, generate final content, wire prompts into production, or change the live Telegram bot runtime.

## Simulation Inputs

- Expert: `dinara`
- Metadata sidecars loaded: 20
- Simulated retrieval candidates: 21
- Context max items: 6
- Context max total chars: 12000
- User request used for examples: Напиши экспертный пост про женскую сексуальность

## Supported Intents

- `educational_post`
- `storytelling`
- `faq_answer`
- `sales_post`
- `short_hook`
- `therapeutic_case`

## Strategy Per Intent

| generation_intent | goal | recommended structure | voice priorities |
| --- | --- | --- | --- |
| educational_post | Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming. | hook -> problem framing -> expert explanation -> example -> soft CTA | clarity, authority, empathy |
| storytelling | Create emotional identification and trust through a human narrative that leads to expert meaning. | situation -> inner conflict -> insight -> expert meaning -> CTA | human tone, empathy, narrative flow |
| faq_answer | Answer a concrete reader question directly while preserving safety, nuance, and expert precision. | short answer -> nuance -> practical recommendation -> when to seek specialist | clarity, safety, precision |
| sales_post | Support ethical conversion by connecting a real pain point to an expert solution without aggressive pressure. | pain point -> consequence -> expert solution -> trust proof -> CTA | trust, specificity, ethical persuasion |
| short_hook | Capture attention quickly with a compact idea that can lead into a post, reel, carousel, or hook list. | punchy statement -> contrast -> myth -> question | brevity, emotional trigger, clarity |
| therapeutic_case | Explain a pattern through anonymized case logic while protecting confidentiality and generalizing responsibly. | case setup -> pattern -> interpretation -> general lesson -> CTA | confidentiality, ethics, generalization |

## Example Generation Plan: educational_post

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "generation_strategy": {
    "goal": "Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.",
    "recommended_structure": [
      "hook",
      "problem framing",
      "expert explanation",
      "example",
      "soft CTA"
    ],
    "voice_priorities": [
      "clarity",
      "authority",
      "empathy"
    ],
    "context_usage_rules": [
      "Prefer educational and therapeutic-case context as grounding.",
      "Use FAQ context for nuance and likely objections.",
      "Translate source ideas into synthesized expert language rather than close paraphrase."
    ],
    "cta_strategy": "Soft invitation to reflect, save, comment, or book a consultation when appropriate.",
    "forbidden_patterns": [
      "excessive jargon",
      "diagnosis",
      "fearmongering",
      "guaranteed outcomes",
      "copying long source fragments"
    ],
    "quality_checklist": [
      "clear main thesis",
      "reader feels respected",
      "expert nuance is visible",
      "practical example included",
      "no unsafe clinical claims"
    ]
  },
  "context_injection_plan": {
    "primary_context": [
      {
        "id": "fb5785f1c1a1b181176c33dd84d1c8301852c61a59755966f137d4eef00e02ae",
        "role": "primary",
        "title": "Введение в сексологию.cleaned.txt",
        "source_path": "knowledge_intake/sexologist/approved_high_confidence/Введение в сексологию.cleaned.txt",
        "source_type": "approved_high_confidence",
        "content_kind": "educational",
        "confidence_level": "high",
        "expert_signal_score": 0.96,
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
        },
        "selected_because": [
          "high_final_score",
          "intent_content_match",
          "generation_safe",
          "source_diversity",
          "content_kind_diversity"
        ]
      },
      {
        "id": "f6c5f124626e1532e64f2bed0be500b4a2c19d6e001436393f51f4d99dd49145",
        "role": "primary",
        "title": "Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt",
        "source_path": "knowledge_intake/sexologist/approved_high_confidence/Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt",
        "source_type": "approved_high_confidence",
        "content_kind": "educational",
        "confidence_level": "high",
        "expert_signal_score": 0.96,
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
        },
        "selected_because": [
          "high_final_score",
          "intent_content_match",
          "generation_safe",
          "source_diversity",
          "content_kind_diversity"
        ]
      }
    ],
    "supporting_context": [
      {
        "id": "31919f7d420f72e2ee1fa71f37c2b7169dd35c384e8b78eed1f6169064edcf10",
        "role": "supporting",
        "title": "секс дисф. начало (през).cleaned.txt",
        "source_path": "knowledge_intake/sexologist/approved_high_confidence/секс дисф. начало (през).cleaned.txt",
        "source_type": "approved_high_confidence",
        "content_kind": "therapeutic_case",
        "confidence_level": "high",
        "expert_signal_score": 0.96,
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
        },
        "selected_because": [
          "high_final_score",
          "intent_content_match",
          "generation_safe",
          "source_diversity",
          "content_kind_diversity"
        ]
      },
      {
        "id": "f52a96dcc3478cf45881dfdc96ad62249b1c89adeff9d3ea82e76d33a0eb13a1",
        "role": "supporting",
        "title": "Стыд и секс.cleaned.txt",
        "source_path": "knowledge_intake/sexologist/approved/Стыд и секс.cleaned.txt",
        "source_type": "approved_dataset",
        "content_kind": "faq",
        "confidence_level": "high",
        "expert_signal_score": 0.86,
        "retrieval_trace": {
          "base_score": 0.8428,
          "final_score": 2.1728,
          "boosts": [
            "approved_dataset:+0.85",
            "confidence_high:+0.25",
            "expert_signal_0.86:+0.18",
            "faq_match:+0.05"
          ],
          "penalties": [],
          "generation_safe": true,
          "generation_intent": "educational_post",
          "content_kind": "faq",
          "source_type": "approved_dataset",
          "confidence_level": "high"
        },
        "selected_because": [
          "high_final_score",
          "intent_content_match",
          "generation_safe",
          "source_diversity",
          "content_kind_diversity"
        ]
      }
    ],
    "tone_style_context": [],
    "max_quoted_content_chars_per_item": 280,
    "injection_rules": [
      "Use primary context for factual grounding and main expert position.",
      "Use supporting context for nuance, objections, examples, or secondary angles.",
      "Use tone/style context only to influence rhythm, warmth, and framing.",
      "Do not copy long source fragments; quote only short fragments when attribution or wording matters.",
      "Do not use unsafe, suppressed, questionnaire, noisy, or low-score items as generation grounding.",
      "Prefer synthesized output over paraphrase.",
      "Keep retrieval_trace and assembly_trace available for debugging, not for reader-facing text."
    ]
  },
  "output_policy": {
    "platform": "instagram",
    "length": "medium",
    "format": "post",
    "cta_style": "soft",
    "tone": "expert_warm",
    "language": "ru",
    "final_text_generation": false,
    "constraints_summary": {
      "platform_rule": "Adapt future text to platform norms without changing source meaning.",
      "length_rule": "Treat length as a planning constraint only; no final post is generated here.",
      "format_rule": "Use the format to choose section intent and content density.",
      "cta_rule": "Soft invitation to reflect, save, comment, or book a consultation when appropriate.",
      "tone_rule": "Use expert_warm as a future voice constraint."
    }
  },
  "orchestration_trace": [
    {
      "step": "intent_strategy_selected",
      "at": "2026-05-12T22:47:47.667Z",
      "generation_intent": "educational_post",
      "fallback_used": false
    },
    {
      "step": "context_pack_received",
      "at": "2026-05-12T22:47:47.681Z",
      "selected_count": 4,
      "suppressed_count": 17,
      "warnings": []
    },
    {
      "step": "primary_context_selected",
      "at": "2026-05-12T22:47:47.682Z",
      "primary_count": 2,
      "supporting_count": 2,
      "tone_style_count": 0
    },
    {
      "step": "safety_rules_applied",
      "at": "2026-05-12T22:47:47.682Z",
      "forbidden_patterns": [
        "excessive jargon",
        "diagnosis",
        "fearmongering",
        "guaranteed outcomes",
        "copying long source fragments"
      ],
      "excluded_context_count": 17,
      "max_quoted_content_chars_per_item": 280
    },
    {
      "step": "output_policy_applied",
      "at": "2026-05-12T22:47:47.682Z",
      "platform": "instagram",
      "length": "medium",
      "format": "post",
      "cta_style": "soft",
      "tone": "expert_warm"
    },
    {
      "step": "prompt_blueprint_created",
      "at": "2026-05-12T22:47:47.682Z",
      "sections": [
        "system_instruction",
        "expert_voice_instruction",
        "generation_strategy_instruction",
        "context_pack_instruction",
        "output_constraints_instruction",
        "safety_instruction",
        "final_user_request"
      ]
    }
  ]
}
```

## Example Prompt Blueprint Sections

- `system_instruction`
- `expert_voice_instruction`
- `generation_strategy_instruction`
- `context_pack_instruction`
- `output_constraints_instruction`
- `safety_instruction`
- `final_user_request`

```json
{
  "system_instruction": "You are preparing future Russian expert content for expert_id=dinara. Follow the generation plan exactly, but do not invent unsupported expert claims.",
  "expert_voice_instruction": "Use the expert voice constraints: tone=expert_warm; priorities=clarity, authority, empathy. Preserve warmth, precision, and ethical boundaries.",
  "generation_strategy_instruction": "Intent=educational_post. Goal: Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.. Recommended structure: hook -> problem framing -> expert explanation -> example -> soft CTA. CTA strategy: Soft invitation to reflect, save, comment, or book a consultation when appropriate..",
  "context_pack_instruction": "Use primary context ids: fb5785f1c1a1b181176c33dd84d1c8301852c61a59755966f137d4eef00e02ae, f6c5f124626e1532e64f2bed0be500b4a2c19d6e001436393f51f4d99dd49145. Use supporting context ids: 31919f7d420f72e2ee1fa71f37c2b7169dd35c384e8b78eed1f6169064edcf10, f52a96dcc3478cf45881dfdc96ad62249b1c89adeff9d3ea82e76d33a0eb13a1. Tone/style context ids: none. Avoid suppressed context.",
  "output_constraints_instruction": "Platform=instagram; length=medium; format=post; CTA=soft; language=ru. This is a planning blueprint, not final generated text.",
  "safety_instruction": "Avoid: excessive jargon, diagnosis, fearmongering, guaranteed outcomes, copying long source fragments. Do not diagnose, shame, fearmonger, copy long fragments, or use unsafe/suppressed material. Refer to a specialist when appropriate.",
  "final_user_request": "Напиши экспертный пост про женскую сексуальность"
}
```

## Context Injection Example

```json
{
  "primary_context": [
    {
      "id": "fb5785f1c1a1b181176c33dd84d1c8301852c61a59755966f137d4eef00e02ae",
      "title": "Введение в сексологию.cleaned.txt",
      "role": "primary",
      "content_kind": "educational"
    },
    {
      "id": "f6c5f124626e1532e64f2bed0be500b4a2c19d6e001436393f51f4d99dd49145",
      "title": "Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt",
      "role": "primary",
      "content_kind": "educational"
    }
  ],
  "supporting_context": [
    {
      "id": "31919f7d420f72e2ee1fa71f37c2b7169dd35c384e8b78eed1f6169064edcf10",
      "title": "секс дисф. начало (през).cleaned.txt",
      "role": "supporting",
      "content_kind": "therapeutic_case"
    },
    {
      "id": "f52a96dcc3478cf45881dfdc96ad62249b1c89adeff9d3ea82e76d33a0eb13a1",
      "title": "Стыд и секс.cleaned.txt",
      "role": "supporting",
      "content_kind": "faq"
    }
  ],
  "max_quoted_content_chars_per_item": 280,
  "safety_exclusions": [
    {
      "id": "594b2bbd31d88aa0a2cedb228f0bd4b6721afaf8cd5ed2d0c898f02c5066f86c",
      "title": "Нетипичный секс.cleaned.txt",
      "reasons": [
        "content_kind_limit"
      ]
    },
    {
      "id": "77d4467f3f304cab90ddee973eb93228fd0f571a6cb476eb861a8726d6e4c8af",
      "title": "ПСР_психосексуальное_развитие_в_норме.cleaned.txt",
      "reasons": [
        "content_kind_limit"
      ]
    },
    {
      "id": "2d4935f23aec8028e7552e77766179ab693072685f8c93ad89db4fe0e391e003",
      "title": "Сексуальные дисгармонии.cleaned.txt",
      "reasons": [
        "content_kind_limit"
      ]
    },
    {
      "id": "7024139b53e6a01426bea85506c75c1513351459bde57eb32168a1110ca1127f",
      "title": "Супружеская_совместимость_и_проблемы_отношений_в_браке_.cleaned.txt",
      "reasons": [
        "content_kind_limit"
      ]
    },
    {
      "id": "af40b165e78c748cfa46574282b48fa2d63b676ba8c0dceb8fdcfa6ea8c5fa65",
      "title": "Автостоп. Техника символдрамы.cleaned.txt",
      "reasons": [
        "source_type_limit"
      ]
    }
  ]
}
```

## Output Policy Example

```json
{
  "platform": "instagram",
  "length": "medium",
  "format": "post",
  "cta_style": "soft",
  "tone": "expert_warm",
  "language": "ru",
  "final_text_generation": false,
  "constraints_summary": {
    "platform_rule": "Adapt future text to platform norms without changing source meaning.",
    "length_rule": "Treat length as a planning constraint only; no final post is generated here.",
    "format_rule": "Use the format to choose section intent and content density.",
    "cta_rule": "Soft invitation to reflect, save, comment, or book a consultation when appropriate.",
    "tone_rule": "Use expert_warm as a future voice constraint."
  }
}
```

## Orchestration Trace Example

```json
[
  {
    "step": "intent_strategy_selected",
    "generation_intent": "educational_post",
    "fallback_used": false
  },
  {
    "step": "context_pack_received",
    "selected_count": 4,
    "suppressed_count": 17,
    "warnings": []
  },
  {
    "step": "primary_context_selected",
    "primary_count": 2,
    "supporting_count": 2,
    "tone_style_count": 0
  },
  {
    "step": "safety_rules_applied",
    "forbidden_patterns": [
      "excessive jargon",
      "diagnosis",
      "fearmongering",
      "guaranteed outcomes",
      "copying long source fragments"
    ],
    "excluded_context_count": 17,
    "max_quoted_content_chars_per_item": 280
  },
  {
    "step": "output_policy_applied",
    "platform": "instagram",
    "length": "medium",
    "format": "post",
    "cta_style": "soft",
    "tone": "expert_warm"
  },
  {
    "step": "prompt_blueprint_created",
    "sections": [
      "system_instruction",
      "expert_voice_instruction",
      "generation_strategy_instruction",
      "context_pack_instruction",
      "output_constraints_instruction",
      "safety_instruction",
      "final_user_request"
    ]
  }
]
```

## Future Integration Recommendations

- Keep generation orchestration after context assembly and before any model call.
- Pass only `prompt_blueprint`, `context_injection_plan`, and `output_policy` to a future prompt renderer.
- Store `orchestration_trace` next to retrieval and assembly traces for support/debugging.
- Add expert-specific voice profiles as an input to `expert_voice_instruction` before live generation.
- Add offline evaluation fixtures before connecting this to Telegram or Instagram surfaces.
- Keep OpenAI calls, production index mutation, ingest, promote, and deployment outside this simulation script.
