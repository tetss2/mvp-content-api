# Project Operating System

This repository is an AI content factory for a Telegram-first expert product. The current job is not to build a platform. The current job is to make the generated content feel more like Dinara Kachaeva, less like generic AI, and more useful inside the Telegram workflow.

The default question for every implementation decision is:

**Does this visibly improve the generated content quality?**

If the answer is not clearly yes, do not spend implementation time on it now.

## Project Philosophy

The product wins when a real user reads the output and feels: "yes, this sounds like Dinara could have written it." Runtime internals matter only when they help that happen faster or more reliably.

Prefer direct changes to the working bot over speculative architecture. Improve prompts, examples, cleanup rules, button flows, and generation behavior where the current runtime already makes decisions.

The best implementation work here is practical, visible, and small enough to ship quickly but large enough to reduce repeated manual prompting.

## Current Product Priorities

1. Stronger Dinara persona realism.
2. Less generic AI phrasing.
3. More human emotional cadence.
4. Better few-shot examples and style constraints.
5. Cleaner Telegram post rhythm.
6. Better regeneration and editing controls.
7. Better final text for publishing with photo, video, and voice.

## Architecture Constraints

The production bot is currently centered in `index.js`. Work with that reality.

Do not introduce new services, orchestration systems, generalized registries, governance engines, or platform abstractions unless they directly unlock a visible product improvement in the same implementation block.

No large refactors. No runtime modularization for its own sake. No infrastructure changes unless the bot cannot run without them.

## Implementation Philosophy

Modify the live path directly. Keep the change close to the generation or Telegram behavior it improves.

Prefer:

- prompt improvements
- direct behavioral constraints
- forbidden phrase suppression
- few-shot injection
- post-generation cleanup
- button and callback improvements
- better author-specific wording

Avoid:

- abstraction layers
- orchestration frameworks
- generalized expert engines
- architecture-only cleanups
- premature scalability work
- new storage models
- new queues
- new services

## Anti-Overengineering Rules

If a change can be done in the existing generation function, do it there.

If a rule can be expressed as a prompt instruction or simple cleanup function, do not build a rules engine.

If a UX improvement can be added as one Telegram button or callback, do not create a flow framework.

If a prompt can be improved with 10 lines of explicit author behavior, do not create a persona system.

If a task does not improve output quality, author identity, emotional realism, or Telegram usability, defer it.

## Product Success Metrics

A successful change should improve at least one of these:

- generated posts sound more like Dinara
- openings feel less templated
- paragraphs breathe like a human wrote them
- emotional transitions feel softer and more specific
- CTA feels real, not marketing-pressure
- fewer phrases like generic AI advice
- fewer list-shaped, lecture-shaped outputs
- better one-tap Telegram iteration
- less manual editing needed before publishing

## Iteration Philosophy

Work in grouped implementation blocks, not tiny scattered edits. Each block should be completable in a few hours and should leave the bot better for real use.

A good iteration includes:

1. Identify the visible product problem.
2. Patch the direct runtime path.
3. Validate syntax and a representative generation path where possible.
4. Commit with a concise product-facing message.
5. Move to the next high-impact block only if the previous one is stable.

When in doubt, choose the change that improves the next generated Telegram post.
