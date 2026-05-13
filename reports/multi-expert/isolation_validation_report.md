# Isolation Validation Report

Generated: 2026-05-12T23:28:09.890Z

## Validation Result

- Passed: true
- Experts checked: 4

## Retrieval Isolation

| expert_id | namespace_filter | accepted_namespace | cross_probe_rejected |
| --- | --- | --- | --- |
| dinara | namespace == "dinara_main" | dinara_main | yes |
| relationship_coach_demo | namespace == "relationship_coach_demo_placeholder" | relationship_coach_demo_placeholder | yes |
| medical_educator_demo | namespace == "medical_educator_demo_placeholder" | medical_educator_demo_placeholder | yes |
| finance_creator_demo | namespace == "finance_creator_demo_placeholder" | finance_creator_demo_placeholder | yes |

## Voice Isolation

| expert_id | voice_profile_path | profiles_loaded | cross_expert_voice_sources_used |
| --- | --- | --- | --- |
| dinara | expert_profiles/dinara/voice | 2 | false |
| relationship_coach_demo | configs/experts/relationship_coach_demo/voice-profile.placeholder.json | 1 | false |
| medical_educator_demo | configs/experts/medical_educator_demo/voice-profile.placeholder.json | 1 | false |
| finance_creator_demo | configs/experts/finance_creator_demo/voice-profile.placeholder.json | 1 | false |

## Feedback Isolation

| expert_id | feedback_memory_path | memories_loaded | memory_scope | cross_expert_feedback_used |
| --- | --- | --- | --- | --- |
| dinara | expert_profiles/dinara/feedback_memory | 5 | expert_scoped | false |
| relationship_coach_demo | configs/experts/relationship_coach_demo/feedback-memory.placeholder.json | 1 | expert_scoped | false |
| medical_educator_demo | configs/experts/medical_educator_demo/feedback-memory.placeholder.json | 1 | expert_scoped | false |
| finance_creator_demo | configs/experts/finance_creator_demo/feedback-memory.placeholder.json | 1 | expert_scoped | false |

## Warnings And Errors

No validation issues found.
