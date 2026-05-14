# Railway Beta Deploy Guide

Purpose: run a separate Railway staging service and a separate Telegram beta bot without touching the current MVP-DI-1 production runtime.

## Deployment Shape

- Branch: `ai-workflow-foundation`
- Railway service: create a new staging/beta service, not the existing production service
- Telegram bot: create a new bot with BotFather and use its token as `TELEGRAM_BETA_TOKEN`
- Runtime mode: `RUNTIME_MODE=beta`
- Start command: `npm start` or Railway default from `package.json`
- Health check path: `/healthz`

## Required Env Vars

Minimum beta runtime:

```env
NODE_ENV=production
RUNTIME_MODE=beta
RUNTIME_NAME=mvp-content-api-beta
TELEGRAM_BETA_TOKEN=<separate beta bot token>
OPENAI_API_KEY=<openai key>
TELEGRAM_POLLING=true
START_LEADS_BOT=false
```

Do not set `TELEGRAM_BETA_TOKEN` to the current production bot token. In beta mode the runtime requires `TELEGRAM_BETA_TOKEN` specifically to prevent accidental polling against the production bot.

Recommended beta storage separation:

```env
RUNTIME_DATA_ROOT=/app/runtime-data/beta
MAX_UPLOAD_MB=12
```

Optional feature env vars:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
FISH_AUDIO_API_KEY=
FISH_AUDIO_VOICE_ID=
FALAI_KEY=
CLOUDINARY_CLOUD=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
TG_CHANNEL=
TELEGRAM_STARS_ENABLED=false
```

Missing optional env vars degrade features instead of blocking startup:

- Supabase missing: vector retrieval falls back.
- Fish Audio missing: voice generation should be treated as unavailable.
- FAL.ai missing: photo/video generation should be treated as unavailable.
- Cloudinary missing: talking-head video audio hosting is unavailable.
- `TG_CHANNEL` missing: publishing to a channel is unavailable.

## Railway Setup

1. Create a new Railway project or a new service inside a staging project.
2. Connect the GitHub repo and select branch `ai-workflow-foundation`.
3. Set the env vars above.
4. Ensure the service is not sharing variables with MVP-DI-1 production.
5. Set health check path to `/healthz` if Railway health checks are enabled.
6. Deploy.

The Dockerfile installs Node dependencies plus `ffmpeg`. The app starts through `start.js`, which exposes a small HTTP health endpoint and imports the Telegram polling runtime.

## Pre-Deploy Check

Run locally or in Railway shell:

```bash
npm run railway:check
```

Expected result:

- `ok: true`
- `runtimeMode: "beta"`
- `betaMode: true`
- `polling: true`
- `leadsBot: false`
- `missingRequired: []`

Optional missing vars are acceptable if those features are not part of the first beta test.

## Telegram Beta Bot Setup

1. Use BotFather to create a new beta bot.
2. Put the token only in `TELEGRAM_BETA_TOKEN`.
3. Give testers the beta bot username, not the production bot username.
4. Keep `TELEGRAM_POLLING=true` for the Railway beta service.
5. Do not run another service with the same beta token at the same time, because Telegram polling supports one active poller per bot token.

## Runtime Storage Notes

Beta runtime writes mutable local files under `RUNTIME_DATA_ROOT`:

- `users/` for onboarding profiles, scenario configs, uploaded materials, and per-user runtime counters
- `reports/beta-telemetry/` for JSONL beta events
- `reports/runtime-preview/` for admin-only preview artifacts
- `feedback_reports/` for feedback logs
- `knowledge_intake/` for admin knowledge intake sessions
- `storage/` for runtime memory state used by runtime engines

Railway filesystem is ephemeral unless a volume is attached. That is acceptable for short onboarding smoke tests, but beta user uploads and onboarding state can disappear on redeploy. For multi-day beta testing, attach a Railway volume and set:

```env
RUNTIME_DATA_ROOT=/data/beta
```

Do not point beta `RUNTIME_DATA_ROOT` at a production volume.

## Safe Testing Checklist

Before inviting testers:

- `/healthz` returns `ok: true`
- Railway logs show `runtimeMode: beta`
- Railway logs show the beta service name in startup lines
- Logs show `TELEGRAM_BETA_TOKEN` selected, not `TELEGRAM_TOKEN`
- `npm run railway:check` passes
- Send `/start` to the beta bot and confirm the production bot does not respond
- Complete one template onboarding flow
- Upload one small text or PDF sample
- Generate one text post
- Test optional media only after confirming the relevant env vars are set

During beta:

- Keep tester count small.
- Watch Railway memory and restart count.
- Watch `reports/beta-telemetry/*.jsonl` or run `npm run beta:telemetry`.
- Avoid bulk uploads; current upload cap defaults to 12 MB per file.
- Avoid video tests unless FAL.ai and Cloudinary env vars are configured and cost is expected.

## Rollback

Beta rollback is simple because production is separate:

1. Stop or pause the Railway beta service.
2. Revoke or rotate the beta bot token in BotFather if needed.
3. Keep production service untouched.
4. If a bad beta deploy is active, redeploy the previous Railway deployment or disable polling with:

```env
TELEGRAM_POLLING=false
```

Then redeploy. The health endpoint will stay online, but the bot will stop consuming Telegram updates.

## Current Audit Summary

Implemented staging safeguards:

- Beta mode requires `TELEGRAM_BETA_TOKEN`.
- Startup logs include runtime name, mode, polling state, and data root.
- Leads bot is no longer started by default from `start.js`; enable only with `START_LEADS_BOT=true`.
- Beta data paths can be isolated with `RUNTIME_DATA_ROOT`.
- Telemetry, runtime preview reports, feedback logs, onboarding users, and knowledge intake can be separated from production local paths.
- Upload size is configurable with `MAX_UPLOAD_MB`.
- ffmpeg temp files are written in a dedicated OS temp folder and removed after mixing.
- `/healthz` is available for Railway health checks.

Known limits for this beta:

- Local filesystem persistence depends on Railway volume configuration.
- User state in memory still resets on restart.
- No storage architecture redesign has been done.
- Optional media features still require their external API env vars and can incur cost.
