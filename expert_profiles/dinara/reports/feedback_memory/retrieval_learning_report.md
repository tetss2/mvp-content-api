# Retrieval Learning Report

Generated: 2026-05-12T23:10:47.168Z

## Insights

- Best content-kind mix so far: content_kind:educational+therapeutic_case+faq average=0.83.
- Best source-type mix so far: source_type:approved_high_confidence+approved_dataset average=0.782.
- Best full context signature so far: kinds:educational+therapeutic_case+faq|sources:approved_high_confidence+approved_dataset average=0.83.
- Watch weaker content-kind mix: content_kind:short_hook+faq+educational average=0.7.

## Content Kind Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
| content_kind:educational+therapeutic_case+faq | 1 | 0.83 | stable | none |
| content_kind:therapeutic_case+educational+faq | 1 | 0.81 | stable | none |
| content_kind:faq+educational | 1 | 0.79 | stable | missing_cta:1, low_emotional_warmth:1 |
| content_kind:storytelling+therapeutic_case+faq+educational | 1 | 0.78 | stable | none |
| content_kind:short_hook+faq+educational | 1 | 0.7 | stable | expert_tone_match_low:1, low_emotional_warmth:1 |

## Source Type Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
| source_type:approved_high_confidence+approved_dataset | 5 | 0.782 | stable | missing_cta:1, low_emotional_warmth:2, expert_tone_match_low:1 |

## Context Signature Performance

| pattern | usage_count | average_score | recent_trend | warnings |
| --- | ---: | ---: | --- | --- |
| kinds:educational+therapeutic_case+faq|sources:approved_high_confidence+approved_dataset | 1 | 0.83 | stable | none |
| kinds:therapeutic_case+educational+faq|sources:approved_high_confidence+approved_dataset | 1 | 0.81 | stable | none |
| kinds:faq+educational|sources:approved_high_confidence+approved_dataset | 1 | 0.79 | stable | missing_cta:1, low_emotional_warmth:1 |
| kinds:storytelling+therapeutic_case+faq+educational|sources:approved_high_confidence+approved_dataset | 1 | 0.78 | stable | none |
| kinds:short_hook+faq+educational|sources:approved_high_confidence+approved_dataset | 1 | 0.7 | stable | expert_tone_match_low:1, low_emotional_warmth:1 |

## Boundary

These insights do not mutate retrieval scoring. They only identify context mixes worth reviewing.
