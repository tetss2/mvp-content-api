# Unified Runtime Execution Report

Generated: 2026-05-13T19:14:17.487Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`.

## Summary

- Runs simulated: 30
- Average final quality: 0.681
- First run id: `runtime_2026-05-13T19-14-15-539Z`
- Last run id: `runtime_2026-05-13T19-14-17-453Z`
- External APIs called: `false`
- Telegram runtime mutated: `false`
- FAISS/index mutated: `false`

## Example Runtime State

```json
{
  "expert_identity": {
    "expert_id": "dinara",
    "scenario": "multi_expert_content_generation"
  },
  "generation_intent": {
    "intent": "audience_warming",
    "topic": "relationship anxiety",
    "requested_length": "medium"
  },
  "audience_state": {
    "stage": "warming",
    "memory_depth": 0
  },
  "campaign_context": {
    "campaign_type": "trust_building_flow",
    "campaign_day": 1,
    "campaign_id": "dinara_trust_building_flow_30d"
  },
  "narrative_continuity": {
    "recent_topics": [],
    "active_threads": []
  },
  "emotional_pacing": {
    "recent_cycles": [],
    "requested_depth": "auto"
  },
  "cta_pacing": {
    "selected_cta_type": "low_pressure_cta",
    "recent_ctas": []
  },
  "trust_progression": {
    "trust_state": {
      "authorityGrowth": 0.132,
      "emotionalTrustGrowth": 0.15,
      "educationalTrust": 0.168,
      "vulnerabilityTrust": 0.106,
      "consistencyTrust": 0.14,
      "audienceFamiliarity": 0.091,
      "trustTrajectory": [
        {
          "day": 1,
          "score": 0.131,
          "topic": "relationship anxiety"
        }
      ],
      "authorityTrajectory": [
        {
          "day": 1,
          "score": 0.132,
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
  "production_format": "instagram_post",
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

## Example Generation Orchestration Flow

```json
[
  {
    "step": "load_expert",
    "status": "completed",
    "expert_id": "dinara",
    "profile_path": "expert_profiles/dinara/profile.json"
  },
  {
    "step": "load_cognition_state",
    "status": "completed",
    "loaded_from_disk": true,
    "storage_paths": [
      "storage/cognition/dinara/topic-graph-state.json",
      "storage/cognition/dinara/trust-memory.json",
      "storage/cognition/dinara/cta-history.json",
      "storage/cognition/dinara/audience-memory.json",
      "storage/cognition/dinara/narrative-memory.json",
      "storage/cognition/dinara/emotional-cycles.json",
      "storage/cognition/dinara/optimization-history.json"
    ]
  },
  {
    "step": "load_campaign_state",
    "status": "completed",
    "campaign_id": "dinara_trust_building_flow_30d",
    "day": 1
  },
  {
    "step": "retrieve_context",
    "status": "completed",
    "selected_count": 6,
    "warnings": []
  },
  {
    "step": "evaluate_repetition",
    "status": "pass",
    "risk_score": 0,
    "same_topic_recent_count": 0,
    "repeated_hook_recent_count": 0,
    "recommendation": "Proceed with variation controls."
  },
  {
    "step": "evaluate_trust_pacing",
    "status": "pass",
    "trust_score": 0.35,
    "selected_cta_level": 1,
    "allowed_cta_level": 3,
    "overload_risk": "low",
    "recommendation": "CTA pacing fits current trust memory."
  },
  {
    "step": "evaluate_audience_memory",
    "status": "pass",
    "current_audience_state": "warming",
    "requested_audience_state": "warming",
    "fatigue_risk": "low",
    "recent_high_intensity_count": 0,
    "recommendation": "Audience memory supports the selected depth."
  },
  {
    "step": "generate_strategic_plan",
    "status": "completed",
    "generation_intent": "educational_post",
    "strategy_goal": "Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming."
  },
  {
    "step": "build_production_pack",
    "status": "completed",
    "pack_id": "dinara_runtime_day_01_production_pack",
    "output_format": "educational_post"
  },
  {
    "step": "validate_author_voice",
    "status": "completed",
    "overall_voice_match_score": 0.445,
    "generic_ai_risk": "low"
  },
  {
    "step": "run_ai_suppression",
    "status": "completed",
    "warning_count": 0
  },
  {
    "step": "calculate_quality_score",
    "status": "completed",
    "base_production_score": 0.827,
    "author_voice_score": 0.445,
    "validation_penalty": 0.035,
    "analytics_signal_boost": 0,
    "final_quality_score": 0.684
  },
  {
    "step": "produce_final_runtime_output",
    "status": "completed",
    "validation_status": "pass_with_warnings",
    "final_quality_score": 0.684
  }
]
```

## 30-Day Validation Table

| Day | Topic | Validation | Quality | Warnings |
| --- | --- | --- | ---: | --- |
| 1 | relationship anxiety | pass_with_warnings | 0.684 | author_voice_drift |
| 2 | emotional dependency | pass_with_warnings | 0.689 | author_voice_drift |
| 3 | female sexuality myths | pass_with_warnings | 0.677 | author_voice_drift |
| 4 | boundaries in intimacy | pass_with_warnings | 0.619 | ai_generic_patterns_detected, author_voice_drift |
| 5 | shame and desire | pass_with_warnings | 0.674 | author_voice_drift |
| 6 | trust after conflict | pass_with_warnings | 0.68 | author_voice_drift |
| 7 | body sensitivity | pass_with_warnings | 0.655 | reduce_cta_strength, author_voice_drift |
| 8 | self-worth in relationships | pass_with_warnings | 0.671 | author_voice_drift |
| 9 | adult attachment | pass_with_warnings | 0.689 | author_voice_drift |
| 10 | soft communication | pass_with_warnings | 0.69 | author_voice_drift |
| 11 | relationship anxiety | pass_with_warnings | 0.687 | author_voice_drift |
| 12 | emotional dependency | pass_with_warnings | 0.622 | ai_generic_patterns_detected, author_voice_drift |
| 13 | female sexuality myths | pass_with_warnings | 0.684 | author_voice_drift |
| 14 | boundaries in intimacy | pass_with_warnings | 0.646 | reduce_cta_strength, author_voice_drift |
| 15 | shame and desire | pass_with_warnings | 0.673 | author_voice_drift |
| 16 | trust after conflict | pass_with_warnings | 0.679 | author_voice_drift |
| 17 | body sensitivity | pass_with_warnings | 0.685 | author_voice_drift |
| 18 | self-worth in relationships | pass_with_warnings | 0.682 | author_voice_drift |
| 19 | adult attachment | pass_with_warnings | 0.673 | author_voice_drift |
| 20 | soft communication | pass_with_warnings | 0.634 | ai_generic_patterns_detected, author_voice_drift |
| 21 | relationship anxiety | pass_with_warnings | 0.676 | reduce_cta_strength, author_voice_drift |
| 22 | emotional dependency | pass_with_warnings | 0.716 | author_voice_drift |
| 23 | female sexuality myths | pass_with_warnings | 0.73 | author_voice_drift |
| 24 | boundaries in intimacy | pass_with_warnings | 0.68 | reduce_cta_strength, author_voice_drift |
| 25 | shame and desire | pass_with_warnings | 0.714 | author_voice_drift |
| 26 | trust after conflict | pass_with_warnings | 0.717 | author_voice_drift |
| 27 | body sensitivity | pass_with_warnings | 0.729 | author_voice_drift |
| 28 | self-worth in relationships | pass_with_warnings | 0.628 | reduce_cta_strength, ai_generic_patterns_detected, author_voice_drift |
| 29 | adult attachment | pass_with_warnings | 0.716 | author_voice_drift |
| 30 | soft communication | pass_with_warnings | 0.721 | author_voice_drift |
