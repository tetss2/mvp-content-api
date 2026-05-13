# Feedback Memory Report

Generated: 2026-05-12T23:10:47.165Z

This report is local-only and recommendation-only. It does not modify prompts, retrieval scoring, indexes, Telegram behavior, or model training.

## Summary

- Runs analyzed: 5
- Successful runs: 2
- Weak runs: 2

## Strongest Generation Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
| hook -> problem framing -> expert explanation -> example -> soft CTA | 1 | 0.83 | stable | none |
| case setup -> pattern -> interpretation -> general lesson -> CTA | 1 | 0.81 | stable | none |

## Weakest Generation Patterns

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
| short answer -> nuance -> practical recommendation -> when to seek specialist | 1 | 0.79 | stable | missing_cta:1, low_emotional_warmth:1 |
| punchy statement -> contrast -> myth -> question | 1 | 0.7 | stable | expert_tone_match_low:1, low_emotional_warmth:1 |

## Common Warnings

- missing_cta: 1
- low_emotional_warmth: 2
- expert_tone_match_low: 1

## Adaptive Recommendations

- [medium] generation_structure: Prefer structure pattern "hook -> problem framing -> expert explanation -> example -> soft CTA" for similar intents while it keeps average score 0.83.
- [high] weak_pattern_suppression: Review or suppress weak structure pattern "short answer -> nuance -> practical recommendation -> when to seek specialist" before reusing it automatically.
- [high] cta_strategy: Strengthen CTA handling for faq_answer; detected weak CTA with warnings missing_cta.
- [medium] style_drift: Add review attention to faq_answer; style drift warnings: low_emotional_warmth.
- [medium] retrieval_context: Best content-kind mix so far: content_kind:educational+therapeutic_case+faq average=0.83.
- [high] safety_boundary: Keep this recommendation-only; do not auto-rewrite prompts, mutate retrieval scoring, fine-tune, or wire into Telegram.
