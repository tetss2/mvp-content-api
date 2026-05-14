# Voice Generation Beta Readiness

Minimal readiness layer for returning existing Fish Audio voice generation to the beta MVP.

## Required ENV

Voice generation needs:

```env
FISH_AUDIO_API_KEY=...
FISH_AUDIO_VOICE_ID=...
```

`FISH_AUDIO_VOICE_ID` is a fallback. If the active expert has `voiceProfileId` in `runtime_data/media_profiles.json`, that value is used instead.

Cloudinary is optional for sending the generated voice back to Telegram, but needed when the existing audio-to-video path needs a hosted audio URL:

```env
CLOUDINARY_CLOUD=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

`ffmpeg` should be installed on the runtime if audio + music mixing is used. If it is missing, the existing flow falls back to voice-only delivery.

## Enable Voice For Dinara

For Dinara, set one of these:

1. Add a Fish Audio voice profile to `runtime_data/media_profiles.json`:

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

2. Or set `FISH_AUDIO_VOICE_ID` in ENV.

The runtime resolves voice in this order:

```text
media profile voiceProfileId -> FISH_AUDIO_VOICE_ID
```

## Check Status

Admin/full-access users can run:

```text
/voice_status
```

The command reports:

- voice enabled/disabled
- Fish Audio key present yes/no
- voiceProfileId present yes/no
- Cloudinary present yes/no
- ffmpeg required/present yes/no
- active expertId

If Fish Audio configuration is missing, AI voice generation does not crash the bot. It responds:

```text
Voice generation is not configured yet.
```

## Current Scope

Implemented in this beta pass:

- reuse existing Fish Audio TTS function
- reuse existing short audio text generation
- reuse existing Cloudinary upload helper
- reuse existing ffmpeg music mixing helper
- resolve expert-specific `voiceProfileId` through `getMediaProfileForExpert(expertId)`
- add safe readiness checks before AI voice generation
- add `/voice_status`

Not implemented in this pass:

- new Telegram UX buttons
- payment flow
- database migrations
- image/video changes
- voice cloning or profile creation from uploaded samples
- persistent queueing or retry management for audio jobs

## Next Step

For real beta audio generation, configure `FISH_AUDIO_API_KEY` and either Dinara's `voiceProfileId` in `runtime_data/media_profiles.json` or `FISH_AUDIO_VOICE_ID` in ENV. Then run `/voice_status`, generate a text post, choose AI audio, and verify the bot returns an MP3 voice message.
