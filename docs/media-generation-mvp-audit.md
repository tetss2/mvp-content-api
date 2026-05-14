# Media Generation MVP Audit

Date: 2026-05-15
Branch: `ai-workflow-foundation`

## Scope

This audit covers the existing media generation surface for beta MVP readiness:

- voice/audio generation
- image/avatar generation
- talking-head video generation
- existing provider integrations
- minimal runtime config needed before wiring per-expert media profiles

No new provider calls, payment wiring, database migrations, Telegram UX changes, or text generation changes were added in this iteration.

## Existing Media Functions

### Voice and Audio

Implemented in `index.js`.

Existing pieces:

- `generateAudioText(fullAnswer, audioLength)` prepares a short Russian audio script from the generated post using OpenAI chat completion.
- `generateVoice(text)` calls Fish Audio TTS at `https://api.fish.audio/v1/tts`.
- `writeMsgpack()` builds the Fish Audio msgpack request payload.
- `sendAudioLengthChoice()` and callback handlers for `audlen_short` / `audlen_long` already exist.
- `sendAudioChoiceButtons()` offers AI audio or user-recorded voice.
- User-recorded voice flow exists through `audio_rec`, `voice_more`, `vc:<index>`, `sendVoiceSelectionMenu()`, and `msg.voice` handling.
- `MUSIC_LIBRARY`, `downloadTrack()`, `sendTrackPreview()`, and `mixAudioWithMusic()` support background music preview and ffmpeg mixing.
- `processAudioWithTrack()` sends the mixed voice and stores `lastAudioUrl` when Cloudinary upload succeeds.
- `uploadAudioToCloudinary()` uploads generated or recorded audio so Aurora video can consume it as a URL.

Relevant files:

- `index.js`
- `package.json` for `fluent-ffmpeg`
- `docs/railway-beta-deploy.md` for deployment notes around ffmpeg and env vars
- `author_voice.js`, `author_profiles/dinara/voice_profile.*`, and `expert_profiles/dinara/author_voice/*` are text-style author voice assets, not TTS voice clone wiring.

What can be quickly restored:

- Fish Audio TTS can be restored by setting `FISH_AUDIO_API_KEY` and `FISH_AUDIO_VOICE_ID`.
- Voice plus music can work if ffmpeg is available. The Docker/Railway docs already mention ffmpeg.
- Recorded user voice can already be used as the audio source for video after Cloudinary upload.

What is missing:

- No per-expert TTS profile routing yet.
- No stable consent/retention schema for voice samples.
- No provider-neutral voice abstraction.
- No preflight "media provider configured" guard before showing existing media buttons.

### Image and Avatar

Implemented in `index.js`.

Existing pieces:

- `buildTopicScenePrompt(topic)` uses OpenAI chat completion to turn a topic into an English scene description.
- `translateScene(text)` translates custom Russian scene text into a concise English image scene.
- `generateImage(chatId, scenePrompt)` calls FAL.ai Flux LoRA at `https://fal.run/fal-ai/flux-lora`.
- `BASE_PROMPT` is Dinara-specific portrait guidance.
- `LORA_URL` points to a fixed FAL-hosted LoRA weights file.
- `sendPhotoWithButtons()` stores generated photo state and offers retry/video/publish actions.
- Existing callbacks support `photo_topic`, `photo_office`, `photo_custom`, and `rp:<photoKey>`.
- Onboarding upload storage accepts `avatar` photos via `storeOnboardingFile()`.

Relevant files:

- `index.js`
- `expert-onboarding.js` for upload storage helpers used by avatar onboarding
- `runtime_data/media_profiles.json` added in this iteration as a draft config placeholder

What can be quickly restored:

- Dinara image generation can be restored by setting `FALAI_KEY` because the existing code already has the prompt, LoRA URL, and Flux LoRA endpoint.
- Avatar onboarding uploads can continue collecting source images for later beta profile decisions.

What is missing:

- No OpenAI image generation integration found.
- No ElevenLabs image/avatar integration, as expected.
- No per-expert `imageAvatarProfileId` routing yet.
- No dynamic LoRA/model URL per expert.
- No formal avatar consent/provider-processing state.
- Existing prompt is Dinara-specific and not ready for arbitrary experts.

### Video

Implemented in `index.js`.

Existing pieces:

- `generateVideoAurora(chatId, imageUrl, audioUrl)` submits async jobs to FAL.ai Creatify Aurora at `https://queue.fal.run/fal-ai/creatify/aurora`.
- `AURORA_PROMPT` defines a studio interview talking-head style.
- Aurora queue polling runs every 5 seconds for up to 48 attempts.
- `sendVideoWithButtons()` sends the generated video and stores `lastVideoUrl`.
- Existing callbacks support `mv:<photoKey>`, `vid_again`, and `cv:<videoKey>`.
- Video depends on both `lastImageUrl` and `lastAudioUrl`.
- `uploadAudioToCloudinary()` is the bridge that gives Aurora an audio URL.

