# Lightweight Telegram Mini App Shell Foundation

## Purpose

The Mini App is a control panel for the AI Expert Operating System. It is not a replacement for the Telegram AI conversation UX.

- Telegram Bot: AI conversation, topic flow, generation decisions, uploads, payments, and delivery.
- Telegram Mini App: lightweight operating dashboard for state, plans, usage, generation handoff, and upload visibility.

## Architecture

The shell runs inside the existing Node process in `start.js`.

- No separate backend.
- No microservices.
- No SSR framework.
- No React or frontend build step.
- No production secrets in frontend code.
- Railway stays compatible because the same HTTP server still listens on `PORT`.

Runtime files:

- `runtime/miniapp-shell.js` handles Mini App routes, Telegram WebApp auth validation, and safe runtime adapters.
- `public/miniapp/index.html` is the Web App entry.
- `public/miniapp/styles.css` and `public/miniapp/app.js` provide a small static UI.

## Routes

Static:

- `GET /miniapp`
- `GET /miniapp/`
- `GET /miniapp/app.js`
- `GET /miniapp/styles.css`

Runtime-safe API:

- `GET /miniapp/api/session`
- `GET /miniapp/api/dashboard`
- `GET /miniapp/api/plans`
- `GET /miniapp/api/usage`
- `GET /miniapp/api/uploads`
- `POST /miniapp/api/generate`

`POST /miniapp/api/generate` is a safe handoff endpoint. It checks plan access and runs the existing `runRuntimeGenerationAdapter` in `dry_run_prompt_only` mode with persistence disabled for mutable runtime layers. It does not call OpenAI, publish content, send Telegram messages, or increment usage.

## Telegram WebApp Flow

1. Bot shows a Mini App button when `MINIAPP_PUBLIC_URL` or `TELEGRAM_MINIAPP_URL` is configured.
2. Telegram opens `/miniapp` and provides `Telegram.WebApp.initData`.
3. Frontend sends init data in `Authorization: tma <initData>`.
4. `runtime/miniapp-shell.js` validates the HMAC using the selected bot token.
5. API endpoints use the Telegram user id from the validated init data.

Local development allows a dev fallback session when `NODE_ENV !== production`. Set `MINIAPP_DEV_AUTH=false` to disable that fallback.

## Runtime Integration

The Mini App reuses existing runtime storage and adapters:

- Plans/access: reads the same `runtime_data/user_plans/*.json` state used by the payment/access runtime.
- Payments: exposes plan catalog and Telegram Stars readiness only; checkout remains in the bot.
- Generation: uses `scripts/runtime-generation-adapter.js` only as a runtime-safe dry-run handoff.
- Usage: reads usage counters from the user plan state; it does not mutate them.
- Uploads: reads runtime profile upload telemetry; upload intake remains in Telegram.
- Experts/knowledge/media: reads `runtime_data/experts.json`, `runtime_data/expert_kb_registry.json`, and `runtime_data/media_profiles.json`.

## UI Pages

The shell includes only foundation pages:

- Dashboard: user plan, runtime adapters, experts.
- Plans: plan catalog and Stars readiness.
- Usage: text/photo/audio/video counters.
- Generate: runtime handoff preparation.
- Uploads: upload telemetry and bot-flow status.

The UI is intentionally plain HTML/CSS/JS with no bundler and no heavy design layer.

## Environment Variables

Optional Mini App variables:

```bash
MINIAPP_PUBLIC_URL=https://your-public-domain/miniapp
TELEGRAM_MINIAPP_URL=https://your-public-domain/miniapp
TELEGRAM_BOT_USERNAME=your_bot_username
MINIAPP_DEV_AUTH=false
```

`MINIAPP_PUBLIC_URL` is preferred. `TELEGRAM_MINIAPP_URL` is accepted as an alias.

## Future Scalability Path

Keep Mini App responsibilities narrow:

1. Add more read-only dashboards first.
2. Add write endpoints only as thin adapters around existing runtime functions.
3. Keep AI chat, generation conversation, upload intake, payment checkout, and publishing in Telegram until there is a strong reason to move a specific control.
4. If frontend complexity grows, add small modules under `public/miniapp/` before introducing a build system.
5. If runtime complexity grows, extract reusable runtime adapters from `index.js` into `runtime/*` modules, then have both bot and Mini App call the same functions.

## Safety Notes

- The Mini App does not duplicate the Dinara stable generation path.
- The Mini App does not replace existing bot callbacks.
- The shell does not require deploy-time secrets beyond the existing bot token already used by the runtime.
- No production credentials are embedded in static files.
- Missing `MINIAPP_PUBLIC_URL` simply hides the bot button and preserves the current bot flow.
