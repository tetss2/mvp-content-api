# Runtime Generation Flow Report

Generated: 2026-05-13T19:23:40.236Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_mock_only`.

## Summary

- Requests simulated: 5
- Average combined quality: 0.734
- Average generation evaluation: 0.808
- Adapter mode: `local_runtime_to_generation_sandbox`
- Generator used: `mock`

## Simulation Runs

| Run | Request | Length | Tone | Runtime Decision | Context | Score | Warnings |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| short-instagram-post | relationship anxiety | short | expert_warm | recognition_hook/moderate/medium | 4 | 0.752 | author_voice_drift, mock_adapter_used |
| normal-telegram-post | emotional dependency | medium | empathetic | therapeutic_hook/moderate/medium | 5 | 0.732 | author_voice_drift, mock_adapter_used |
| long-article-mode | female sexuality myths | long | calm | therapeutic_hook/deep/medium | 4 | 0.746 | author_voice_drift, mock_adapter_used |
| direct-faq-answer | shame and desire | medium | direct | therapeutic_hook/deep/medium | 4 | 0.725 | author_voice_drift, missing_cta, mock_adapter_used |
| soft-sales-consultation | boundaries in intimacy | medium | expert_warm | therapeutic_hook/moderate/medium | 5 | 0.717 | reduce_cta_strength, author_voice_drift, mock_adapter_used |

## Example Runtime State

```json
{
  "schema_version": "2026-05-13.unified_generation_runtime.v1",
  "run_id": "runtime_2026-05-13T19-23-39-196Z",
  "created_at": "2026-05-13T19:23:39.196Z",
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
      "authorityGrowth": 0.604,
      "emotionalTrustGrowth": 0.59,
      "educationalTrust": 0.448,
      "vulnerabilityTrust": 0.316,
      "consistencyTrust": 0.588,
      "audienceFamiliarity": 0.551,
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

## Example Generated Content Structure

```json
{
  "provider": "mock",
  "model": "local-deterministic-mock",
  "output_chars": 757,
  "paragraph_count": 4,
  "artifact_paths": {
    "request": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/request.json",
    "contextPack": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/context_pack.json",
    "orchestrationPlan": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/orchestration_plan.json",
    "finalPrompt": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/final_prompt.txt",
    "generatedOutput": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/generated_output.md",
    "evaluation": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/evaluation.json",
    "runSummary": "expert_profiles/dinara/reports/generation_runs/2026-05-13T19-23-39-481Z_short-instagram-post/run_summary.md"
  }
}
```
