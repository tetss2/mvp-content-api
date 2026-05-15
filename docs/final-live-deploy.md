# Final Live Deploy

Final execution flow for the Railway production MVP. This document assumes the current monolith runtime stays intact: no new runtime layers, no Redis, no queues, no microservices, and no real secrets in docs or commits.

## 1. Railway Deploy Sequence

1. Confirm the target branch contains the final deploy prep commit.
2. In Railway, connect the existing service to the repository.
3. Use the existing start command:

```bash
npm start
```

4. Set Railway health check path to:

```text
/health
```

`/healthz` remains available as a compatibility alias.

5. Configure env vars in Railway.
6. Deploy.
7. Check logs for:

```text
[deploy-safe] Validation
[runtime-readiness]
[payment-readiness]
[miniapp-readiness]
```

8. Run external smoke checks from local:

```bash
LIVE_BASE_URL=https://<railway-domain> npm run live:smoke
LIVE_BASE_URL=https://<railway-domain> npm run live:final:verify
```

## 2. Exact Env Setup

Required:

```text
NODE_ENV=production
RUNTIME_MODE=production
TELEGRAM_TOKEN=<production-bot-token>
TELEGRAM_POLLING=true
OPENAI_API_KEY=<openai-key>
MINIAPP_DEV_AUTH=false
MINIAPP_PUBLIC_URL=https://<railway-domain>/miniapp
TELEGRAM_BOT_USERNAME=<bot-username-without-@>
TELEGRAM_STARS_ENABLED=true
PAYMENT_TEST_MODE=false
```

Recommended:

```text
PLAN_FREE_TEXT_LIMIT=3
PLAN_START_TEXT_LIMIT=50
PLAN_START_DAYS=30
PLAN_START_STARS_PRICE=149
PLAN_PRO_TEXT_LIMIT=200
PLAN_PRO_DAYS=30
PLAN_PRO_STARS_PRICE=499
```

Retrieval/media optional:

```text
SUPABASE_URL=<supabase-url>
SUPABASE_ANON_KEY=<supabase-anon-key>
FISH_AUDIO_API_KEY=<fish-audio-key>
FISH_AUDIO_VOICE_ID=<fish-audio-voice-id>
FALAI_KEY=<fal-key>
CLOUDINARY_CLOUD=<cloudinary-cloud>
CLOUDINARY_API_KEY=<cloudinary-key>
CLOUDINARY_API_SECRET=<cloudinary-secret>
```

Do not set `TELEGRAM_STARS_PROVIDER_TOKEN` for Telegram Stars. Stars invoices use currency `XTR` and an empty provider token.

## 3. Pre-Deploy Validators

Local env shape:

```bash
npm run railway:check
FINAL_LIVE_CHECK=true npm run railway:check
```

Live URL shape after deploy:

```bash
LIVE_BASE_URL=https://<railway-domain> npm run live:smoke
LIVE_BASE_URL=https://<railway-domain> npm run live:final:verify
```

Telegram read-only helper:

```bash
LIVE_BASE_URL=https://<railway-domain> npm run live:telegram:verify
```

## 4. Webhook Setup

This MVP is polling-first.

Production polling mode:

```text
TELEGRAM_POLLING=true
TELEGRAM_WEBHOOK_URL unset
```

Before live polling, confirm Telegram has no active webhook:

```bash
npm run live:telegram:verify
```

If `getWebhookInfo` shows an active webhook, remove it manually before live polling. Do not switch to webhook mode unless intentionally using `api/webhook.js` and verifying that path separately.

Webhook mode is not the recommended MVP path. If you intentionally use it:

```text
TELEGRAM_POLLING=false
TELEGRAM_WEBHOOK_URL=https://<railway-domain>/api/webhook
```

Then verify the active Telegram webhook URL matches `TELEGRAM_WEBHOOK_URL`.

## 5. Mini App Setup

1. Set:

```text
MINIAPP_PUBLIC_URL=https://<railway-domain>/miniapp
MINIAPP_DEV_AUTH=false
```

2. In BotFather, configure the Mini App/Web App launch URL to the same `MINIAPP_PUBLIC_URL`.
3. Verify status endpoint:

```bash
curl https://<railway-domain>/miniapp-status
```

4. In Telegram admin chat:

```text
/miniapp_check
/panel
```

Expected:

- `/miniapp` returns the shell.
- `/miniapp/api/plans` is public and returns plans.
- `/miniapp/api/dashboard` without Telegram init data returns `401`.
- `/panel` shows the Mini App button.

## 6. Stars Payment Test Flow

Before the first real payment:

```text
TELEGRAM_STARS_ENABLED=true
PAYMENT_TEST_MODE=false
```

Admin checks:

```text
/deploy_check
/payment_flow_check <USER_ID> START
/payment_diag
```

First live invoice:

1. User opens `/plans`.
2. User taps `Оплатить START Stars`.
3. Telegram shows native Stars invoice.
4. User pays.
5. Bot receives `successful_payment`.
6. Runtime validates payload, currency `XTR`, price, user id, freshness, and duplicate payment state.
7. Runtime activates premium and logs payment events.

Post-payment admin checks:

```text
/payment_diag
/premium_users
/usage <USER_ID>
/premium_activation_check <USER_ID>
```

Expected payment events:

```text
telegram_stars_invoice_created
telegram_stars_pre_checkout
telegram_stars_success
telegram_stars_invoice_paid
```

## 7. First Premium Activation Flow

Dry helper before real traffic:

```text
/test_premium <USER_ID> START 60
/premium_activation_check <USER_ID>
/usage <USER_ID>
```

Reset smoke usage if needed:

```text
/usage_reset <USER_ID> text
```

For real Stars activation, do not use `/test_payment` and keep `PAYMENT_TEST_MODE=false`.

## 8. Final Live Smoke Sequence

Run in this order:

```bash
LIVE_BASE_URL=https://<railway-domain> npm run live:smoke
LIVE_BASE_URL=https://<railway-domain> npm run live:telegram:verify
LIVE_BASE_URL=https://<railway-domain> npm run live:final:verify
```

Then in Telegram:

```text
/deploy_check
/runtime_status
/miniapp_check
/payment_flow_check <USER_ID> START
/retrieval_check sexologist тревога в отношениях
/plans
/panel
```

Finally run one stable Dinara generation and confirm it returns text as before.

## 9. Rollback Notes

Fast rollback options:

1. Railway rollback to previous successful deployment.
2. Disable live payments without redeploy:

```text
TELEGRAM_STARS_ENABLED=false
PAYMENT_TEST_MODE=false
```

3. Hide Mini App button without affecting Telegram generation:

```text
MINIAPP_PUBLIC_URL unset
TELEGRAM_MINIAPP_URL unset
```

4. Keep polling stable:

```text
TELEGRAM_POLLING=true
TELEGRAM_WEBHOOK_URL unset
```

5. If webhook conflict appears, clear Telegram webhook manually and redeploy/restart Railway.

Runtime data remains file-based for this MVP. Do not introduce new infrastructure during rollback.
