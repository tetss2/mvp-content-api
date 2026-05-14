# Expert Runtime Foundation

This foundation adds a local runtime expert registry without changing Telegram UX, retrieval behavior, billing, or the current generation flow.

## Runtime Registry

The active runtime registry lives at:

```text
runtime_data/experts.json
```

Current default record:

```json
{
  "expertId": "dinara",
  "displayName": "Динара",
  "knowledgeBase": "psychologist",
  "styleProfile": "dinara_style",
  "status": "active",
  "createdAt": "ISO"
}
```

On startup, `index.js` auto-creates this file when it is missing, reads it safely, and logs registry telemetry. Broken or missing JSON falls back to the Dinara default instead of crashing with `ENOENT`.

## Runtime Helpers

The runtime layer now has these helpers in `index.js`:

```js
getExpertById(expertId)
getDefaultExpert()
listActiveExperts()
```

They currently read local JSON only. The helpers also tolerate a future array-based registry, but the runtime file is intentionally kept as the minimal single-expert object for this phase.

## How A New Expert Is Added

For the current local/runtime version, a new expert is added by creating or extending the local expert registry with:

- `expertId`: stable runtime id, for example `relationship_coach_demo`
- `displayName`: human-readable name
- `knowledgeBase`: the retrieval namespace or scenario key to use
- `styleProfile`: the author/style profile id to use
- `status`: `active` to allow selection
- `createdAt`: ISO timestamp

The current UX does not expose expert selection. Until that exists, the runtime chooses the first active expert, or `DEFAULT_EXPERT_ID` when it is set.

## Generation Ownership

Every text generation now resolves ownership internally:

- `expertId`
- `knowledgeBase`
- `styleProfile`
- isolation hints for embeddings, retrieval config, and author profile

This metadata is stored in `userState` after generation as:

- `lastExpertId`
- `lastKnowledgeBase`
- `lastStyleProfile`
- `lastGenerationOwnership`

It is also written into per-user runtime events for `generate_text`.

## Onboarding Flow

Current onboarding remains local and filesystem-based. When a user-created scenario is used, generation ownership switches to a user-filesystem knowledge base marker:

```text
user-filesystem:<scenarioId>
```

This prepares the runtime to route a future onboarded expert to dedicated retrieval and author profile assets without changing the visible Telegram flow now.

## Isolation Foundation

The foundation prepares, but does not fully enforce, separate:

- embeddings namespace
- retrieval config id
- author profile id
- expected embeddings path
- expected author profile path

These values are metadata today. The existing retrieval services still run through the current scenario and knowledge-base paths.

## Not Implemented Yet

- No real multi-tenant architecture
- No database-backed expert registry
- No payments or checkout changes
- No Telegram expert picker
- No separate vector index creation per expert
- No migration of existing retrieval indexes
- No production/main changes
- No SaaS account/team/org model

## Future SaaS Requirements

A SaaS version will need:

- database-backed experts, users, workspaces, and entitlements
- durable expert selection and permissions
- isolated vector indexes or tenant-aware retrieval filters
- per-expert author profiles and generation policies
- onboarding pipeline that promotes approved materials into expert-scoped indexes
- audit logs for generation ownership, retrieval source usage, and billing events
- admin tools for activating, pausing, and migrating experts
