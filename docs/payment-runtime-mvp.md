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

## Telegram Stars Flow

Commands and buttons:

- `/plans` shows `FREE`, `START`, `PRO`.
- `/upgrade` shows purchase buttons for `START` and `PRO`.
- `stars_plan:START` and `stars_plan:PRO` send real Telegram Stars invoices.
- `pre_checkout_query` validates the plan payload.
- `successful_payment` activates the paid plan and records an idempotent event.

Telegram Stars invoices use:

- `currency`: `XTR`
- provider token: empty string
- prices: one label with the plan Stars amount

The current invoice payload format is:

```text
stars_plan:<PLAN_TYPE>:<telegram_user_id>:<timestamp>
```

Legacy payloads are still accepted for compatibility:

```text
plan:<PLAN_TYPE>:<timestamp>
```

### Invoice Lifecycle

1. User opens `/upgrade` or `/plans`.
2. User taps `Оплатить START Stars` or `Оплатить PRO Stars`.
3. The bot calls `sendInvoice()` with `currency: XTR`.
4. Telegram shows the native Stars invoice.
5. Telegram sends `pre_checkout_query`.
6. The runtime validates:
   - payload shape;
   - plan is `START` or `PRO`;
   - invoice user matches payload user;
   - currency is `XTR`;
   - total amount matches the selected plan price.
7. Telegram sends `successful_payment`.
8. The runtime checks idempotency with `payment_events.jsonl`.
9. The runtime calls `activateUserPlan()` with `source: telegram_stars`.
10. The user plan file under `runtime_data/user_plans/` is updated.
11. Runtime monetization metadata and text limits are updated.
12. User receives purchase confirmation and can continue generation in Telegram.

Production safety:

- Stars checkout only runs when `TELEGRAM_STARS_ENABLED=true`.
- Telegram Stars does not use external payment providers.
- No credentials are committed.
- If Telegram Stars cannot be sent safely, the bot falls back to a manual premium request.
- Successful payment events are guarded by `telegram_payment_charge_id` / provider charge id / payload checks in `payment_events.jsonl`.

### Safe Test Flow

Use a Telegram bot where Stars test payments are available:

```env
TELEGRAM_STARS_ENABLED=true
PLAN_START_STARS_PRICE=149
PLAN_PRO_STARS_PRICE=499
```

Then run:

```text
/upgrade
-> tap START or PRO
-> pay the native Telegram Stars invoice
-> receive "Оплата Telegram Stars получена"
-> check /subscription
```

Expected state:

- `runtime_data/user_plans/<telegram_user_id>.json` has `planType` set to `START` or `PRO`.
- `premium` is `true`.
- `limits.text` matches the plan.
- `usage` is reset for the newly activated paid plan.
- `payment_events.jsonl` contains `telegram_stars_success` and `telegram_stars_invoice_paid` audit entries.

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

The current Mini App shell remains dashboard-only for payments. Real checkout still starts from Telegram bot buttons, which keeps the AI chat and payment UX inside Telegram's native flow.

## Future Integration Points

Next safe steps:

- Add Telegram WebApp init data verification for miniapp reads.
- Add a compact transaction registry if Stars becomes the main paid channel.
- Add separate media limits and cost caps for audio/image/video.
- Move plan state to a DB only when the product has real scale pressure.
- Add refund/revoke event types without changing the generation runtime contract.
- Track Telegram Stars payout/revenue reporting outside the bot runtime; Stars withdrawal and payout accounting belongs to business/admin tooling, not generation access checks.

## Smoke Checks

Recommended local checks:

```bash
node --check index.js
node --check start.js
```

Optional local syntax check:

```bash
node --check runtime/miniapp-shell.js
```
