# Payment Runtime MVP

This is the lightweight monetization foundation for the Telegram-first AI expert runtime.

The goal is a working MVP path:

```text
Telegram Stars payment or manual beta grant
-> user plan activation
-> premium status
-> generation usage limits
-> premium runtime access
```

It intentionally avoids databases, Redis, BullMQ, migrations, microservices, and production secrets.

## Architecture

The runtime stays local-first and Railway-compatible.

Primary state:

```text
runtime_data/user_plans/<telegram_user_id>.json
```

Each user plan file stores:

- `planType`: `FREE`, `START`, or `PRO`
- `status`: `active`, `expired`, or `revoked`
- `premium`: boolean runtime access flag
- `limits`: generation limits by type
- `usage`: generation counters by type
- `validUntil`: optional plan expiry
- `telegramStars`: last successful Stars metadata when present

Payment/audit events remain append-only:

```text
payment_events.jsonl
```

The previous `entitlements.json` beta layer remains as compatibility storage for existing admin commands, but generation access now reads from `runtime_data/user_plans/`.

## Plans

Default plan catalog:

- `FREE`: 3 text generations, no premium runtime.
- `START`: 50 text generations for 30 days, premium runtime enabled.
- `PRO`: 200 text generations for 30 days, premium runtime enabled.

Limits can be changed with env vars:

```env
PLAN_FREE_TEXT_LIMIT=3
PLAN_START_TEXT_LIMIT=50
PLAN_START_DAYS=30
PLAN_START_STARS_PRICE=149
PLAN_PRO_TEXT_LIMIT=200
PLAN_PRO_DAYS=30
PLAN_PRO_STARS_PRICE=499
```

## Runtime Flow

Before text generation, `checkRuntimeGenerationQuota()` calls the plan layer.

If access is active:

1. The generation proceeds through the existing Dinara/runtime flow.
2. After a successful text result, `incrementEntitlementUsage()` increments `usage.text`.
3. Runtime counters are still updated in the existing user runtime profile.
4. The bot shows remaining generations when the user is close to the limit.

If access is blocked:

1. Expired/revoked/exhausted plans stop generation before OpenAI is called.
2. The bot shows current plan status and remaining usage.
3. The user is routed to `/plans` or a manual premium request.

Dinara stable generation prompts, retrieval, media generation, and existing runtime expert logic are not replaced.

## Telegram Stars Hooks

Commands and buttons:

- `/plans` shows `FREE`, `START`, `PRO`.
- `stars_plan:START` and `stars_plan:PRO` prepare Telegram Stars invoices.
- `pre_checkout_query` validates the plan payload.
- `successful_payment` activates the paid plan and records an idempotent event.

The invoice payload format is:

```text
plan:<PLAN_TYPE>:<timestamp>
```

Production safety:

- Stars checkout only runs when `TELEGRAM_STARS_ENABLED=true`.
- No credentials are committed.
- If Telegram Stars cannot be sent safely, the bot falls back to a manual premium request.
- Successful payment events are guarded by `telegram_payment_charge_id` / provider charge id / payload checks in `payment_events.jsonl`.

## Commands

User-facing:

```text
/plans
/subscription
/premium_status
/usage
/upgrade
```

Admin compatibility:

```text
/grant_beta USER_ID LIMIT DAYS
/revoke_beta USER_ID
/usage USER_ID
```

`/grant_beta` now also writes a `START` user plan under `runtime_data/user_plans/`.

## Miniapp-Ready Structure

`start.js` exposes read-only JSON endpoints:

```text
GET /runtime/plans
GET /runtime/usage?user_id=<telegram_user_id>
```

These endpoints are intentionally minimal:

- no payment mutation;
- no secret exposure;
- no database dependency;
- no Telegram WebApp validation yet.

Future miniapp work should add Telegram init data verification before exposing user-specific state publicly.

## Future Integration Points

Next safe steps:

- Add Telegram WebApp init data verification for miniapp reads.
- Add a provider transaction registry if Stars becomes the main paid channel.
- Add separate media limits and cost caps for audio/image/video.
- Move plan state to a DB only when the product has real scale pressure.
- Add refund/revoke event types without changing the generation runtime contract.

## Smoke Checks

Recommended local checks:

```bash
node --check index.js
node --check start.js
```
