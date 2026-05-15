# Content Strategy Runtime

Lightweight content strategy runtime adds per-expert strategic recommendations for non-Dinara runtime experts. It is file-based and does not require database migrations, Redis, BullMQ, microservices, or changes to the media generation pipeline.

Dinara stays on the stable production path. Strategy is skipped when `expertId === "dinara"`.

## Runtime Files

Strategy profiles are stored at:

```text
runtime_data/expert_content_strategy/<expertId>.json
```

Profile shape:

```json
{
  "expertId": "",
  "contentBalance": {
    "expert": 0,
    "engagement": 0,
    "personal": 0,
    "conversion": 0
  },
  "platformStrategies": {
    "telegram": {},
    "instagram": {},
    "reels": {}
  },
  "recommendedNextTopics": [],
  "recommendedHooks": [],
  "recommendedFormats": [],
  "missingContentTypes": [],
  "overusedTopics": [],
  "overusedCTA": [],
  "seriesIdeas": [],
  "lastUpdated": ""
}
```

## How It Works

After each successful text generation for a non-Dinara runtime expert:

1. Content memory stores the generated topic, detected hook, detected CTA, format, platform, and timestamp.
2. Content brain is rebuilt from identity profile plus content memory.
3. Content strategy is rebuilt from content memory, identity profile, and content brain.
4. The next generation receives a compact strategy prompt with balance gaps, recommended topics, recommended formats, CTA fatigue, and series opportunities.

The strategy engine is intentionally deterministic and lightweight:

- Content balance is inferred from generated topic/hook/CTA signals.
- Missing content types are detected from expert, engagement, personal, and conversion balance.
- Overused topics and CTA are frequency counts from content memory.
- Recommended topics and hooks come from identity profile, content brain, and fallback strategic angles.
- Platform strategies are generated for Telegram, Instagram, and Reels.
- Virality scoring estimates hook strength, emotionality, controversy, and engagement potential.
- Series engine suggests mini-series, topic chains, and recurring formats.

## Commands

```text
/strategy_status
/strategy_show
/strategy_rebuild
/content_plan
```

`/strategy_status` shows active expert, whether strategy exists, content balance, overused topic count, recommended topic count, and readiness.

`/strategy_show` shows current balance, missing content types, recommended next content, weak areas, CTA guidance, audience engagement assumptions, virality signals, and series ideas.

`/strategy_rebuild` rebuilds strategy for the active non-Dinara expert from memory, identity, and brain. It is admin/full_access only.

`/content_plan` returns a 7-idea lightweight roadmap with hooks, formats, CTA type, and platform suggestion.

## Validation

Run:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
node --check knowledge_ingest.js
node --check knowledge_retrieval.js
```
