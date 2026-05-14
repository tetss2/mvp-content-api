# Runtime Contracts

## Purpose

This document defines lightweight runtime contracts for future architecture-safe work. It describes intended ownership and boundaries only. It does not authorize runtime rewrites, Telegram behavior changes, retrieval changes, report path migrations, or production configuration changes.

These contracts should be treated as planning guardrails before moving orchestration logic out of the current integration files.

## Contract principles

- Runtime contracts define ownership, not implementation.
- Runtime layers may observe other layer outputs through narrow payloads, but they should not reach into another layer's storage or internal decisions.
- Report serialization should describe runtime behavior after it happens, not decide runtime behavior.
- Telegram handlers should call stable runtime entrypoints, not compose runtime internals.
- Retrieval should provide context and trace data, not own strategy, pacing, identity, editorial, or Telegram delivery decisions.
- Persistent state mutation must be explicit for previews, simulations, and future parallel Codex sessions.

## Generation adapter contract

Current primary file:

- `scripts/runtime-generation-adapter.js`

Responsibility:

- Coordinate the local/admin runtime generation flow.
- Bridge unified runtime output, retrieval/prompt package assembly, stabilization, execution sandbox, identity, campaign memory, strategy, editorial direction, and final payload shaping.
- Return a combined runtime payload for preview/report consumers.

Input ownership:

- Receives user/admin generation request inputs from the caller.
- May consume selected context and generation settings from retrieval and prompt assembly helpers.
- May consume runtime sublayer configuration and prior state through layer-owned APIs.

Output ownership:

- Owns the adapter-level runtime result payload.
- Owns cross-layer diagnostics needed by preview/report consumers.
- Should expose stable keys once reports or Telegram preview code depend on them.

Forbidden responsibilities:

- Do not own Telegram command handling or user-facing copy.
- Do not own retrieval ranking semantics or index mutation.
- Do not own generated report file locations as business logic.
- Do not directly mutate another runtime layer's internal state outside that layer's public API.
- Do not become the long-term home for layer-specific algorithms.

Known risk areas:

- It is the current integration bottleneck.
- Small changes can affect retrieval context, prompt assembly, runtime decisions, execution output, reports, and Telegram admin preview behavior.
- Future work should split stable coordinator, prompt adapter, and report serializer responsibilities only after payload contracts are documented.

## Retrieval adapter contract

Current relevant files:

- retrieval and generation assembly helpers used by `scripts/runtime-generation-adapter.js`
- local candidate creation in `scripts/unified-generation-runtime.js`

Responsibility:

- Provide selected knowledge context, source metadata, scoring traces, and grounding diagnostics to runtime orchestration.
- Keep retrieval-specific evaluation and debugging separate from runtime decision-making.

Input ownership:

- Owns query/topic inputs needed for retrieval.
- Owns knowledge index, chunk metadata, reranking, deduplication, diversity filtering, and context assembly inputs.

Output ownership:

- Owns a context pack or retrieval trace payload.
- Owns source attribution and retrieval diagnostics.

Forbidden responsibilities:

- Do not decide campaign pacing, CTA pressure, strategic positioning, identity continuity, or editorial format.
- Do not format Telegram messages.
- Do not write runtime memory state.
- Do not mutate indexes during runtime preview or report generation unless explicitly scoped by an ingestion task.

Known risk areas:

- The adapter currently imports retrieval/prompt assembly helpers directly, so runtime and retrieval can change together accidentally.
- Future target is a narrow `RuntimeContextPack`-style interface produced outside runtime decision layers.

## Identity adapter contract

Current primary directory:

- `runtime/identity/`

Responsibility:

- Evaluate author identity continuity, persona memory, worldview consistency, emotional signature, rhetorical patterns, narrative continuity, and identity drift.
- Provide identity signals to the runtime adapter without owning campaign, strategy, editorial, or Telegram concerns.

Input ownership:

- Owns identity profile, persona memory, and author-voice inputs.
- May consume generated content candidates and context needed for identity scoring.

Output ownership:

- Owns identity scores, drift warnings, continuity signals, and identity memory updates.

Forbidden responsibilities:

- Do not own campaign sequence state.
- Do not decide strategic conversion pressure.
- Do not choose editorial format or calendar timing.
- Do not serialize cross-layer reports.

Known risk areas:

- Identity memory is stateful.
- Parallel previews for the same expert can create confusing state diffs if persistence is enabled.

## Campaign memory adapter contract

Current primary directory:

- `runtime/campaign-memory/`

Responsibility:

- Track campaign history, topic repetition, CTA history, narrative arcs, audience fatigue, and sequence continuity.
- Provide memory signals to strategy, editorial, and adapter-level reporting.

Input ownership:

- Owns campaign memory records, topic history, CTA history, narrative arc state, and campaign sequence observations.
- May consume current topic, content candidate, and delivery intent.

Output ownership:

