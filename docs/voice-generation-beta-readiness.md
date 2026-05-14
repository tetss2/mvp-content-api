# Voice Generation Beta Readiness

Minimal readiness layer for enabling existing Fish Audio voice generation for Dinara in the beta MVP.

## Required ENV For Voice

`/test_voice` and the existing AI audio flow require:

```env
FISH_AUDIO_API_KEY=...
```

And one voice id source:

```env
FISH_AUDIO_VOICE_ID=...
```

`FISH_AUDIO_VOICE_ID` is only a fallback. The preferred beta route is to set Dinara's Fish Audio voice id in `runtime_data/media_profiles.json`:

```json
{
  "expertId": "dinara",
  "voiceProfileId": "fish_voice_profile_id",
  "imageAvatarProfileId": null,
  "videoAvatarProfileId": null,
  "status": "draft",
  "updatedAt": "2026-05-15T00:00:00.000Z"
}
```

Voice id resolution order:

```text
media profile voiceProfileId -> FISH_AUDIO_VOICE_ID
```

## Optional ENV

Cloudinary is not required for `/test_voice` or for sending a generated mp3 back to Telegram.

Cloudinary is required when the video pipeline needs a hosted audio URL:

```env
CLOUDINARY_CLOUD=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

`ffmpeg` is not required for `/test_voice`. It is required only for voice + background music mixing. If `ffmpeg` is missing, the existing audio flow can still fall back to voice-only delivery.

## Check Status

Admin/full-access users can run:

```text
/voice_status
```

The command reports:

- voice enabled/disabled
- Fish Audio key present yes/no
- voiceProfileId present yes/no
- voiceProfileId source: media profile, ENV, or missing
- Cloudinary present yes/no
- ffmpeg present yes/no
- active expertId

For `/test_voice`, only Fish Audio key plus voiceProfileId must be ready.

## Test Dinara Voice

Admin/full-access users can run:

```text
/test_voice Привет, это тест голоса Динары
```

The command:

- resolves the active `expertId`
- loads the expert media profile
- uses `mediaProfile.voiceProfileId` or falls back to `FISH_AUDIO_VOICE_ID`
- calls the existing Fish Audio TTS function
- sends an mp3 back to Telegram
- does not spend generation limits
- does not update the main text generation flow

If ENV is missing, the bot explains which value is missing. If Fish Audio fails, the bot returns the provider error in a shortened admin-readable form.

## If There Is No Voice ID

Add Dinara's Fish Audio voice id to `runtime_data/media_profiles.json` as `voiceProfileId`, or set `FISH_AUDIO_VOICE_ID` in ENV.

Then run:

```text
/voice_status
/test_voice Привет, это тест голоса Динары
```

## If Cloudinary Is Missing

Voice mp3 testing still works.

The current limitation is video/audio hosting: talking-head video generation needs a hosted audio URL, so configure Cloudinary before testing video paths. Do not treat missing Cloudinary as a blocker for beta voice mp3 validation.

## Not Implemented Yet

- voice profile creation from uploaded samples
- automated Fish Audio voice cloning flow
- persistent audio job queue or retry manager
- payment integration
- new Telegram UX for voice testing
- image/video changes
- production/main deployment changes

## Beta Validation

Run syntax checks before shipping:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
```
