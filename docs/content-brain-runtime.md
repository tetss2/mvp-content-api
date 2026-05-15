# Content Brain Runtime

Lightweight content brain adds per-expert memory and recommendations for non-Dinara runtime experts without database migrations, Redis, queues, or a UI overhaul.

Dinara stays on the stable production path. The brain layer is skipped when `expertId === "dinara"`.

## Runtime Files

Content memory is stored at:

```text
runtime_data/expert_content_memory/<expertId>.json
```

It records generated text metadata:

- generated topic
- detected hook
- detected CTA
- content type
- platform
- timestamp
- generation count
- scenario, length mode, variant

Content brain profile is stored at:

```text
runtime_data/expert_content_brain/<expertId>.json
```

Profile shape:

```json
{
  "expertId": "",
  "audienceProfile": {},
  "contentBalance": {},
  "usedHooks": [],
  "usedTopics": [],
  "usedCTA": [],
  "recommendedTopics": [],
  "recommendedFormats": [],
  "recommendedHooks": [],
  "lastUpdated": ""
}
```

## Generation Flow

After each successful text generation for a non-Dinara runtime expert:

1. The runtime extracts a lightweight hook from the first paragraph.
2. The runtime extracts a CTA from the last CTA-like paragraph or final paragraph.
3. The metadata is appended to expert content memory.
4. The brain profile is rebuilt from identity profile plus content memory.

Before generating text for a non-Dinara runtime expert, the prompt receives a compact content brain block with:

- recent topics to avoid
- recent hooks to avoid
- recent CTA patterns to avoid
- recommended next topic angles
- missing or underused formats
- fresh hook directions

This is an anti-repetition layer only. It does not change retrieval, onboarding, queues, media generation, or Dinara production behavior.

## Commands

```text
/brain_status
/brain_show
/content_memory
/brain_rebuild
```

`/brain_status` shows active expert, memory items, unique topics, unique hooks, recommended topics count, and whether the brain is ready.

`/brain_show` shows top topics, audience assumptions, overused hooks, recommended next content, and CTA balance.

`/content_memory` shows recent generated topics/hooks/CTA.

`/brain_rebuild` rebuilds the brain profile from the current identity profile and content memory. It is admin/full_access only.

## Recommendation Logic

The brain is intentionally simple:

- Used topics/hooks/CTA are de-duplicated from recent memory.
- Top topics, overused hooks, and CTA balance are frequency counts.
- Recommended topics come from identity profile topics first, then fallback content angles.
- Recommended hooks come from identity hook patterns first, then fallback fresh opening patterns.
- Recommended formats are identity preferred formats plus missing text variants.

## Validation

Run:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
node --check knowledge_ingest.js
node --check knowledge_retrieval.js
```