- Owns campaign memory diagnostics, fatigue signals, sequence recommendations, and campaign state updates.

Forbidden responsibilities:

- Do not own author identity scoring.
- Do not own strategic positioning policy beyond memory signals.
- Do not own final prompt assembly.
- Do not format Telegram output.

Known risk areas:

- Campaign state persistence can conflict in parallel sessions.
- Strategy and editorial layers may depend on campaign signals, so payload changes need coordination.

## Strategic brain adapter contract

Current primary directory:

- `runtime/strategy/`

Responsibility:

- Interpret trust building, authority pacing, emotional funnel position, conversion pressure, audience state, positioning, narrative loop, and strategic memory.
- Provide strategic recommendations and warnings to runtime orchestration.

Input ownership:

- Owns strategic memory and strategy-layer configuration.
- May consume campaign memory signals, topic intent, audience context, and content candidate summaries.

Output ownership:

- Owns strategic scores, pacing recommendations, positioning signals, conversion pressure warnings, and strategic memory updates.

Forbidden responsibilities:

- Do not own retrieval context selection.
- Do not own campaign history source of truth.
- Do not own editorial calendar state.
- Do not own output validation or sanitization.

Known risk areas:

- Strategy signals are surfaced broadly in reports.
- Changes can create indirect report and adapter payload churn even when code stays layer-local.

## Editorial director adapter contract

Current primary directory:

- `runtime/editorial/`

Responsibility:

- Evaluate content balance, storytelling continuity, format orchestration, audience temperature, attention loops, emotional arc, editorial freshness, and editorial memory.
- Provide editorial recommendations without changing Telegram UX or retrieval behavior.

Input ownership:

- Owns editorial memory and editorial layer configuration.
- May consume topic, format intent, content candidate, campaign signals, and strategy signals.

Output ownership:

- Owns editorial diagnostics, format recommendations, freshness warnings, emotional arc guidance, and editorial memory updates.

Forbidden responsibilities:

- Do not own strategic trust or conversion policy.
- Do not own campaign memory persistence.
- Do not own Telegram delivery formatting.
- Do not own retrieval or prompt grounding.

Known risk areas:

- Editorial output is useful for reports and preview summaries, so payload shape changes should be coordinated with report work.
- Future parallel work should avoid editing adapter wiring at the same time as editorial internals.

## Report adapter contract

Current relevant locations:

- runtime preview report functions in `index.js`
- report-producing scripts under `scripts/`
- report directories under `reports/`

Responsibility:

- Serialize runtime, verification, preview, and evaluation results into human-readable or machine-readable reports.
- Preserve report metadata needed for validation: scope, layer, report type, source command, production mutation, external API calls, state mutation, and status.

Input ownership:

- Consumes completed runtime payloads, verification summaries, and simulation outputs.
- May consume static report registry metadata when a registry exists.

Output ownership:

- Owns report document structure, report filenames, and report metadata.
- Owns generated/manual classification once the report registry exists.

Forbidden responsibilities:

- Do not decide runtime behavior.
- Do not trigger retrieval/index mutation as a side effect of serialization.
- Do not mutate runtime memory state.
- Do not define Telegram user-facing behavior.

Known risk areas:

- Reports are currently generated by several owners.
- Naming drift and duplicate report concepts make future verification brittle.
- Report path migrations should be done one family at a time with generator updates and validation.

## Telegram boundary layer contract

Current primary file:

- `index.js`

Responsibility:

- Own Telegram polling, command handlers, callback flows, user state, message delivery, media delivery, and admin command entrypoints.
- Call runtime entrypoints as a consumer, not as a runtime implementation layer.

Input ownership:

- Owns Telegram update payloads, chat/user identifiers, callback data, and UX state.
- Owns admin command arguments before handing them to runtime adapters.

Output ownership:

- Owns Telegram messages, captions, callback keyboards, media delivery, and admin preview delivery.

Forbidden responsibilities:

- Do not own runtime sublayer algorithms.
- Do not own retrieval ranking behavior.
- Do not own runtime memory internals.
- Do not own report taxonomy beyond invoking a report serializer.

Known risk areas:

- `index.js` currently contains production bot logic and admin runtime preview/report serialization.
- Runtime architecture work should avoid this file unless the iteration explicitly owns Telegram UX or admin preview integration.

## Current contract gaps

- There is no machine-readable runtime payload schema.
- Report ownership is documented but not enforced.
- Runtime preview persistence is not uniformly explicit.
- Retrieval context is not yet isolated behind a stable adapter payload.
- `scripts/` contains both runtime prototypes and utility scripts, so ownership must be checked before editing.

## Safe migration order

1. Keep these contracts documentation-only until the report registry and payload map are stable.
2. Introduce schema files only for new reports or new helper structures, not for existing runtime behavior.
3. Add layer-level entrypoints only when needed by a scoped iteration.
4. Move code in small behavior-preserving commits.
5. Validate after every move with the matching verification command.
