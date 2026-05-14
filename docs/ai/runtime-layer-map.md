# Runtime Layer Map

## Purpose

This document maps the intended runtime sublayers and ownership boundaries for future architecture-safe work. It describes the current structure without changing runtime behavior.

## Runtime entrypoints

### Production Telegram entrypoint

Owner: Telegram UX layer.

Current file:

- `index.js`

Responsibilities:

- Telegram polling and command handlers.
- User state and delivery-format flow.
- Production content generation UX.
- Admin-only runtime preview command.
- Runtime preview report serialization.

Boundary rule:

- Future runtime architecture work should avoid editing `index.js` unless the iteration explicitly includes Telegram UX or admin command integration.

### Admin runtime adapter entrypoint

Owner: Runtime orchestration bridge.

Current file:

- `scripts/runtime-generation-adapter.js`

Responsibilities:

- Runs unified runtime.
- Builds prompt package from runtime decisions and local context.
- Applies runtime quality stabilization.
- Runs execution sandbox.
- Runs identity, campaign memory, strategy, and editorial sublayers.
- Returns a combined local-only runtime payload.

Boundary rule:

- Treat this file as the current integration bottleneck. Changes here can affect multiple runtime layers and should not be mixed with layer-local work.

### Unified runtime prototype

Owner: Runtime orchestration and cognition prototype.

Current file:

- `scripts/unified-generation-runtime.js`

Responsibilities:

- Loads expert and cognition state.
- Creates runtime state.
- Loads local retrieval candidates.
- Evaluates repetition, trust pacing, audience memory, and author voice.
- Builds campaign and production packs.
- Persists cognition state.

Boundary rule:

- Treat as a prototype orchestration file until a future migration plan moves stable pieces into `runtime/`.

## Runtime sublayers

### Execution layer

Directory:

- `runtime/execution/`

Primary files:

- `runtime-executor.js`
- `runtime-sandbox.js`
- `runtime-output-sanitizer.js`
- `runtime-response-validator.js`

Owns:

- Execution mode normalization.
- Local sandbox execution.
- Mock/OpenAI adapter handoff in admin sandbox mode.
- Output sanitization.
- Output validation.
- Execution diagnostics.

Does not own:

- Retrieval selection.
- Prompt assembly strategy.
- Campaign memory.
- Strategic decisions.
- Editorial decisions.
- Telegram delivery.

Parallel safety:

- Safe as an isolated zone if no other session changes `scripts/runtime-generation-adapter.js` or `scripts/runtime-quality-analyzer.js`.
- High-risk if execution changes require adapter payload changes.

### Stabilization layer

Directory:

- `runtime/stabilization/`

Primary files:

- `author-voice-rules.js`
- `cta-pacing-rules.js`
- `emotional-pacing-rules.js`
- `anti-generic-rules.js`
- `repetition-risk-rules.js`
- `utils.js`

Current script-side companion:

- `scripts/runtime-quality-analyzer.js`

Owns:

- Prompt/runtime quality scoring rules.
- Soft constraints for author voice, CTA pressure, emotional pacing, anti-generic behavior, repetition risk, continuity, and context integration.
- Shared scoring utilities.

Does not own:

- Runtime state persistence.
- Strategic memory.
- Report file destinations.
- Telegram preview formatting.

Parallel safety:

- Safe for rule-only changes when no other session changes quality analyzer behavior.
- Not safe to combine with execution output validation changes unless explicitly coordinated.

### Identity layer

Directory:

- `runtime/identity/`

Primary files:

- `author-identity-engine.js`
- `persona-memory.js`
- `worldview-profile.js`
- `emotional-signature.js`
- `rhetorical-patterns.js`
- `narrative-continuity.js`
- `identity-drift-detector.js`

Owns:

- Author identity fingerprinting.
- Persona memory.
- Worldview consistency.
- Emotional and rhetorical continuity.
- Identity drift detection.

Does not own:

- Campaign sequence memory.
- Trust or conversion strategy.
- Editorial calendar and format decisions.
- Retrieval or prompt assembly.

State:

- Writes persona memory under `storage/identity/` or equivalent current memory path returned by `persona-memory.js`.

Parallel safety:

- Safe as a code zone if no other session writes identity memory or adapter identity payloads.
- Simulations should run with persistence disabled unless the task is explicitly about identity memory state.

### Campaign memory layer

Directory:

- `runtime/campaign-memory/`

Primary files:

- `campaign-memory-engine.js`
- `campaign-state-store.js`
- `topic-history.js`
- `cta-history.js`
- `narrative-arcs.js`
- `audience-fatigue-detector.js`
- `content-sequence-planner.js`

Owns:

- Topic repetition memory.
- CTA fatigue memory.
- Narrative arc continuity.
- Audience fatigue observations.
- Content sequence coherence.
- Campaign state persistence.

Does not own:

- Strategic positioning decisions beyond memory signals.
- Editorial format calendar.
- Author identity scoring.
- Prompt text quality stabilization.

State:

- Writes campaign state under the campaign memory store path.

Parallel safety:

- Safe as a code zone when isolated from strategy/editorial adapter changes.
- Not safe to run persistent simulations in parallel for the same expert.

### Strategy layer

Directory:

- `runtime/strategy/`

Primary files:

