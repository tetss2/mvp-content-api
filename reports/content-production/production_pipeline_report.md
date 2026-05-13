# Production Pipeline Report

Generated: 2026-05-12T23:42:54.734Z

This is a local-only production simulation. It does not deploy, post, mutate Telegram runtime, mutate FAISS/index files, ingest/promote data, fine-tune models, or publish content.

## Summary

- Campaign: dinara_trust_building_flow_30d
- Expert: dinara
- Packs produced: 10
- Output formats supported: instagram_post, telegram_longread, reels_script, carousel_script, story_sequence, faq_answer, authority_post, emotional_story, sales_post, educational_post, consultation_cta_post

## Pipeline Stages

| stage | status |
| --- | --- |
| strategy_selection | simulated |
| context_assembly | simulated |
| retrieval_selection | simulated |
| voice_injection | simulated |
| emotional_alignment | simulated |
| CTA_injection | simulated |
| hook_generation | simulated |
| structure_generation | simulated |
| platform_adaptation | simulated |
| anti_repetition_validation | simulated |
| hallucination_risk_validation | simulated |
| output_evaluation | simulated |
| packaging | simulated |

## Produced Packs

| pack_id | day | intent | primary_output | cta | overall_score |
| --- | --- | --- | --- | --- | --- |
| dinara_day_01_storytelling_production_pack | 1 | storytelling | emotional_story | low_pressure_cta | 0.827 |
| dinara_day_02_storytelling_production_pack | 2 | storytelling | reels_script | emotional_cta | 0.827 |
| dinara_day_03_engagement_production_pack | 3 | engagement | telegram_longread | educational_cta | 0.827 |
| dinara_day_04_faq_production_pack | 4 | FAQ | carousel_script | emotional_cta | 0.827 |
| dinara_day_05_storytelling_production_pack | 5 | storytelling | story_sequence | trust_cta | 0.827 |
| dinara_day_06_storytelling_production_pack | 6 | storytelling | emotional_story | low_pressure_cta | 0.827 |
| dinara_day_07_authority_production_pack | 7 | authority | authority_post | soft_cta | 0.793 |
| dinara_day_08_therapeutic_production_pack | 8 | therapeutic | educational_post | trust_cta | 0.827 |
| dinara_day_09_faq_production_pack | 9 | FAQ | reels_script | soft_cta | 0.827 |
| dinara_day_10_authority_production_pack | 10 | authority | telegram_longread | educational_cta | 0.793 |

## Example Production Pack

