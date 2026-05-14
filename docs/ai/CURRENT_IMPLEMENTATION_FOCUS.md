# Current Implementation Focus

The current implementation focus is generation realism and Telegram usefulness for Dinara Kachaeva.

No large refactors. No new services. No infrastructure changes.

## 1. Dinara Persona Realism

Make the output feel like a specific Russian psychologist and sexologist speaking to her audience, not a generic expert account.

Prioritize:

- first-person observations
- gentle but concrete phrasing
- psychologically precise emotional language
- warm authority without lecturing
- natural Russian Telegram rhythm

## 2. Anti-AI Writing Cleanup

Suppress phrases and structures that reveal the model:

- "важно понимать"
- "следует отметить"
- "таким образом"
- "в современном мире"
- "данная тема"
- generic numbered advice
- overly balanced essay conclusions
- repetitive emoji stuffing
- motivational poster endings

The goal is not sterile text. The goal is human text.

## 3. Few-Shot Examples

Use small, concrete examples of Dinara-like openings, transitions, and endings directly in prompts.

Few-shots should teach:

- emotional entry
- paragraph rhythm
- practical turn
- non-salesy CTA
- personal but not fake confession

Keep examples short. Do not create a large example framework.

## 4. Emotional Cadence

Posts should move like this:

1. Name the reader's inner state.
2. Normalize it without flattening it.
3. Add one clear psychological explanation.
4. Offer one small practical shift.
5. End with a soft question or grounded invitation.

Avoid abrupt jumps from pain to advice.

## 5. Humanization Pass

After generation, clean the text lightly:

- remove obvious AI filler
- soften robotic transitions
- reduce markdown fragility
- avoid list formatting unless explicitly needed
- keep paragraphs short
- preserve Dinara's warmth

This should stay a simple helper, not a rewrite pipeline.

## 6. Telegram UX Controls

Make iteration faster in Telegram:

- regenerate text
- regenerate with a softer tone
- regenerate with a more direct/practical tone
- edit manually
- continue to audio/photo/video

Controls should reduce manual orchestration and help the user reach a publishable post faster.

## Explicit Non-Goals

Do not do large refactors.

Do not add new services.

Do not change infrastructure.

Do not build generalized expert orchestration.

Do not platformize the bot.

Do not move runtime code around just to make it look cleaner.
