# Monetization & Onboarding Readiness Audit

Date: 2026-05-14
Branch audited: `ai-workflow-foundation`
Scope: read-only architecture audit after Railway beta polling stabilization.

## 1. Current working capabilities

- Railway beta/demo runtime is isolated at startup: `RUNTIME_MODE=beta|demo|staging|railway-beta` selects `TELEGRAM_BETA_TOKEN`; `TELEGRAM_TOKEN` is not required for demo/beta. `START_LEADS_BOT=false` keeps `leads-bot.js` out of the `start.js` import path.
- Main runtime has a production-safe polling lifecycle: explicit `startPolling()`, file lock, webhook cleanup, cloud startup delay, capped retry, and 409 backoff.
- Per-user expert onboarding exists under `USERS_ROOT` / `RUNTIME_DATA_ROOT/users/<telegram_id>/`:
  - `profile/profile.json`
  - `profile/runtime.json`
  - `profile/persona.md`, `worldview.md`, `style_guidance.md`, `style_examples.md`, `material_quality.md`
  - `scenarios/<scenario_id>/config.json`
  - `knowledge/pending`, `style/pending`, `avatar`, `voice`
- Users can create an AI expert from starter templates or custom onboarding, upload knowledge/style/avatar/voice materials, regenerate persona/style drafts, switch active scenarios, and run test generation.
- Runtime usage counters and limits exist in `runtime.json`: text/photo/video/audio/demo counters, soft limits, premium flags, upgrade prompt telemetry, and estimated cost visibility.
- Telegram Stars is present as a beta hook: `/upgrade`, `stars_pack:*`, `pre_checkout_query`, `successful_payment`, and fallback manual premium requests. It is not required to be enabled now.
- Media generation layer exists for the current bot:
  - Fish Audio TTS via `FISH_AUDIO_API_KEY` / `FISH_AUDIO_VOICE_ID`
  - FAL.ai image via Flux LoRA and video via Aurora
  - Cloudinary upload for audio URL hosting
  - ffmpeg audio mixing
- Knowledge ingestion tooling exists outside live user flow:
  - `knowledge-intake.js` sessions for admin/full_access collection
  - `knowledge_ingest.js` for staging FAISS/docstore builds
  - `knowledge_promote.js` for production promotion/rollback/validation
  - `knowledge_retrieval.js` for production FAISS retrieval

## 2. What is partially implemented

- Multi-expert architecture exists in two forms, but they are not unified:
  - Runtime per-user experts are stored in `users/<id>/...` and selected by `profile.active_scenario_id`.
  - Platform-level experts are described in `configs/experts/registry.json`, with `configs/experts/dinara/*` active and several draft demo experts.
- Dinara psychologist and Dinara sexologist are separated mainly by scenario/prompt and retrieval path, not by two independent expert profiles. `getBuiltInScenarioLabel()` and prompt routing distinguish them, while `configs/experts/dinara` treats Dinara as one expert with psychology and sexology domains.
- Production FAISS indexes exist for both `knowledge_indexes/psychologist/production/current` and `knowledge_indexes/sexologist/production/current`, but live runtime only uses the production FAISS retrieval service for `sexologist`.
- Psychologist runtime retrieval uses Supabase `match_chunks()` first, then `articles.production.json` fallback. It does not currently use `knowledge_indexes/psychologist/production/current` through `retrieveGroundingContext()`.
- Admin knowledge intake has an approval status flow: `collecting` -> `awaiting_confirmation` -> `approved_for_processing`. The actual cleaning, staging ingestion, and production promotion remain CLI/operator steps.
- End-user onboarding accepts uploads and runs quality analysis, but it does not create a searchable per-user FAISS/Supabase index. Generation injects a small slice of uploaded files directly into prompt context.
- Style-of-author training exists as:
  - per-user markdown style drafts from onboarding uploads;
  - Dinara author voice profile under `author_profiles/dinara/voice_profile.md`;
  - richer local voice profile JSON under `expert_profiles/dinara/voice/`.
  These are not yet one normalized runtime API.
- `scripts/expert-registry.js` validates registry/config isolation, namespaces, voice profile paths, and policy files, but the Telegram runtime does not yet route generation through this registry.

## 3. What is missing

- Durable SaaS storage is not ready. Local `users/`, `knowledge_intake/`, telemetry, and runtime files are safe with a Railway volume, but not with purely ephemeral containers.
- There is no paid-account ledger, subscription table, entitlement history, invoice reconciliation, refund state, or admin billing view. Current payment status is a mutable flag in `runtime.json`.
- User identity is Telegram-id based. There is no account abstraction for teams, multiple Telegram accounts, email login, organization ownership, or creator workspace IDs.
- Expert profile switching is scenario switching, not true expert switching. A user can switch `active_scenario_id`, but cannot manage multiple independent expert identities with separate storage roots under one account.
- Per-expert knowledge ingestion is not available for arbitrary user-created experts. User uploads become prompt context, not a promoted vector index.
- There is no human review/approve flow for end-user onboarding materials before they affect persona drafts or generation.
- There is no automatic pipeline from user onboarding upload -> cleaning -> staging index -> validation -> promote -> runtime retrieval namespace.
- Avatar/voice/video profile metadata is not formalized. Uploaded avatar/voice files are stored, but no stable schema describes media identity, consent, voice clone ID, avatar model, provider settings, or generation policy per expert.
- Media generation prompts are still Dinara-centric in key places, especially image/video prompts. This is not ready for arbitrary paid experts.
- `userState` remains in-memory. Pending interaction state resets on restart; persistent profile/runtime files survive only for completed or written milestones.

## 4. Risks before monetization

