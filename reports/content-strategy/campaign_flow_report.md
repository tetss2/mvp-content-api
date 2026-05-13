# Campaign Flow Report

Generated: 2026-05-12T23:35:03.317Z

## Campaign Progression

| day | stage | intent | platform | topic | audience_state | cta |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | warming | storytelling | instagram_post | relationship anxiety | cold | low_pressure_cta |
| 2 | warming | storytelling | reels_script | emotional dependency | warming | emotional_cta |
| 3 | warming | engagement | telegram_longread | female sexuality myths | warming | educational_cta |
| 4 | warming | FAQ | carousel_concept | boundaries in intimacy | warming | emotional_cta |
| 5 | warming | storytelling | story_sequence | shame and desire | warming | trust_cta |
| 6 | warming | storytelling | faq_thread | trust after conflict | warming | low_pressure_cta |
| 7 | warming | authority | mini_series | body sensitivity | engaged | soft_cta |
| 8 | trust_building | therapeutic | instagram_post | self-worth in relationships | engaged | trust_cta |
| 9 | trust_building | FAQ | reels_script | adult attachment | engaged | soft_cta |
| 10 | trust_building | authority | telegram_longread | soft communication | engaged | educational_cta |
| 11 | trust_building | therapeutic | carousel_concept | relationship anxiety | engaged | emotional_cta |
| 12 | trust_building | authority | story_sequence | emotional dependency | engaged | trust_cta |
| 13 | trust_building | authority | faq_thread | female sexuality myths | trusting | low_pressure_cta |
| 14 | trust_building | storytelling | mini_series | boundaries in intimacy | trusting | soft_cta |
| 15 | trust_building | soft_sales | instagram_post | shame and desire | trusting | dm_cta |
| 16 | trust_building | therapeutic | reels_script | trust after conflict | trusting | trust_cta |
| 17 | trust_building | authority | telegram_longread | body sensitivity | trusting | soft_cta |
| 18 | conversion_support | soft_sales | carousel_concept | self-worth in relationships | trusting | emotional_cta |
| 19 | conversion_support | soft_sales | story_sequence | adult attachment | trusting | trust_cta |
| 20 | conversion_support | soft_sales | faq_thread | soft communication | considering_purchase | low_pressure_cta |
| 21 | conversion_support | FAQ | mini_series | relationship anxiety | considering_purchase | soft_cta |
| 22 | conversion_support | soft_sales | instagram_post | emotional dependency | considering_purchase | consultation_cta |
| 23 | conversion_support | storytelling | reels_script | female sexuality myths | considering_purchase | dm_cta |
| 24 | conversion_support | FAQ | telegram_longread | boundaries in intimacy | considering_purchase | trust_cta |
| 25 | continuity | soft_sales | carousel_concept | shame and desire | considering_purchase | emotional_cta |
| 26 | continuity | FAQ | story_sequence | trust after conflict | returning_reader | trust_cta |
| 27 | continuity | authority | faq_thread | body sensitivity | returning_reader | low_pressure_cta |
| 28 | continuity | authority | mini_series | self-worth in relationships | returning_reader | soft_cta |
| 29 | continuity | longform_article | instagram_post | adult attachment | returning_reader | trust_cta |
| 30 | continuity | soft_sales | reels_script | soft communication | returning_reader | dm_cta |

## Supported Campaign Types

| campaign_type | label | default_days | intent_pattern |
| --- | --- | --- | --- |
| warming_sequence | Audience Warming Sequence | 7 | audience_warming -> educational -> storytelling -> engagement -> authority |
| authority_building | Authority-Building Sequence | 10 | educational -> authority -> FAQ -> carousel -> longform_article |
| launch_campaign | Launch Campaign | 14 | audience_warming -> authority -> objection_handling -> soft_sales -> sales |
| educational_series | Educational Series | 30 | educational -> FAQ -> carousel -> longform_article -> engagement |
| emotional_storytelling_arc | Emotional Storytelling Arc | 14 | storytelling -> therapeutic -> audience_warming -> engagement -> soft_sales |
| conversion_sequence | Conversion Sequence | 10 | authority -> objection_handling -> soft_sales -> sales -> FAQ |
| faq_cluster | FAQ Cluster | 7 | FAQ -> educational -> objection_handling -> engagement |
| trust_building_flow | Trust-Building Flow | 14 | storytelling -> authority -> therapeutic -> FAQ -> soft_sales |

## Topic Relationship Graph Summary

- Nodes: 30
- Edges: 49
- Relationship types: related_topic, narrative_dependency
