# Video Generation Beta Readiness

This document covers the MVP beta path for a short Dinara talking-head video in Telegram:

```text
/test_video Привет, это тест видео Динары
```

The command is admin/full-access only and does not increment generation limits.

## Required ENV

Video needs the same providers that the existing media pipeline already uses:

```env
FALAI_KEY=...
FISH_AUDIO_API_KEY=...
FISH_AUDIO_VOICE_ID=...
CLOUDINARY_CLOUD=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

`FISH_AUDIO_VOICE_ID` can be replaced by `voiceProfileId` in `runtime_data/media_profiles.json`.

## Readiness Check

In Telegram, run:

```text
/video_status
```

Expected checks:

- `FALAI_KEY present: yes`
- `Cloudinary present: yes`
- `Fish Audio key present: yes`
- `voiceProfileId present: yes`
- `video model/endpoint: fal-ai/creatify/aurora`
- `active expertId: dinara`

If Cloudinary is missing, `/test_video` should stop with a clear message because Aurora needs a public audio URL.

## Test Command

Run:

```text
/test_video Привет, это тест видео Динары
```

The command performs four steps:

1. Generate a short Fish Audio mp3.
2. Upload the mp3 to Cloudinary for a public audio URL.
3. Generate a Dinara image with the existing FAL.ai Flux LoRA flow and default office scene prompt.
4. Submit image URL + audio URL to FAL.ai Creatify Aurora and send the resulting video to Telegram.

Console logs are prefixed with `[/test_video]`.

## Already Working

- `/test_voice` returns mp3 in Telegram.
- `/test_image` returns a Dinara image in Telegram.
- `generateVideoAurora(chatId, imageUrl, audioUrl)` submits to FAL.ai Creatify Aurora.
- `uploadAudioToCloudinary()` creates the public audio URL required by Aurora.
- Telegram video delivery uses `bot.sendVideo`.
- Existing callback video flow can generate from `lastImageUrl` + `lastAudioUrl`.

## Not Implemented Yet

- No payment connection for video.
- No generation-limit decrement in `/test_video`.
- No autoposting.
- No durable video job storage.
- No provider-neutral video abstraction.
- No per-expert `videoAvatarProfileId` routing beyond reporting readiness metadata.
- No fallback video provider when FAL.ai Aurora is unavailable.