Relevant files:

- `index.js`
- `docs/railway-beta-deploy.md`
- `docs/beta-launch-readiness.md`

What can be quickly restored:

- Talking-head video can be restored after image and audio are working, with `FALAI_KEY` plus Cloudinary env vars.
- Current flow already has queue polling, Telegram progress messages, and video send logic.

What is missing:

- No per-expert `videoAvatarProfileId` routing yet.
- No video provider abstraction.
- No fallback when Cloudinary is unavailable except user-facing audio-only behavior.
- No durable job storage; Aurora progress is in-memory per callback.
- No formal cost/spend cap beyond existing counters and estimated cost telemetry.

## Provider and ENV Inventory

Required or relevant existing env vars:

- `OPENAI_API_KEY`: text generation, audio script preparation, scene prompt generation, scene translation.
- `FISH_AUDIO_API_KEY`: Fish Audio TTS.
- `FISH_AUDIO_VOICE_ID`: Fish Audio reference voice ID.
- `FALAI_KEY`: FAL.ai Flux LoRA image generation and Aurora video generation.
- `CLOUDINARY_CLOUD`: Cloudinary audio hosting for Aurora.
- `CLOUDINARY_API_KEY`: Cloudinary audio hosting for Aurora.
- `CLOUDINARY_API_SECRET`: Cloudinary signed upload.
- `TG_CHANNEL`: optional publishing target for text/photo/video channel posts.

External services currently used or assumed:

- OpenAI chat completions for text, audio script, and image scene prompt preparation.
- Fish Audio for TTS.
- FAL.ai Flux LoRA for image generation.
- FAL.ai Creatify Aurora for talking-head video generation.
- Cloudinary for hosting generated audio as a video-consumable URL.
- Freesound CDN URLs as the static background music library.
- Local ffmpeg through `fluent-ffmpeg` for audio mixing.

Integrations searched but not found:

- ElevenLabs: no implementation found.
- OpenAI image API: no implementation found.
- OpenAI TTS API: no implementation found.
- Provider-neutral avatar/video registry: not present before this iteration.

## Minimal Runtime Config Added

Added `runtime_data/media_profiles.json`:

```json
{
  "expertId": "dinara",
  "voiceProfileId": null,
  "imageAvatarProfileId": null,
  "videoAvatarProfileId": null,
  "status": "draft",
  "updatedAt": "2026-05-15T00:00:00.000Z"
}
```

Added helper functions in `index.js`:

- `getDefaultMediaProfile()`
- `getMediaProfileForExpert(expertId)`

These helpers are intentionally not wired into live media generation yet. They only establish the read path for a future beta-safe media profile layer.

## Shortest Beta MVP Path

### 1. Voice

Shortest path:

1. Keep the current Fish Audio flow.
2. Set `FISH_AUDIO_API_KEY` and `FISH_AUDIO_VOICE_ID`.
3. Add a small preflight guard that hides or blocks AI voice only when those vars are missing.
4. Later, map `mediaProfile.voiceProfileId` to `FISH_AUDIO_VOICE_ID` for per-expert voice routing.

Why this is shortest:

- `generateVoice()`, audio script generation, Telegram send flow, cost tracking, quota tracking, and music mixing already exist.

### 2. Image / Avatar

Shortest path:

1. Keep the current FAL.ai Flux LoRA flow for Dinara.
2. Set `FALAI_KEY`.
3. Treat `mediaProfile.imageAvatarProfileId` as the future pointer to a LoRA/model/profile ID.
4. Do not generalize prompts until a second real expert is onboarded.

Why this is shortest:

- `generateImage()`, Dinara prompt, LoRA URL, retry flow, topic/office/custom scene flows, Telegram photo delivery, and cost tracking already exist.

### 3. Video

Shortest path:

1. Restore voice first, because Aurora needs an audio URL.
2. Restore image/avatar second, because Aurora needs an image URL.
3. Set `FALAI_KEY` and Cloudinary env vars.
4. Keep `generateVideoAurora()` as-is for beta.
5. Later, map `mediaProfile.videoAvatarProfileId` to provider settings or avatar/video model metadata.

Why this is shortest:

- Aurora queue submission, polling, progress updates, Telegram video delivery, and retry flow already exist.

## Risk Notes

- Existing media flow is Dinara-centric. That is acceptable for MVP beta if the beta scope is Dinara only.
- Current media buttons may expose flows even when provider env vars are missing. This should be fixed with preflight guards before beta testers use media.
- Voice/avatar consent and retention metadata are still not modeled.
- Media job state is in memory; restarts can lose in-progress user state.
- No real payments should be attached to media yet.

## Recommendation

Use the existing integrations rather than adding new providers. For beta, the next implementation should be a small provider readiness guard plus wiring `media_profiles.json` into the existing Fish/FAL selectors, without changing Telegram UX or text generation.
