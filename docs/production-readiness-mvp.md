# Production Readiness MVP

This document describes the lightweight production hardening added for Railway deploy, first Telegram Stars payment tests, and first premium users.

## Runtime Flow

The live Telegram runtime stays local and file-based:

1. `start.js` loads environment variables, starts the HTTP health/Mini App shell, then imports `index.js`.
2. `index.js` validates required startup config, initializes runtime directories, then starts Telegram polling when enabled.
3. User plans are stored in `runtime_data/user_plans/<userId>.json`.
4. Payment/runtime audit events are appended to JSONL files:
   - `payment_events.jsonl`
   - `runtime_events.jsonl`
5. Dinara keeps the existing stable generation and retrieval path. The hardening layer only guards access, usage, payments, logging, and recovery around the current flow.

## Payment Lifecycle

Telegram Stars payment flow:

1. User opens `/plans` and clicks `START` or `PRO`.
2. Bot creates a Stars invoice payload: `stars_plan:<PLAN>:<USER_ID>:<TIMESTAMP>`.
3. Invoice creation is logged as `telegram_stars_invoice_created`.
4. `pre_checkout_query` validates:
   - payload shape
   - premium plan exists
   - user id matches invoice payload
   - currency is `XTR`
   - amount matches plan price
   - invoice timestamp is not stale
   - invoice payload was not already paid
5. `successful_payment` is guarded by charge-id in-flight protection and duplicate payment checks.
6. Valid payment activates the plan, writes payment logs, updates runtime monetization fields, and confirms remaining usage to the user.

Rejected or replayed payments do not activate premium automatically. They are logged for admin diagnostics.

## Failure Handling

The MVP protection layer covers:

- duplicate payment protection via charge id and JSONL audit history
- invoice replay protection via paid payload lookup and invoice max age
- invalid plan activation rejection for non-premium/unknown plans
- generation race-condition protection per user text generation
- safe usage consumption through a per-user in-process plan lock
- corrupted plan fallback through normalized default/user plan recovery
- invalid usage fallback to non-negative integer counters
- missing runtime state recovery through existing runtime profile initialization

Generation failures are logged as `generation_failed` and the topic stays available for retry.

## Railway Deploy Notes

Required for bot runtime:

- `TELEGRAM_TOKEN` or `TELEGRAM_BETA_TOKEN`
- `OPENAI_API_KEY`
- `PORT` is injected by Railway

Recommended production settings:

- `NODE_ENV=production`
- `TELEGRAM_POLLING=true`
- `MINIAPP_DEV_AUTH=false`
- `TELEGRAM_STARS_ENABLED=true` only when ready for real Stars checkout
- `PAYMENT_TEST_MODE=false` for normal production traffic
- `MINIAPP_PUBLIC_URL` or `TELEGRAM_MINIAPP_URL` when Mini App button should be visible

Optional provider variables can be missing at startup; the bot logs warnings and degrades related features.

## Payment Test Mode

Set `PAYMENT_TEST_MODE=true` only for controlled testing.

Admin commands:

- `/payment_diag` shows recent payment events.
- `/test_payment USER_ID START|PRO` simulates a premium activation without Telegram secrets or provider calls.

Disable `PAYMENT_TEST_MODE` before opening traffic beyond internal payment tests.

## Mini App Safety

Mini App API calls validate Telegram WebApp init data in production:

- hash must be valid
- user must exist and have a numeric Telegram id
- `auth_date` must be present and fresh
- dev fallback is blocked when `NODE_ENV=production`

Rejected sessions return `401` and write a lightweight `miniapp_session_rejected` runtime event.

## Admin Visibility

Admin/full-access commands:

- `/runtime_status` shows runtime mode, checkout readiness, Mini App config, plan counts, premium users, payment events, and startup warnings.
- `/payment_diag` shows checkout/test mode and latest payment events.
- `/premium_users` lists recent premium users with plan, status, usage, remaining generations, and expiry.
- `/usage [USER_ID]` shows a single user plan.

## First-User Checklist

1. Deploy to Railway with `NODE_ENV=production` and `MINIAPP_DEV_AUTH=false`.
2. Confirm `/healthz` returns `ok: true`.
3. In Telegram, run `/runtime_status`.
4. Check startup warnings and fix only blockers.
5. Run `/plans` and verify START/PRO invoice buttons appear.
6. For dry activation, temporarily set `PAYMENT_TEST_MODE=true` and use `/test_payment <USER_ID> START`.
7. Run `/usage <USER_ID>` and confirm remaining usage.
8. Disable `PAYMENT_TEST_MODE`.
9. Enable `TELEGRAM_STARS_ENABLED=true` for the real payment test.
10. After payment, run `/payment_diag`, `/premium_users`, and `/usage <USER_ID>`.

No Redis, BullMQ, microservices, database migrations, or deploy-time secret expansion are required for this MVP.