- `strategic-brain.js`
- `strategic-memory-store.js`
- `trust-building-engine.js`
- `authority-pacing.js`
- `emotional-funnel-engine.js`
- `conversion-pressure-detector.js`
- `audience-state-engine.js`
- `positioning-manager.js`
- `narrative-loop-engine.js`

Owns:

- Trust pacing.
- Authority pacing.
- Emotional funnel state.
- Conversion pressure and overselling protection.
- Audience state interpretation.
- Positioning reinforcement.
- Narrative loop strategy.
- Strategic memory persistence.

Does not own:

- Campaign history source of truth.
- Editorial format scheduling.
- Output sanitization.
- Retrieval and prompt grounding.

State:

- Writes strategic memory under the strategic memory store path.

Parallel safety:

- Safe as a code zone if campaign memory contracts are stable.
- High merge risk with adapter and report changes because strategy signals are surfaced broadly.

### Editorial layer

Directory:

- `runtime/editorial/`

Primary files:

- `editorial-director.js`
- `editorial-memory-store.js`
- `storytelling-engine.js`
- `format-orchestrator.js`
- `audience-temperature-engine.js`
- `attention-loop-engine.js`
- `content-balance-engine.js`
- `editorial-pacing-engine.js`
- `emotional-arc-planner.js`
- `editorial-calendar-engine.js`

Owns:

- Content category balance.
- Storytelling continuity.
- Format orchestration.
- Audience temperature.
- Attention loop signals.
- Emotional arc recommendations.
- Editorial freshness and saturation.
- Editorial memory persistence.

Does not own:

- Strategic trust/conversion policy.
- Campaign memory source events.
- Final Telegram formatting.
- Retrieval and prompt assembly.

State:

- Writes editorial state under the editorial memory store path.

Parallel safety:

- Safe as a code zone when no other session edits adapter editorial payload wiring.
- Current branch already has uncommitted editorial work, so future sessions must coordinate before touching this zone.

## Cross-layer adapter flow

Current local preview flow:

1. `index.js` admin command calls `runRuntimeGenerationAdapter`.
2. Adapter calls `runUnifiedGenerationRuntime`.
3. Unified runtime loads cognition, creates runtime state, retrieves local metadata candidates, evaluates runtime state, and produces a production pack.
4. Adapter builds a prompt package using generation/retrieval helpers.
5. Adapter applies stabilization through `scripts/runtime-quality-analyzer.js`.
6. Adapter runs execution sandbox through `runtime/execution/`.
7. Adapter runs identity layer.
8. Adapter runs campaign memory layer.
9. Adapter runs strategy layer.
10. Adapter runs editorial layer.
11. Adapter returns a combined local-only payload.
12. `index.js` writes runtime preview JSON/Markdown reports and sends Telegram admin summary.

## Ownership boundaries

### Retrieval boundary

Retrieval should provide selected context and trace data. It should not own runtime decisions, pacing, memory, or editorial recommendations.

Current boundary issue:

- Adapter and unified runtime both call retrieval-related helpers directly.

Future target:

- A narrow runtime context interface such as `RuntimeContextPack`, produced outside runtime decision layers.

### Runtime orchestration boundary

Runtime orchestration should coordinate sublayers and assemble their outputs. It should not embed report formatting, Telegram delivery, or retrieval implementation details.

Current boundary issue:

- Adapter combines orchestration, prompt assembly, stabilization, execution sandbox, and final payload shaping.

Future target:

- Split orchestration coordinator, prompt package adapter, and preview/report serializer.

### Reporting boundary

Reports should serialize results and verification summaries. They should not define runtime behavior.

Current boundary issue:

- Report structure is embedded in multiple scripts and in `index.js`.

Future target:

- A shared report taxonomy and optional shared report writer, introduced only after schema is documented.

### Persistence boundary

Memory stores should persist only layer-owned state. Simulations and previews should make persistence explicit.

Current boundary issue:

- Several runtime engines default to persistence unless callers opt out.

Future target:

- Preview/simulation commands should visibly choose `persist: false` or document why persistence is required.

## Future parallel-safe zones

Safe zones when branches are coordinated:

- `runtime/identity/` for identity scoring and persona memory work.
- `runtime/campaign-memory/` for campaign memory work.
- `runtime/strategy/` for strategic brain work.
- `runtime/editorial/` for editorial direction work.
- `runtime/execution/` for sandbox, sanitization, and output validation work.
- `runtime/stabilization/` for scoring/rule work.
- `reports/` and `docs/ai/` for documentation/report taxonomy work.
- `scripts/verify-*.js` for verification-only work, if report paths are stable.

Unsafe overlap zones:

- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `scripts/runtime-quality-analyzer.js`
- `index.js`
- shared generated reports under `reports/`
- shared local state under `storage/`

## Naming guidance

Preferred runtime naming:

- Layer directories use kebab-case.
- Engine files should name their owned layer or sublayer: `*-engine.js`, `*-detector.js`, `*-store.js`, `*-rules.js`.
- Report directories should align with runtime layer names: `runtime-identity`, `runtime-campaign-memory`, `runtime-strategy`, `runtime-editorial`, `runtime-execution`, `runtime-stabilization`, `runtime-generation`.
- Runtime payload keys should remain stable once used by reports or Telegram preview output.

## Migration principle

Do not move runtime logic until interfaces are documented. The safe migration order is:

1. Document current contracts.
2. Standardize report names and payload categories.
3. Add layer-level public entrypoints only if needed.
4. Move code in small behavior-preserving commits.
5. Run verification after every move.