- Knowledge mixing risk is moderate. Built-in sexologist uses `knowledge_indexes/sexologist`; psychologist uses Supabase scenario filtering and static articles. Per-user experts bypass shared KBs when `buildUserScenarioContext()` finds a user scenario, but there is no per-expert vector namespace for uploaded user material.
- Runtime registry mismatch risk is high for future multi-expert SaaS. The registry has good isolation concepts (`retrieval_namespace`, voice paths, policy paths), but live `index.js` still uses scenario IDs and user filesystem context directly.
- Payment correctness risk is high. `successful_payment` adds text limit and sets `paid_plan`, but there is no idempotency guard, transaction record, provider audit trail, or entitlement recovery.
- Content quality risk for paid users is medium-high unless onboarding material is strong. Current fallback drafts are useful for beta, but weak uploads can still produce generic voice.
- Media cost risk is high. Video/audio/image generation increments counters and cost estimates, but there is no preflight spend cap per user beyond soft limits.
- Privacy/compliance risk exists around voice/avatar uploads. Storage accepts voice/avatar files, but consent, deletion, retention, and provider-processing status are not modeled.
- Operational risk remains if Railway volume is not attached. Beta storage notes already warn that files can disappear on redeploy without `RUNTIME_DATA_ROOT=/data/beta`.

## 5. Minimal path to paid beta

The shortest path is not a storage rewrite. Keep paid beta narrow:

1. Use the current beta bot only, with `TELEGRAM_BETA_TOKEN`, `START_LEADS_BOT=false`, and a Railway volume mounted at `RUNTIME_DATA_ROOT=/data/beta`.
2. Sell one manual or Telegram Stars package: extra text generations only. Do not monetize photo/video/audio yet.
3. Treat `runtime.json` as the beta entitlement source, but add a tiny append-only payment event log before public launch.
4. Keep admin override via existing `/tune <user_id> premium on` / admin panel.
5. Gate generation at `checkRuntimeGenerationQuota()` and keep upgrade UX at `handleRuntimeLimitExhausted()` / `sendStarsUpgradePlaceholder()`.
6. Keep onboarding lightweight: template expert -> upload 1-3 knowledge notes and 3-5 style posts -> regenerate persona -> test generation.
7. Delay public media monetization until avatar/voice consent and per-expert media metadata exist.

## 6. Multi-expert onboarding gaps

- There is no "account has many experts" model yet. Today the root is `users/<telegram_id>/`, with one profile and many scenarios.
- `active_scenario_id` is not enough for SaaS expert switching. It should eventually become `active_expert_id` plus `active_scenario_id`.
- Starter templates create a scenario under one user profile, not a standalone expert object.
- New platform experts can be added via `configs/experts/<expert_id>` and registry JSON, but live Telegram generation does not use that registry as the source of truth.
- User-created knowledge is stored under `users/<id>/knowledge/pending` and injected into prompts; it is not cleaned, indexed, promoted, or namespace-filtered.
- Author voice has multiple storage shapes: `author_profiles/<id>/voice_profile.md`, `expert_profiles/<id>/author_voice/voice_profile.*`, `expert_profiles/<id>/voice/*.json`, and per-user `profile/style_*.md`.
- The future model should separate:
  - expert identity and display metadata;
  - knowledge sources and indexes;
  - style/voice profile;
  - media identity;
  - billing entitlement;
  - runtime counters.

## 7. Recommended next 5 Codex iterations

1. Paid beta ledger, minimal:
   Add an append-only `users/<id>/profile/payment_events.jsonl` and idempotency key around `successful_payment`, without changing provider setup.

2. Expert object boundary, minimal:
   Introduce a small read/write helper that maps the current `users/<id>/profile` into an `expert_id`, but do not move files yet.

3. Onboarding material approval for paid beta:
   Add a lightweight per-upload `approved_for_generation` flag and admin/user dashboard visibility before rebuilding persona from new uploads.

4. Per-user retrieval plan:
   Design, but do not yet implement, a staging path from `users/<id>/knowledge/pending` to `knowledge_indexes/users/<id>/<expert_id>/...` or another durable namespace.

5. Media profile metadata:
   Add a schema-only `profile/media_profile.json` for avatar/voice consent, selected assets, provider IDs, and generation policy before expanding paid media.

## 8. Files inspected

- `index.js`
- `start.js`
- `leads-bot.js`
- `expert-onboarding.js`
- `knowledge-intake.js`
- `knowledge_ingest.js`
- `knowledge_promote.js`
- `knowledge_retrieval.js`
- `retrieval_service.js`
- `author_voice.js`
- `scripts/expert-registry.js`
- `scripts/expert-author-voice.js`
- `scripts/expert-author-voice-intake.js`
- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `configs/experts/registry.json`
- `configs/experts/dinara/expert.json`
- `knowledge_indexes/psychologist/production/current/*`
- `knowledge_indexes/sexologist/production/current/*`
- `expert_profiles/dinara/*`
- `author_profiles/dinara/*`
- `docs/beta-launch-readiness.md`
- `docs/railway-beta-deploy.md`

## 9. Do not refactor yet

- Do not split `index.js` before paid beta. It is messy, but it is currently the working runtime and contains many coupled Telegram states.
- Do not replace local runtime files with a database in the next step. First prove paid beta demand with a Railway volume and a tiny payment event log.
- Do not wire the registry into live generation yet. Use it as design guidance until the current per-user onboarding path is stable.
- Do not monetize image/audio/video yet. Text-only paid beta is the smallest safe commercial surface.
- Do not build general multi-tenant SaaS account management yet. Add only the smallest expert boundary needed to avoid blocking future migration.
- Do not ingest user uploads into production shared KBs. Keep user materials scoped to that user until per-expert namespace isolation is implemented.