```json
{
  "pack_id": "dinara_day_01_storytelling_production_pack",
  "expert_id": "dinara",
  "campaign_id": "dinara_trust_building_flow_30d",
  "planning_only": true,
  "generated_at": "2026-05-12T23:42:54.728Z",
  "pipeline_stages": [
    {
      "stage": "strategy_selection",
      "status": "simulated"
    },
    {
      "stage": "context_assembly",
      "status": "simulated"
    },
    {
      "stage": "retrieval_selection",
      "status": "simulated"
    },
    {
      "stage": "voice_injection",
      "status": "simulated"
    },
    {
      "stage": "emotional_alignment",
      "status": "simulated"
    },
    {
      "stage": "CTA_injection",
      "status": "simulated"
    },
    {
      "stage": "hook_generation",
      "status": "simulated"
    },
    {
      "stage": "structure_generation",
      "status": "simulated"
    },
    {
      "stage": "platform_adaptation",
      "status": "simulated"
    },
    {
      "stage": "anti_repetition_validation",
      "status": "simulated"
    },
    {
      "stage": "hallucination_risk_validation",
      "status": "simulated"
    },
    {
      "stage": "output_evaluation",
      "status": "simulated"
    },
    {
      "stage": "packaging",
      "status": "simulated"
    }
  ],
  "strategy_node": {
    "node_id": "dinara_day_01_storytelling",
    "expert_id": "dinara",
    "day": 1,
    "week": 1,
    "campaign_id": "dinara_trust_building_flow_30d",
    "campaign_stage": "warming",
    "topic": "relationship anxiety",
    "theme": "relationship anxiety",
    "intent": "storytelling",
    "platform": "instagram_post",
    "audience_state": "cold",
    "cta_type": "low_pressure_cta",
    "hook_pattern": "myth_reframe",
    "emotional_frame": "recognition",
    "storytelling_structure": "situation_to_insight",
    "sophistication_level": 1,
    "expert_positioning": "warm guide",
    "depends_on": [],
    "planning_notes": [
      "Reduce pressure; create recognition and basic clarity.",
      "Continue theme: relationship anxiety."
    ]
  },
  "strategy_selection": {
    "selected_intent": "storytelling",
    "selected_platform": "instagram_post",
    "selected_output_format": "emotional_story"
  },
  "context_assembly": {
    "context_pack_id": "dinara_day_01_storytelling_simulated_context",
    "retrieval_namespace": "dinara_main",
    "selected_context": [
      {
        "role": "strategic_topic_anchor",
        "topic": "relationship anxiety",
        "source": "campaign_plan_node"
      },
      {
        "role": "audience_state_anchor",
        "audience_state": "cold",
        "source": "audience_progression_plan"
      }
    ],
    "suppressed_context": [],
    "local_only": true
  },
  "retrieval_selection": {
    "retrieval_namespace": "dinara_main",
    "selected_count": 2,
    "production_index_mutation": false
  },
  "voice_injection": {
    "expert_id": "dinara",
    "voice_scope": "expert_profiles/dinara/voice",
    "injected_as_constraints_only": true
  },
  "emotional_alignment": {
    "emotional_frame": "recognition",
    "audience_state": "cold",
    "alignment_note": "Match recognition without artificial empathy."
  },
  "hook_intelligence": {
    "selected_hook": {
      "hook_id": "dinara_day_01_storytelling_hook_1",
      "hook_type": "emotional_hook",
      "text": "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется",
      "fatigue_risk": "low",
      "predicted_effectiveness": 0.72
    },
    "variants": [
      {
        "hook_id": "dinara_day_01_storytelling_hook_1",
        "hook_type": "emotional_hook",
        "text": "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_2",
        "hook_type": "curiosity_hook",
        "text": "Почему \"relationship anxiety\" часто начинается не там, где мы ищем причину",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.765
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_3",
        "hook_type": "authority_hook",
        "text": "Как специалист смотрит на \"relationship anxiety\" без стыда и давления",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.81
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_4",
        "hook_type": "therapeutic_hook",
        "text": "Если в \"relationship anxiety\" много напряжения, начните с этого наблюдения",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.855
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_5",
        "hook_type": "pain_point_hook",
        "text": "Что делать, когда \"relationship anxiety\" снова возвращает тревогу",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_6",
        "hook_type": "controversial_hook",
        "text": "Непопулярная мысль про \"relationship anxiety\": дело не только в силе воли",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.765
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_7",
        "hook_type": "story_hook",
        "text": "Одна ситуация про \"relationship anxiety\", в которой многие узнают себя",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.81
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_8",
        "hook_type": "short_form_hook",
        "text": "\"relationship anxiety\" — это не всегда про проблему в отношениях",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.855
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_9",
        "hook_type": "reels_hook",
        "text": "3 признака, что \"relationship anxiety\" требует мягкого внимания",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      }
    ],
    "hook_repetition_warnings": []
  },
  "structure_generation": {
    "structure_id": "story_resolution",
    "beats": [
      "story",
      "conflict",
      "resolution"
    ],
    "structure_notes": [
      "Intent: storytelling",
      "Audience state: cold",
      "Campaign stage: warming"
    ]
  },
  "cta_variants": {
    "selected_cta": {
      "cta_type": "low_pressure_cta",
      "text": "Пока достаточно просто понаблюдать, где эта тема проявляется у вас.",
      "escalation_level": 1
    },
    "variants": [
      {
        "cta_type": "soft_cta",
        "text": "Сохраните это как мягкое напоминание, если тема \"relationship anxiety\" вам близка.",
        "escalation_level": 3
      },
      {
        "cta_type": "educational_cta",
        "text": "Отметьте, какой пункт про \"relationship anxiety\" хочется разобрать глубже.",
        "escalation_level": 2
      },
      {
        "cta_type": "emotional_cta",
        "text": "Если откликнулось, можно просто заметить это без спешки и давления.",
        "escalation_level": 2
      },
      {
        "cta_type": "consultation_cta",
        "text": "Если хочется разобрать вашу ситуацию бережно и точнее, можно прийти на консультацию.",
        "escalation_level": 5
      },
      {
        "cta_type": "dm_cta",
        "text": "Можно написать в личные сообщения слово \"разбор\", если нужен следующий шаг.",
        "escalation_level": 4
      },
      {
        "cta_type": "save_share_cta",
        "text": "Сохраните или отправьте тому, кому сейчас важно услышать это спокойно.",
        "escalation_level": 1
      },
      {
        "cta_type": "trust_cta",
        "text": "Вернитесь к этому тексту позже и посмотрите, что изменится в ощущениях.",
        "escalation_level": 3
      },
      {
        "cta_type": "low_pressure_cta",
        "text": "Пока достаточно просто понаблюдать, где эта тема проявляется у вас.",
        "escalation_level": 1
      }
    ]
  },
  "primary_output": {
    "output_id": "dinara_day_01_storytelling_emotional_story",
    "output_format": "emotional_story",
    "source_platform": "instagram_post",
    "title": "relationship anxiety: storytelling",
    "ideal_length": "900-1300 chars",
    "pacing": "compact emotional opening, clear body, visible CTA",
    "paragraph_density": "medium",
    "emotional_rhythm": "warm -> insight -> saveable idea",
    "cta_placement": "final paragraph",
    "readability": "short paragraphs",
    "content_blocks": [
      {
        "block_type": "hook",
        "text": "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется"
      },
      {
        "block_type": "structure_beat",
        "beat": "story",
        "text": "story: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
        "order": 1
      },
      {
        "block_type": "structure_beat",
        "beat": "conflict",
        "text": "conflict: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
        "order": 2
      },
      {
        "block_type": "structure_beat",
        "beat": "resolution",
        "text": "resolution: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
        "order": 3
      },
      {
        "block_type": "cta",
        "text": "Пока достаточно просто понаблюдать, где эта тема проявляется у вас."
      }
    ],
    "production_status": "simulation_artifact"
  },
  "platform_adaptations": [
    {
      "output_format": "instagram_post",
      "adaptation_note": "Adapt relationship anxiety: storytelling into instagram_post using compact emotional opening, clear body, visible CTA.",
      "hook": "Почему \"relationship anxiety\" часто начинается не там, где мы ищем причину",
      "cta": "Отметьте, какой пункт про \"relationship anxiety\" хочется разобрать глубже.",
      "ideal_length": "900-1300 chars",
      "readability": "short paragraphs"
    },
    {
      "output_format": "telegram_longread",
      "adaptation_note": "Adapt relationship anxiety: storytelling into telegram_longread using slow build, deeper explanation, reflective CTA.",
      "hook": "Как специалист смотрит на \"relationship anxiety\" без стыда и давления",
      "cta": "Если откликнулось, можно просто заметить это без спешки и давления.",
      "ideal_length": "1800-3200 chars",
      "readability": "sectioned longread"
    },
    {
      "output_format": "reels_script",
      "adaptation_note": "Adapt relationship anxiety: storytelling into reels_script using fast hook, one idea, spoken beats.",
      "hook": "Если в \"relationship anxiety\" много напряжения, начните с этого наблюдения",
      "cta": "Если хочется разобрать вашу ситуацию бережно и точнее, можно прийти на консультацию.",
      "ideal_length": "35-55 seconds",
      "readability": "spoken script"
    },
    {
      "output_format": "carousel_script",
      "adaptation_note": "Adapt relationship anxiety: storytelling into carousel_script using slide-by-slide reveal.",
      "hook": "Что делать, когда \"relationship anxiety\" снова возвращает тревогу",
      "cta": "Можно написать в личные сообщения слово \"разбор\", если нужен следующий шаг.",
      "ideal_length": "6-8 slides",
      "readability": "scannable slides"
    }
  ],
  "packaging": {
    "main_post": {
      "output_id": "dinara_day_01_storytelling_emotional_story",
      "output_format": "emotional_story",
      "source_platform": "instagram_post",
      "title": "relationship anxiety: storytelling",
      "ideal_length": "900-1300 chars",
      "pacing": "compact emotional opening, clear body, visible CTA",
      "paragraph_density": "medium",
      "emotional_rhythm": "warm -> insight -> saveable idea",
      "cta_placement": "final paragraph",
      "readability": "short paragraphs",
      "content_blocks": [
        {
          "block_type": "hook",
          "text": "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется"
        },
        {
          "block_type": "structure_beat",
          "beat": "story",
          "text": "story: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
          "order": 1
        },
        {
          "block_type": "structure_beat",
          "beat": "conflict",
          "text": "conflict: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
          "order": 2
        },
        {
          "block_type": "structure_beat",
          "beat": "resolution",
          "text": "resolution: связать \"relationship anxiety\" с recognition, уровнем аудитории cold и позицией эксперта \"warm guide\".",
          "order": 3
        },
        {
          "block_type": "cta",
          "text": "Пока достаточно просто понаблюдать, где эта тема проявляется у вас."
        }
      ],
      "production_status": "simulation_artifact"
    },
    "title": "relationship anxiety: storytelling",
    "hook_variants": [
      {
        "hook_id": "dinara_day_01_storytelling_hook_1",
        "hook_type": "emotional_hook",
        "text": "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_2",
        "hook_type": "curiosity_hook",
        "text": "Почему \"relationship anxiety\" часто начинается не там, где мы ищем причину",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.765
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_3",
        "hook_type": "authority_hook",
        "text": "Как специалист смотрит на \"relationship anxiety\" без стыда и давления",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.81
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_4",
        "hook_type": "therapeutic_hook",
        "text": "Если в \"relationship anxiety\" много напряжения, начните с этого наблюдения",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.855
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_5",
        "hook_type": "pain_point_hook",
        "text": "Что делать, когда \"relationship anxiety\" снова возвращает тревогу",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_6",
        "hook_type": "controversial_hook",
        "text": "Непопулярная мысль про \"relationship anxiety\": дело не только в силе воли",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.765
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_7",
        "hook_type": "story_hook",
        "text": "Одна ситуация про \"relationship anxiety\", в которой многие узнают себя",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.81
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_8",
        "hook_type": "short_form_hook",
        "text": "\"relationship anxiety\" — это не всегда про проблему в отношениях",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.855
      },
      {
        "hook_id": "dinara_day_01_storytelling_hook_9",
        "hook_type": "reels_hook",
        "text": "3 признака, что \"relationship anxiety\" требует мягкого внимания",
        "fatigue_risk": "low",
        "predicted_effectiveness": 0.72
      }
    ],
    "cta_variants": [
      {
        "cta_type": "soft_cta",
        "text": "Сохраните это как мягкое напоминание, если тема \"relationship anxiety\" вам близка.",
        "escalation_level": 3
      },
      {
        "cta_type": "educational_cta",
        "text": "Отметьте, какой пункт про \"relationship anxiety\" хочется разобрать глубже.",
        "escalation_level": 2
      },
      {
        "cta_type": "emotional_cta",
        "text": "Если откликнулось, можно просто заметить это без спешки и давления.",
        "escalation_level": 2
      },
      {
        "cta_type": "consultation_cta",
        "text": "Если хочется разобрать вашу ситуацию бережно и точнее, можно прийти на консультацию.",
        "escalation_level": 5
      },
      {
        "cta_type": "dm_cta",
        "text": "Можно написать в личные сообщения слово \"разбор\", если нужен следующий шаг.",
        "escalation_level": 4
      },
      {
        "cta_type": "save_share_cta",
        "text": "Сохраните или отправьте тому, кому сейчас важно услышать это спокойно.",
        "escalation_level": 1
      },
      {
        "cta_type": "trust_cta",
        "text": "Вернитесь к этому тексту позже и посмотрите, что изменится в ощущениях.",
        "escalation_level": 3
      },
      {
        "cta_type": "low_pressure_cta",
        "text": "Пока достаточно просто понаблюдать, где эта тема проявляется у вас.",
        "escalation_level": 1
      }
    ],
    "hashtag_ideas": [
      "#relationship_anxiety",
      "#бережно",
      "#психологияотношений"
    ],
    "pinned_comment_ideas": [
      "Что в теме \"relationship anxiety\" откликнулось сильнее всего?",
      "Можно сохранить и вернуться позже."
    ],
    "story_followups": [
      "Опрос: знакома ли вам тема \"relationship anxiety\"?",
      "Стикер-вопрос: что хочется разобрать глубже?"
    ],
    "carousel_slide_ideas": [
      {
        "slide": 1,
        "idea": "story: relationship anxiety"
      },
      {
        "slide": 2,
        "idea": "conflict: relationship anxiety"
      },
      {
        "slide": 3,
        "idea": "resolution: relationship anxiety"
      }
    ],
    "reels_adaptation": {
      "output_format": "reels_script",
      "adaptation_note": "Adapt relationship anxiety: storytelling into reels_script using fast hook, one idea, spoken beats.",
      "hook": "Если в \"relationship anxiety\" много напряжения, начните с этого наблюдения",
      "cta": "Если хочется разобрать вашу ситуацию бережно и точнее, можно прийти на консультацию.",
      "ideal_length": "35-55 seconds",
      "readability": "spoken script"
    },
    "short_teaser_versions": [
      "Когда тема \"relationship anxiety\" задевает сильнее, чем кажется",
      "Почему \"relationship anxiety\" часто начинается не там, где мы ищем причину",
      "Как специалист смотрит на \"relationship anxiety\" без стыда и давления"
    ]
  },
  "narrative_sync": {
    "cross_format_continuity": true,
    "emotional_tone": "recognition",
    "cta_escalation_level": 1,
    "audience_state": "cold",
    "storytelling_continuity": {
      "current_structure": "situation_to_insight",
      "depends_on": [],
      "previous_pack_id": null
    },
    "sync_notes": [
      "Keep recognition consistent across all adaptations.",
      "Preserve audience state cold across pack variants.",
      "CTA escalation must stay at level 1 for this node."
    ]
  },
  "ai_suppression": {
    "checked_patterns": [
      "it is important to understand",
      "in today's world",
      "unlock your potential",
      "take your life to the next level",
      "as an ai",
      "delve into",
      "journey of self-discovery",
      "it should be noted",
      "в современном мире",
      "важно понимать",
      "следует отметить",
      "раскройте свой потенциал"
    ],
    "warnings": []
  },
  "anti_repetition_warnings": [],
  "hallucination_risk": {
    "risk": "low",
    "checks": [
      "No external factual claims generated.",
      "Context is simulated from campaign node only.",
      "Output remains a structured artifact, not a final expert claim."
    ]
  },
  "quality_score": {
    "style_similarity": 0.82,
    "emotional_match": 0.84,
    "clarity": 0.88,
    "readability": 0.86,
    "expert_authenticity": 0.83,
    "ai_generic_risk": 0.02,
    "hallucination_risk": "low",
    "cta_quality": 0.86,
    "engagement_potential": 0.72,
    "overall_score": 0.827
  }
}
```
