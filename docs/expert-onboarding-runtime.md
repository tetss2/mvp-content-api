# Lightweight Expert Onboarding Runtime

Runtime-only onboarding adds new experts without database migrations, SaaS refactors, or changes to the Dinara production runtime.

## Commands

- `/expert_create` starts a 4-step Telegram flow:
  - `expertId`
  - `displayName`
  - niche/topic
  - style description
- `/expert_list` shows registered runtime experts and quick switch buttons.
- `/expert_switch expertId` sets the active expert for the current chat/admin runtime session.
- `/expert_status` shows active expert, media readiness, KB readiness, and onboarding completeness.

## Runtime Files

Experts are stored in `runtime_data/experts.json`:

```json
{
  "experts": [
    {
      "expertId": "dinara",
      "displayName": "Динара",
      "niche": "психология, отношения, самоценность",
      "styleDescription": "тёплый, глубинный, бережный голос практикующего психолога",
      "knowledgeBase": "psychologist",
      "styleProfile": "dinara_style",
      "status": "active",
      "kbConfigured": true
    }
  ]
}
```

Media profiles are stored in `runtime_data/media_profiles.json`:

```json
{
  "profiles": [
    {
      "expertId": "dinara",
      "voiceProfileId": null,
      "imageAvatarProfileId": null,
      "videoAvatarProfileId": null,
      "imagePromptBase": null,
      "status": "draft"
    }
  ]
}
```

New experts get a scaffold media profile automatically. There is no upload UI yet; media fields can be filled manually later.

## Runtime Behavior

Dinara remains the default expert. If no expert is switched, generation uses `dinara`, the existing psychologist KB, Dinara style prompts, and existing env/LoRA fallbacks.

For non-Dinara runtime experts:

- Text generation uses the active expert's `displayName`, `niche`, and `styleDescription`.
- The prompt explicitly avoids Dinara identity, biography, voice, examples, and visual profile.
- `knowledgeBase` defaults to `runtime:{expertId}` and `kbConfigured` is `false`.
- If no KB exists, generation uses only the runtime profile and topic as grounding.
- Voice/image/video do not inherit Dinara media fallbacks.
- Voice is configured only when `voiceProfileId` is present in `media_profiles.json`.
- Image is configured only when `imageAvatarProfileId` is present in `media_profiles.json`.
- Video is configured only when voice, image, FAL, and Cloudinary readiness are all present.

## Validation

Run:

```bash
node --check index.js
node --check start.js
node --check leads-bot.js
```

Manual smoke test in Telegram:

1. Send `/expert_status` and confirm `dinara` is active by default.
2. Send `/expert_create` and complete the 4 steps.
3. Send `/expert_status` and confirm the new expert is active, KB is `no`, and media is `no`.
4. Send `/expert_list`, switch back to Dinara, then check `/expert_status` again.
5. Generate a text post and confirm the active expert label/profile is used.
