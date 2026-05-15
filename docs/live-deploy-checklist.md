# Live Deploy Checklist

Lightweight Railway production MVP checklist for the Telegram + Instagram AI expert runtime.

## Scope

This flow only validates the existing monolith runtime. Do not add Redis, BullMQ, microservices, new databases, or new runtime layers for this deploy.

## Railway Setup

1. Create or select the Railway service for this repository.
2. Use the existing Dockerfile/start command.
3. Set start command to `npm start` if Railway does not infer it.
4. Keep Railway health check on `/health` or `/healthz`.
5. Confirm Railway injects `PORT`.
6. Confirm persistent runtime files are acceptable for the MVP volume/runtime setup already used by the project.

## Required Envs

Required for live bot runtime:

- `TELEGRAM_TOKEN` for production mode, or `TELEGRAM_BETA_TOKEN` when `RUNTIME_MODE=beta|staging|railway-beta`
- `OPENAI_API_KEY`

Recommended production envs:

- `NODE_ENV=production`
- `RUNTIME_MODE=production`
- `TELEGRAM_POLLING=true`
- `MINIAPP_DEV_AUTH=false`
- `PAYMENT_TEST_MODE=false` before opening to real users
- `TELEGRAM_BOT_USERNAME`
- `MINIAPP_PUBLIC_URL` or `TELEGRAM_MINIAPP_URL`

Optional feature envs:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FISH_AUDIO_API_KEY`
- `FISH_AUDIO_VOICE_ID`
- `FALAI_KEY`
- `CLOUDINARY_CLOUD`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Webhook Setup

The MVP runtime is polling-first.

1. Keep `TELEGRAM_POLLING=true`.
2. Do not configure a webhook unless intentionally switching the Telegram delivery mode.
3. If `TELEGRAM_WEBHOOK_URL` is present, it must be HTTPS.
4. Before live testing, confirm old webhooks are cleared for the bot token if polling conflicts appear.

## Stars Readiness

1. Confirm `TELEGRAM_STARS_ENABLED=false` for dry deploy checks.
2. Use `/payment_flow_check USER_ID START` to validate payload, currency, price, and invoice readiness.
3. Use `/test_payment USER_ID START` only when `PAYMENT_TEST_MODE=true`.
4. Disable `PAYMENT_TEST_MODE` before real traffic.
5. Enable `TELEGRAM_STARS_ENABLED=true` only for the controlled real Stars payment test.
6. After payment, check `/payment_diag`, `/premium_users`, and `/usage USER_ID`.

Telegram Stars uses currency `XTR` and does not require an external provider token.

## Mini App Launch Setup

1. Set `MINIAPP_PUBLIC_URL=https://<railway-domain>/miniapp`.
2. Keep `MINIAPP_DEV_AUTH=false` in production.
3. Confirm `/miniapp-status` returns configured and HTTPS.
4. In Telegram, run `/miniapp_check`.
5. Open `/panel` from Telegram and verify the Mini App button appears.
6. Invalid sessions should return `401` for protected Mini App APIs and log `miniapp_session_rejected`.

## Smoke Test Sequence

HTTP:

```bash
npm run railway:check
LIVE_BASE_URL=https://<railway-domain> npm run live:smoke
```

Expected endpoints:

- `GET /health`
- `GET /runtime-status`
- `GET /payment-status`
- `GET /miniapp-status`
- `GET /runtime/plans`
- `GET /miniapp/api/plans`

Telegram admin commands:

- `/deploy_check`
- `/runtime_status`
- `/payment_diag`
- `/payment_flow_check USER_ID START`
- `/premium_activation_check USER_ID`
- `/miniapp_check`
- `/retrieval_check sexologist тревога в отношениях`

Admin-safe test helpers:

- `/test_premium USER_ID START 60`
- `/usage_reset USER_ID text`
- `/test_payment USER_ID START` only with `PAYMENT_TEST_MODE=true`

## First-User Checklist

1. Run HTTP smoke checks.
2. Run Telegram `/deploy_check`.
3. Confirm no blockers in startup logs.
4. Confirm `/retrieval_check` returns either production retrieval or a known fallback.
5. Confirm `/plans` shows START/PRO buttons.
6. Confirm limit reached UX routes to `/plans`.
7. Confirm `/panel` opens the Mini App button.
8. Temporarily activate the first user with `/test_premium USER_ID START 60`.
9. Run `/premium_activation_check USER_ID`.
10. Run one normal Dinara generation and confirm the stable path still works.
11. Reset smoke usage with `/usage_reset USER_ID text` if needed.
12. Disable test modes before external users enter.

## Production-Safe UX Checks

- Payment unavailable: user sees manual premium fallback.
- Invalid Stars payload: payment event is logged and premium is not activated automatically.
- Runtime generation failure: user receives a retry-safe message and topic state is preserved.
- Mini App missing URL: `/panel` explains that the panel is not configured.
- Invalid Mini App session: protected API returns `401`.
- Limit reached: user sees `/plans`, Stars buttons, and manual premium request option.

## No-Go Items

- Do not run a real deploy from local Codex.
- Do not paste real secrets into docs or commits.
- Do not add Redis, BullMQ, queues, microservices, external observability, or new runtime layers.
- Do not replace the stable Dinara generation path.
