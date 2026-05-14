# Closed Beta Launch Readiness

## Production Sanity

Required to boot:

- `TELEGRAM_TOKEN`
- `OPENAI_API_KEY`

Degraded-but-allowed features:

- Supabase missing: bot falls back to local/static context.
- Fish Audio missing: voice generation fails with a user-safe message.
- FAL.ai missing: photo/video generation fails with a user-safe message.
- Cloudinary missing: audio cannot be hosted for video.
- `TG_CHANNEL` missing: publishing is blocked with an operator-facing setup message.

Runtime safety now favors short, user-safe messages. Raw provider errors are logged server-side and not shown in full to beta users.

## Telegram Stars MVP Prep

The runtime has lightweight hooks for monetization testing:

- quota exhaustion prompt
- `/upgrade` command
- `stars_pack:*` callback
- manual premium request fallback
- successful payment hook that adds 10 text generations

Set `TELEGRAM_STARS_ENABLED=true` when you want to test checkout. Until then, the same UX stays in placeholder mode and routes users to a manual premium request.

## Onboarding Packaging

Use `/onboarding_guide` during beta calls or send users to the dashboard guide button.

Best uploads:

- 3-5 full posts written by the author
- 1-3 expert notes with worldview, limits, client pains, objections
- one strong opinion piece
- one "do not imitate this" example

Weak uploads:

- bare links without copied text
- screenshots instead of text
- short promotional captions only
- generic articles that do not reveal the author's position

## Retention Telemetry

Local summary:

```bash
npm run beta:telemetry
node scripts/beta-telemetry-summary.js --days 14
```

Primary launch questions:

- How many users complete onboarding?
- How many reach first generation?
- Do they regenerate after feedback?
- Does demo convert into a created expert?
- Where do users stop after quota exhaustion?

## Cost Visibility

Each runtime profile now tracks estimated cost categories in `users/<id>/profile/runtime.json`:

- text generation
- audio generation
- image generation
- video generation
- upload operations

These numbers are estimates for beta pricing decisions, not accounting records.
