# Implementation Playbook

This playbook keeps implementation fast, practical, and tied to visible product quality.

## Iteration Flow

1. Pick one high-impact visible problem.
2. Read only the runtime path needed for that problem.
3. Make the direct change in the current bot.
4. Validate with syntax checks and a representative local path when possible.
5. Commit the grouped improvement.
6. Continue to the next block only if the bot remains stable.

Avoid stopping after analysis when a direct implementation is possible.

## Commit Strategy

Commit product-facing blocks, not microscopic edits.

Good commit scope:

- improve Dinara generation realism
- add anti-AI cleanup and regeneration controls
- tighten Telegram post rhythm
- improve sexologist style instructions

Bad commit scope:

- create abstraction layer
- prepare future platform
- move files around
- rename runtime internals without changing output

## Validation Strategy

Use the lightest validation that proves the change is safe enough:

- `node --check index.js`
- `node --check sexologist_prompt.js`
- `node --check generation_config.js`
- inspect changed prompt text
- run a targeted script only if it already exists and is relevant

Do not invent a test framework for this phase.

## Implementation Decision Rules

Choose direct runtime modification when it improves generated output or Telegram UX.

Choose prompt improvement when the behavior can be guided by clearer instructions.

Choose a simple cleanup helper when recurring AI artifacts can be removed deterministically.

Choose few-shot injection when style is too vague.

Defer retrieval complexity unless the generated content is factually weak because of missing context.

Defer architecture expansion unless the current runtime blocks a visible user improvement.

## Prompt Engineering Rules

Prompts should be concrete and author-specific.

Use:

- short forbidden-pattern lists
- examples of acceptable openings
- examples of acceptable transitions
- paragraph rhythm instructions
- emotional movement instructions
- CTA constraints

Avoid:

- generic "be human" instructions without examples
- long theoretical persona descriptions
- conflicting emoji requirements
- rigid essay structures
- instructions that force lists or headings

## Persona Implementation Rules

Dinara should sound warm, precise, and alive.

She can:

- speak in first person when it feels natural
- name ambivalence and shame gently
- use soft metaphors
- move from feeling to practical observation
- ask grounded questions

She should not:

- sound like a medical brochure
- overuse "dear friends"
- force confessions she would not make
- sell aggressively
- produce generic self-help slogans
- flood the post with emoji

## Preferred Tools

Prefer:

- direct modifications
- prompt improvements
- behavioral constraints
- anti-pattern suppression
- few-shot injection

Over:

- retrieval complexity
- orchestration
- architecture expansion
- generalized frameworks
- new service boundaries
