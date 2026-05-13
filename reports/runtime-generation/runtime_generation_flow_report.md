# Runtime Generation Flow Report

Generated: 2026-05-13T19:29:36.670Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_prompt_assembly_dry_run`, `llm_execution_disabled`.

## Summary

- Requests simulated: 5
- Average combined quality: 0.753
- Average prompt assembly score: 0.85
- Adapter mode: `local_runtime_to_prompt_assembly`
- LLM execution mode: `dry_run_prompt_only`
- Mock content generation used: `false`

## Simulation Runs

| Run | Request | Length | Tone | Assembly | Mock Content | Context | Prompt Chars | Score | Warnings |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| short-instagram-post | relationship anxiety | short | expert_warm | real local | no | 4 | 4164 | 0.764 | author_voice_drift |
| normal-telegram-post | emotional dependency | medium | empathetic | real local | no | 5 | 4979 | 0.765 | author_voice_drift |
| long-article-mode | female sexuality myths | long | calm | real local | no | 4 | 4163 | 0.757 | author_voice_drift |
| direct-faq-answer | shame and desire | medium | direct | real local | no | 4 | 4165 | 0.754 | author_voice_drift |
| soft-sales-consultation | boundaries in intimacy | medium | expert_warm | real local | no | 5 | 5008 | 0.726 | reduce_cta_strength, author_voice_drift |

## Example Runtime State

```json
{
  "schema_version": "2026-05-13.unified_generation_runtime.v1",
  "run_id": "runtime_2026-05-13T19-29-35-964Z",
  "created_at": "2026-05-13T19:29:35.964Z",
  "constraints": {
    "local_only": true,
    "no_deploy": true,
    "no_telegram_runtime_mutation": true,
    "no_auto_posting": true,
    "no_railway_deploy": true,
    "no_external_apis": true,
    "no_faiss_or_index_mutation": true,
    "no_ingest_or_promote": true,
    "no_production_database_migration": true,
    "no_production_publishing": true
  },
  "expert_identity": {
    "expert_id": "dinara",
    "scenario": "multi_expert_content_generation"
  },
  "generation_intent": {
    "intent": "educational_post",
    "topic": "relationship anxiety",
    "requested_length": "short"
  },
  "audience_state": {
    "stage": "warming",
    "memory_depth": 0
  },
  "campaign_context": {
    "campaign_type": "trust_building_flow",
    "campaign_day": 31,
    "campaign_id": "dinara_trust_building_flow_31d"
  },
  "narrative_continuity": {
    "recent_topics": [],
    "active_threads": []
  },
  "emotional_pacing": {
    "recent_cycles": [
      {
        "day": 31,
        "emotion": "calm",
        "intensity": 0.24,
        "topic": "relationship anxiety"
      },
      {
        "day": 32,
        "emotion": "calm",
        "intensity": 0.24,
        "topic": "emotional dependency"
      },
      {
        "day": 33,
        "emotion": "recognition",
        "intensity": 0.52,
        "topic": "female sexuality myths"
      },
      {
        "day": 34,
        "emotion": "recognition",
        "intensity": 0.52,
        "topic": "shame and desire"
      },
      {
        "day": 35,
        "emotion": "calm",
        "intensity": 0.24,
        "topic": "boundaries in intimacy"
      }
    ],
    "requested_depth": "auto"
  },
  "cta_pacing": {
    "selected_cta_type": "save_share_cta",
    "recent_ctas": []
  },
  "trust_progression": {
    "trust_state": {
      "authorityGrowth": 0.724,
      "emotionalTrustGrowth": 0.73,
      "educationalTrust": 0.528,
      "vulnerabilityTrust": 0.376,
      "consistencyTrust": 0.768,
      "audienceFamiliarity": 0.711,
      "trustTrajectory": [
        {
          "day": 1,
          "score": 0.131,
          "topic": "relationship anxiety"
        },
        {
          "day": 2,
          "score": 0.141,
          "topic": "emotional dependency"
        },
        {
          "day": 3,
          "score": 0.15,
          "topic": "female sexuality myths"
        },
        {
          "day": 4,
          "score": 0.162,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 5,
          "score": 0.171,
          "topic": "shame and desire"
        },
        {
          "day": 6,
          "score": 0.181,
          "topic": "trust after conflict"
        },
        {
          "day": 7,
          "score": 0.19,
          "topic": "body sensitivity"
        },
        {
          "day": 8,
          "score": 0.2,
          "topic": "self-worth in relationships"
        },
        {
          "day": 9,
          "score": 0.209,
          "topic": "adult attachment"
        },
        {
          "day": 10,
          "score": 0.219,
          "topic": "soft communication"
        },
        {
          "day": 11,
          "score": 0.229,
          "topic": "relationship anxiety"
        },
        {
          "day": 12,
          "score": 0.243,
          "topic": "emotional dependency"
        },
        {
          "day": 13,
          "score": 0.255,
          "topic": "female sexuality myths"
        },
        {
          "day": 14,
          "score": 0.267,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 15,
          "score": 0.279,
          "topic": "shame and desire"
        },
        {
          "day": 16,
          "score": 0.29,
          "topic": "trust after conflict"
        },
        {
          "day": 17,
          "score": 0.302,
          "topic": "body sensitivity"
        },
        {
          "day": 18,
          "score": 0.314,
          "topic": "self-worth in relationships"
        },
        {
          "day": 19,
          "score": 0.324,
          "topic": "adult attachment"
        },
        {
          "day": 20,
          "score": 0.336,
          "topic": "soft communication"
        },
        {
          "day": 21,
          "score": 0.347,
          "topic": "relationship anxiety"
        },
        {
          "day": 22,
          "score": 0.358,
          "topic": "emotional dependency"
        },
        {
          "day": 23,
          "score": 0.368,
          "topic": "female sexuality myths"
        },
        {
          "day": 24,
          "score": 0.379,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 25,
          "score": 0.39,
          "topic": "shame and desire"
        },
        {
          "day": 26,
          "score": 0.401,
          "topic": "trust after conflict"
        },
        {
          "day": 27,
          "score": 0.411,
          "topic": "body sensitivity"
        },
        {
          "day": 28,
          "score": 0.424,
          "topic": "self-worth in relationships"
        },
        {
          "day": 29,
          "score": 0.435,
          "topic": "adult attachment"
        },
        {
          "day": 30,
          "score": 0.445,
          "topic": "soft communication"
        },
        {
          "day": 31,
          "score": 0.457,
          "topic": "relationship anxiety"
        },
        {
          "day": 32,
          "score": 0.468,
          "topic": "emotional dependency"
        },
        {
          "day": 33,
          "score": 0.48,
          "topic": "female sexuality myths"
        },
        {
          "day": 34,
          "score": 0.493,
          "topic": "shame and desire"
        },
        {
          "day": 35,
          "score": 0.505,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 31,
          "score": 0.516,
          "topic": "relationship anxiety"
        },
        {
          "day": 32,
          "score": 0.528,
          "topic": "emotional dependency"
        },
        {
          "day": 33,
          "score": 0.541,
          "topic": "female sexuality myths"
        },
        {
          "day": 34,
          "score": 0.554,
          "topic": "shame and desire"
        },
        {
          "day": 35,
          "score": 0.566,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 31,
          "score": 0.578,
          "topic": "relationship anxiety"
        },
        {
          "day": 32,
          "score": 0.59,
          "topic": "emotional dependency"
        },
        {
          "day": 33,
          "score": 0.603,
          "topic": "female sexuality myths"
        },
        {
          "day": 34,
          "score": 0.616,
          "topic": "shame and desire"
        },
        {
          "day": 35,
          "score": 0.628,
          "topic": "boundaries in intimacy"
        },
        {
          "day": 31,
          "score": 0.64,
          "topic": "relationship anxiety"
        }
      ],
      "authorityTrajectory": [
        {
          "day": 1,
          "score": 0.132,
          "domain": "attachment psychology"
        },
        {
          "day": 2,
          "score": 0.144,
          "domain": "dependency patterns"
        },
        {
          "day": 3,
          "score": 0.156,
          "domain": "sex education"
        },
        {
          "day": 4,
          "score": 0.181,
          "domain": "communication"
        },
        {
          "day": 5,
          "score": 0.193,
          "domain": "sexology"
        },
        {
          "day": 6,
          "score": 0.205,
          "domain": "conflict repair"
        },
        {
          "day": 7,
          "score": 0.217,
          "domain": "body awareness"
        },
        {
          "day": 8,
          "score": 0.229,
          "domain": "self-worth"
        },
        {
          "day": 9,
          "score": 0.241,
          "domain": "attachment psychology"
        },
        {
          "day": 10,
          "score": 0.253,
          "domain": "communication"
        },
        {
          "day": 11,
          "score": 0.265,
          "domain": "attachment psychology"
        },
        {
          "day": 12,
          "score": 0.29,
          "domain": "dependency patterns"
        },
        {
          "day": 13,
          "score": 0.302,
          "domain": "sex education"
        },
        {
          "day": 14,
          "score": 0.314,
          "domain": "communication"
        },
        {
          "day": 15,
          "score": 0.326,
          "domain": "sexology"
        },
        {
          "day": 16,
          "score": 0.338,
          "domain": "conflict repair"
        },
        {
          "day": 17,
          "score": 0.35,
          "domain": "body awareness"
        },
        {
          "day": 18,
          "score": 0.362,
          "domain": "self-worth"
        },
        {
          "day": 19,
          "score": 0.374,
          "domain": "attachment psychology"
        },
        {
          "day": 20,
          "score": 0.399,
          "domain": "communication"
        },
        {
          "day": 21,
          "score": 0.411,
          "domain": "attachment psychology"
        },
        {
          "day": 22,
          "score": 0.423,
          "domain": "dependency patterns"
        },
        {
          "day": 23,
          "score": 0.435,
          "domain": "sex education"
        },
        {
          "day": 24,
          "score": 0.447,
          "domain": "communication"
        },
        {
          "day": 25,
          "score": 0.459,
          "domain": "sexology"
        },
        {
          "day": 26,
          "score": 0.471,
          "domain": "conflict repair"
        },
        {
          "day": 27,
          "score": 0.483,
          "domain": "body awareness"
        },
        {
          "day": 28,
          "score": 0.508,
          "domain": "self-worth"
        },
        {
          "day": 29,
          "score": 0.52,
          "domain": "attachment psychology"
        },
        {
          "day": 30,
          "score": 0.532,
          "domain": "communication"
        },
        {
          "day": 31,
          "score": 0.544,
          "domain": "attachment psychology"
        },
        {
          "day": 32,
          "score": 0.556,
          "domain": "dependency patterns"
        },
        {
          "day": 33,
          "score": 0.568,
          "domain": "sex education"
        },
        {
          "day": 34,
          "score": 0.58,
          "domain": "sexology"
        },
        {
          "day": 35,
          "score": 0.592,
          "domain": "communication"
        },
        {
          "day": 31,
          "score": 0.604,
          "domain": "attachment psychology"
        },
        {
          "day": 32,
          "score": 0.616,
          "domain": "dependency patterns"
        },
        {
          "day": 33,
          "score": 0.628,
          "domain": "sex education"
        },
        {
          "day": 34,
          "score": 0.64,
          "domain": "sexology"
        },
        {
          "day": 35,
          "score": 0.652,
          "domain": "communication"
        },
        {
          "day": 31,
          "score": 0.664,
          "domain": "attachment psychology"
        },
        {
          "day": 32,
          "score": 0.676,
          "domain": "dependency patterns"
        },
        {
          "day": 33,
          "score": 0.688,
          "domain": "sex education"
        },
        {
          "day": 34,
          "score": 0.7,
          "domain": "sexology"
        },
        {
          "day": 35,
          "score": 0.712,
          "domain": "communication"
        },
        {
          "day": 31,
          "score": 0.724,
          "domain": "attachment psychology"
        }
      ]
    },
    "trust_score": 0.35
  },
  "repetition_risk": {
    "status": "pass",
    "risk_score": 0,
    "same_topic_recent_count": 0,
    "repeated_hook_recent_count": 0,
    "recommendation": "Proceed with variation controls."
  },
  "platform_target": "instagram_post",
  "production_format": "post",
  "decision_engine": {
    "hook_type": "recognition_hook",
    "emotional_depth": "moderate",
    "cta_strength": "medium",
    "authority_framing": "low_pressure_expertise",
    "narrative_continuation": "open_new_thread",
    "platform_adaptation": "instagram_post",
    "content_pacing": "insight_forward"
  }
}
```

## Example Generation Decisions

```json
{
  "hook_type": "recognition_hook",
  "emotional_depth": "moderate",
  "cta_strength": "medium",
  "authority_framing": "low_pressure_expertise",
  "narrative_continuation": "open_new_thread",
  "platform_adaptation": "instagram_post",
  "content_pacing": "insight_forward"
}
```

## Example Prompt Structure

```json
{
  "system_prompt_chars": 531,
  "user_prompt_chars": 3633,
  "total_prompt_chars": 4164,
  "message_count": 2,
  "config_payload": {
    "llmExecutionMode": "dry_run_prompt_only",
    "intended_provider": "openai-compatible-chat",
    "intended_model": "gpt-4o-mini",
    "temperature": 0.65,
    "max_tokens": 700,
    "language": "ru",
    "platform": "instagram",
    "format": "post",
    "length_mode": "short",
    "tone_mode": "expert_warm",
    "cta_style": "soft",
    "production_execution_allowed": false,
    "external_api_calls_allowed": false,
    "telegram_delivery_allowed": false,
    "safety_boundaries": {
      "no_diagnosis": true,
      "no_guaranteed_outcomes": true,
      "no_private_case_details": true,
      "no_suppressed_context": true,
      "no_internal_trace_leakage": true
    }
  }
}
```

## Example Message Payload

```json
[
  {
    "role": "system",
    "content": "You are preparing future Russian expert content for expert_id=dinara. Follow the generation plan exactly, but do not invent unsupported expert claims.\n\nUse the expert voice constraints: tone=expert_warm; priorities=clarity, authority, empathy. Preserve warmth, precision, and ethical boundaries.\n\nAvoid: excessive jargon, diagnosis, fearmongering, guaranteed outcomes, copying long source fragments. Do not diagnose, shame, fearmonger, copy long fragments, or use unsafe/suppressed material. Refer to a specialist when appropriate."
  },
  {
    "role": "user",
    "content": "# Generation Task\nКороткий пост о тревоге в отношениях\n\n# Strategy\nIntent=educational_post. Goal: Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.. Recommended structure: hook -> problem framing -> expert explanation -> example -> soft CTA. CTA strategy: Soft invitation to reflect, save, comment, or book a consultation when appropriate..\n\n# Output Constraints\nPlatform=instagram; length=short; format=post; CTA=soft; language=ru. This is a planning blueprint, not final generated text.\n\n# Context Injection Rules\n- Use primary context for factual grounding and main expert position.\n- Use supporting context for nuance, objections, examples, or secondary angles.\n- Use tone/style context only to influence rhythm, warmth, and framing.\n- Do not copy long source fragments; quote only short fragments when attribution or wording matters.\n- Do not use unsafe, suppressed, questionnaire, noisy, or low-score items as generation grounding.\n- Prefer synthesized output over paraphrase.\n- Keep retrieval_trace and assembly_trace available for debugging, not for reader-facing text.\n\n# Curated Context\n### Primary context: Введение в сексологию.cleaned.txt\n- id: fb5785f1c1a1b181176c33dd84d1c8301852c61a59755966f137d4eef00e02ae\n- source_type: approved_high_confidence\n- content_kind: educational\n- confidence: high\n\nВведение в сексологию Доктор мед. наук, профессор В. А. Доморацкий Секс и сексуальность В повседневной жизни слово «секс» в последнее время часто используют для обозначения полового акта («заниматься сексом»). Но сексуальность — больше, чем просто секс и способность человека к эр\n\n### Primary context: Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt\n- id: f6c5f124626e1532e64f2bed0be500b4a2c19d6e001436393f51f4d99dd49145\n- source_type: approved_high_confidence\n- content_kind: educational\n- confidence: high\n\nНарушения оргазма у женщин и их коррекция Доктор медицинских наук, профессор В. А. Доморацкий Оргазм Физиологически оргазм представляет собой избавление от нарастающих в процессе сексуального возбуждения мышечного напряжения и переполнения кровью гениталий (миотонии и вазокогнест\n\n### Supporting context: секс дисф. начало (през).cleaned.txt\n- id: 31919f7d420f72e2ee1fa71f37c2b7169dd35c384e8b78eed1f6169064edcf10\n- source_type: approved_high_confidence\n- content_kind: therapeutic_case\n- confidence: high\n\nМужские сексуальные дисфункции и их психотерапия Доктор медицинских наук, профессор В. А. Доморацкий Авторская модель интегративной психотерапии сексуальных дисфункций наиболее полно была представлена нами в докторской диссертации (2004) и книге «Медицинская сексология и психотер\n\n### Supporting context: Стыд и секс.cleaned.txt\n- id: f52a96dcc3478cf45881dfdc96ad62249b1c89adeff9d3ea82e76d33a0eb13a1\n- source_type: approved_dataset\n- content_kind: faq\n- confidence: high\n\nСтыд, вина и сексДоктор медицинских наук, профессор В. А. Доморацкий Вина реальная и невротическая Вина - это чувство, которое испытывает человек, думая о чем-то, что он совершил или чего не совершал, как о проступке, достойном порицания: Женщина чувствует себя виноватой за то, ч\n\nNo tone/style context selected.\n\n# Safety\nAvoid: excessive jargon, diagnosis, fearmongering, guaranteed outcomes, copying long source fragments. Do not diagnose, shame, fearmonger, copy long fragments, or use unsafe/suppressed material. Refer to a specialist when appropriate.\n\n# Produce Final Draft\nWrite the requested expert content in Russian. Use the curated context as grounding, synthesize rather than copying, and do not mention internal traces or source ids."
  }
]
```
