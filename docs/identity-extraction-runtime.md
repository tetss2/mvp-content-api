# Identity Extraction Runtime

Lightweight runtime layer for non-Dinara experts. It extracts a compact identity profile from already indexed runtime chunks and stores it as local JSON.

## Storage

Profiles are written to:

```text
runtime_data/expert_identity_profiles/<expertId>.json
```

Shape:

```json
{
  "expertId": "...",
  "styleProfile": {
    "tone": [],
    "phrases": [],
    "structure": [],
    "ctaPatterns": [],
    "forbiddenPatterns": []
  },
  "nicheProfile": {
    "niche": "",
    "topics": [],
    "audience": "",
    "terminology": []
  },
  "contentProfile": {
    "preferredFormats": [],
    "postLength": "",
    "hookPatterns": [],
    "examples": []
  },
  "status": "draft",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

`status` can be `draft`, `ready`, or `failed`.

## When It Runs

After successful runtime ingestion for a non-Dinara expert, the bot reads:

```text
runtime_data/expert_indexes/<expertId>/docstore.jsonl
```

It sends a bounded digest of indexed chunks plus minimal expert metadata to OpenAI and saves the extracted profile.

Dinara is excluded. Her production behavior, prompts, retrieval, media generation, and stable voice stack stay unchanged.

## Commands

```text
/identity_status
/identity_show
/identity_extract
```

`/identity_extract` is admin/full_access only. It rebuilds the active expert identity profile from indexed runtime chunks.

`/identity_status` shows the active expert, whether the profile exists, status, topics count, and style readiness.

`/identity_show` shows a compact summary: tone, niche, audience, top topics, and CTA style. If no profile exists, it shows the minimal onboarding-derived profile that generation will use as fallback.

## Generation Behavior

For non-Dinara runtime experts, text generation now loads the identity profile when present and injects it into the system prompt as the strongest style guide.

If no identity profile exists, generation uses a minimal profile derived from onboarding fields:

- `displayName`
- `niche`
- `styleDescription`

This keeps new experts usable before extraction while avoiding Dinara-specific voice bleed.

## Validation

Run:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
node --check knowledge_ingest.js
node --check knowledge_retrieval.js
```

