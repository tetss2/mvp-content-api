# Runtime Resolution Report

Generated: 2026-05-12T23:28:09.890Z

## Runtime Config Files

| expert_id | retrieval | generation | tone | cta | safety | style | context | output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dinara | true | true | true | true | true | true | true | true |
| relationship_coach_demo | true | true | true | true | true | true | true | true |
| medical_educator_demo | true | true | true | true | true | true | true | true |
| finance_creator_demo | true | true | true | true | true | true | true | true |

## Example Runtime Resolution

```json
{
  "expert_id": "dinara",
  "display_name": "Dinara Kachaeva",
  "status": "active",
  "retrieval_namespace": "dinara_main",
  "voice_profile_path": "expert_profiles/dinara/voice",
  "feedback_memory_path": "expert_profiles/dinara/feedback_memory",
  "runtime_config": {
    "retrieval_settings_path": {
      "path": "configs/experts/dinara/retrieval.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "retrieval_namespace": "dinara_main",
        "allowed_source_roots": [
          "expert_profiles/dinara",
          "knowledge_indexes/psychologist",
          "knowledge_indexes/sexologist",
          "kb/sexologist",
          "knowledge_intake/psychologist",
          "knowledge_intake/sexologist"
        ],
        "blocked_cross_expert_namespaces": [
          "relationship_coach_demo_placeholder",
          "medical_educator_demo_placeholder",
          "finance_creator_demo_placeholder"
        ],
        "default_match_count": 8,
        "requires_namespace_filter": true,
        "simulation_only": true
      }
    },
    "generation_settings_path": {
      "path": "configs/experts/dinara/generation-policy.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "allowed_content_kinds": [
          "educational_post",
          "storytelling",
          "faq_answer",
          "sales_post",
          "short_hook",
          "therapeutic_case"
        ],
        "forbidden_content_kinds": [
          "medical_diagnosis",
          "legal_advice",
          "financial_advice",
          "explicit_instruction_to_self_treat"
        ],
        "default_generation_intent": "educational_post",
        "default_language": "ru",
        "platform_defaults": {
          "telegram": {
            "length": "medium",
            "format": "post",
            "cta_style": "soft"
          },
          "instagram": {
            "length": "medium",
            "format": "post",
            "cta_style": "soft"
          }
        },
        "prompt_isolation": {
          "requires_expert_id": true,
          "requires_voice_profile_path": true,
          "forbid_shared_prompt_memory": true,
          "forbid_unscoped_style_examples": true
        }
      }
    },
    "tone_settings_path": {
      "path": "configs/experts/dinara/tone.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "primary_tone": "warm_expert",
        "allowed_tones": [
          "warm_expert",
          "empathetic",
          "educational",
          "calm",
          "soft_direct"
        ],
        "emotional_tone_limits": {
          "max_pressure": "low",
          "max_fear": "low",
          "max_clinical_distance": "medium",
          "required_warmth": "high"
        }
      }
    },
    "cta_settings_path": {
      "path": "configs/experts/dinara/cta.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "supports_cta_generation": true,
        "allowed_cta_styles": [
          "none",
          "soft",
          "consultative"
        ],
        "default_cta_style": "soft",
        "cta_aggressiveness_limit": "low",
        "forbidden_cta_patterns": [
          "scarcity_pressure",
          "guaranteed_transformation",
          "shaming",
          "medical_promise"
        ]
      }
    },
    "safety_settings_path": {
      "path": "configs/experts/dinara/safety-policy.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "medical_sensitivity": "refer_to_specialist_for_diagnosis_or_treatment",
        "legal_sensitivity": "no_legal_advice",
        "therapeutic_constraints": [
          "Do not diagnose readers from social content.",
          "Do not present posts as psychotherapy.",
          "Protect confidentiality and avoid identifiable case details.",
          "Use reflective and educational framing for sensitive topics."
        ],
        "educational_constraints": [
          "Explain uncertainty where needed.",
          "Avoid one-size-fits-all prescriptions.",
          "Prefer grounded psychoeducation over absolute claims."
        ],
        "forbidden_claims": [
          "guaranteed_result",
          "clinical_diagnosis",
          "treatment_plan",
          "emergency_advice"
        ]
      }
    },
    "style_settings_path": {
      "path": "configs/experts/dinara/style-constraints.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "style_memory_scope": "expert_profiles/dinara/voice",
        "voice_profile_required": true,
        "generic_ai_suppression_required": true,
        "forbid_cross_expert_voice_examples": true,
        "style_principles": [
          "warmth",
          "introspection",
          "metaphor_with_restraint",
          "reader_dignity",
          "soft_cta"
        ],
        "disallowed_style_sources": [
          "configs/experts/relationship_coach_demo",
          "configs/experts/medical_educator_demo",
          "configs/experts/finance_creator_demo"
        ]
      }
    },
    "context_policy_path": {
      "path": "configs/experts/dinara/context-policy.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "max_context_items": 6,
        "max_total_chars": 12000,
        "exclude_unsafe_sources": true,
        "exclude_questionnaires_from_general_generation": true,
        "require_retrieval_namespace": true,
        "require_context_trace": true
      }
    },
    "output_policy_path": {
      "path": "configs/experts/dinara/output-policy.json",
      "exists": true,
      "config": {
        "expert_id": "dinara",
        "allowed_platforms": [
          "telegram",
          "instagram"
        ],
        "allowed_formats": [
          "post",
          "answer",
          "hook_list",
          "carousel_script"
        ],
        "default_output": {
          "platform": "instagram",
          "format": "post",
          "length": "medium",
          "language": "ru"
        },
        "caption_markdown_policy": "strip_risky_markdown_for_media_captions",
        "simulation_only": true
      }
    }
  },
  "registry_namespace_resolution": "dinara_main",
  "config_status": "active"
}
```

## Example Generation Plan

```json
{
  "expert_id": "dinara",
  "default_generation_intent": "educational_post",
  "allowed_content_kinds": [
    "educational_post",
    "storytelling",
    "faq_answer",
    "sales_post",
    "short_hook",
    "therapeutic_case"
  ],
  "forbidden_content_kinds": [
    "medical_diagnosis",
    "legal_advice",
    "financial_advice",
    "explicit_instruction_to_self_treat"
  ],
  "tone": "warm_expert",
  "cta_style": "soft",
  "output_default": {
    "platform": "instagram",
    "format": "post",
    "length": "medium",
    "language": "ru"
  },
  "prompt_scope": {
    "expert_id": "dinara",
    "voice_profile_path": "expert_profiles/dinara/voice",
    "style_constraints_path": "configs/experts/dinara/style-constraints.json",
    "feedback_memory_path": "expert_profiles/dinara/feedback_memory"
  }
}
```
