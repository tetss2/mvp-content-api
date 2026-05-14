# Parallelization Zones

## Purpose

This document defines future Codex parallel work zones for the repository. It is intended to reduce merge conflicts, runtime behavior risk, and accidental cross-layer changes as the project evolves into a layered AI content operating system.

This is an analysis-only document. It does not authorize parallel runtime rewrites.

## Core rule

Parallel Codex sessions must not modify the same files or the same generated state/report artifacts at the same time.

When in doubt, treat integration files as single-owner files.

## Safe concurrent work zones

These zones can usually be worked on concurrently if branches are coordinated and each session commits only its owned files.

### Documentation and architecture

Primary paths:

- `docs/ai/`
- `iterations/`

Safe work:

- Architecture maps.
- Iteration plans.
- Report registries.
- Runtime audits.
- Parallelization planning.
- Current-state documentation.

Coordination:

- Avoid two sessions editing the same architecture file.
- Keep generated reports out of documentation-only commits.

### Retrieval evaluation

Primary paths:

- retrieval evaluation scripts
- retrieval reports
- `clean_pipeline/` evaluation-only code
- retrieval documentation

Safe work:

- Evaluation scripts.
- Retrieval report analysis.
- Non-production retrieval diagnostics.
- Documentation of retrieval contracts.

Avoid:

- Production retrieval behavior changes.
- FAISS/index mutation.
- Ingest/promote changes unless the iteration explicitly owns ingestion.

### Expert onboarding

Primary paths:

- `expert_profiles/`
- expert onboarding scripts
- onboarding reports
- knowledge source preparation scripts

Safe work:

- Onboarding inventories.
- Source quality analysis.
- Expert profile documentation.
- Non-production onboarding simulations.

Avoid:

- Shared runtime adapter changes.
- Production knowledge promotion.
- Secret or environment changes.

### Runtime identity

Primary paths:

- `runtime/identity/`
- identity-specific verification reports

Safe work:

- Identity scoring rules.
- Persona memory schema documentation.
- Drift detection analysis.
- Identity verification reports.

Avoid:

- Persistent simulation runs against shared storage unless explicitly part of the task.
- Adapter payload rewiring without coordination.

### Campaign memory

Primary paths:

- `runtime/campaign-memory/`
- campaign memory simulation/verification scripts
- campaign memory reports

Safe work:

- Topic history analysis.
- CTA history analysis.
- Narrative arc analysis.
- Campaign sequence documentation.

Avoid:

- Strategy-layer changes in the same branch unless the task owns both layers.
- Persistent simulations against the same expert while another session is running runtime previews.

### Runtime strategy

Primary paths:

- `runtime/strategy/`
- strategy simulation/verification scripts
- strategy reports

Safe work:

- Strategic brain analysis.
- Trust/authority/conversion pacing documentation.
- Strategy report improvements.

Avoid:

- Campaign memory contract changes without coordination.
- Adapter-level signal payload changes while another session edits reports or Telegram preview formatting.

### Runtime editorial

Primary paths:

- `runtime/editorial/`
- editorial simulation/verification scripts
- editorial reports

Safe work:

- Editorial director analysis.
- Format orchestration documentation.
- Audience temperature and attention-loop analysis.

Avoid:

- Adapter payload changes without coordination.
- Report generator path changes while another session works on report standardization.
- Current branch already contains uncommitted editorial changes, so new editorial work should first confirm ownership.

### Runtime execution

Primary paths:

- `runtime/execution/`
- execution sandbox verification scripts
- execution reports

Safe work:

- Sandbox diagnostics.
- Output sanitization analysis.
- Output validation analysis.

Avoid:

- OpenAI adapter behavior changes unless explicitly scoped.
- Production execution enablement.
- Telegram delivery changes.

### Runtime stabilization

Primary paths:

- `runtime/stabilization/`
- `scripts/runtime-quality-analyzer.js`
- stabilization reports

Safe work:

- Rule documentation.
- Metric taxonomy.
- Stabilization report analysis.

Avoid:

- Changing scoring semantics in parallel with generation adapter work.
- Moving quality analyzer code while execution layer work is active.

### Telegram UX

Primary paths:

- Telegram handler sections in `index.js`
- Telegram copy and callback flows
- Telegram preview formatting

Safe work:

- UX-only changes when no runtime architecture work touches `index.js`.
- Admin command copy changes when isolated.

Avoid:

- Runtime adapter integration changes.
- Retrieval logic changes.
- Report serializer changes unless the task owns runtime preview reporting.

## Dangerous overlap zones

These files and paths should have only one active owner at a time.

### Runtime integration bottlenecks

Paths:

- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `scripts/runtime-quality-analyzer.js`
- `index.js`

Why risky:

- They connect multiple layers.
- A small change can affect runtime decisions, reports, storage, Telegram admin preview, retrieval context, or generation payloads.

Rule:

- Do not edit these in parallel with layer-specific work unless the task is explicitly an integration iteration.

### Shared generated reports

Paths:

- `reports/`
- `reports/checks/`
- `reports/runtime*`
- `reports/content-*`
- `reports/cognitive-graph/`
- `reports/multi-expert/`

Why risky:

- Generated artifacts can change from command execution.
- Two sessions can overwrite each other's evidence.
- Report path renames require generator and verification updates.

Rule:

- Each session owns one report directory or report family.
- Avoid committing unrelated regenerated reports.

### Shared runtime state

Paths:

- `storage/`
- runtime memory stores under `storage/identity/`, `storage/campaign-memory/`, `storage/strategy/`, `storage/editorial/`, and cognition storage

Why risky:

- Runtime previews and simulations can persist state.
- Parallel runs for the same expert can create non-deterministic diffs.

Rule:

- Prefer `persist: false` for simulations unless persistence is the task.
- Do not commit runtime state churn unless the iteration explicitly asks for it.

### Knowledge and retrieval production assets

Paths:

- FAISS/index files
- production knowledge base files
- ingestion/promote outputs
- Supabase/RPC-related runtime assumptions

Why risky:

- Retrieval changes affect grounding and generated content quality.
- Ingest/promote operations can alter production-like behavior.

Rule:

- Retrieval evaluation can run separately, but ingestion/promote work must be isolated and explicitly authorized.

### Secrets and deploy configuration

Paths:

- `.env`
- deployment configuration
- Railway/runtime environment config
- API keys and secret-bearing files

Why risky:

- Production risk and secret exposure.

Rule:

- Never modify in Codex iteration work unless the user explicitly requests it and the safety rules allow it.

## Branch coordination rules

### Branch ownership

- Use one branch per iteration or per parallel zone.
- Use the `codex/` prefix for new Codex branches unless a project branch is already specified.
- Keep branch names descriptive, such as `codex/runtime-report-registry` or `codex/identity-memory-contracts`.

### Commit ownership

- Commit only files owned by the current task.
- Stage files explicitly.
- Do not include unrelated generated report or storage changes.
- Use small commits by task.

### Merge order

Recommended merge order for parallel work:

1. Documentation-only architecture updates.
2. Report taxonomy or registry updates.
3. Layer-local runtime changes.
4. Verification script updates.
5. Integration adapter changes.
6. Telegram UX or production entrypoint changes.

Rationale:

- Documentation and taxonomy reduce ambiguity before code movement.
- Layer-local work should land before integration wiring.
- `index.js` and adapter changes should land last because they have the highest cross-layer blast radius.

### Review gates

Before merging any runtime-related branch, verify:

- No `.env` or secret changes.
- No deployment config changes unless explicitly scoped.
- No unexpected `storage/` changes.
- No unplanned generated report churn.
- No retrieval behavior change unless explicitly scoped.
- No Telegram production behavior change unless explicitly scoped.

## Merge-risk areas

High merge-risk files:

- `index.js`
- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `scripts/runtime-quality-analyzer.js`
- runtime verification scripts under `scripts/verify-*.js`
- simulation scripts under `scripts/simulate-*.js`
- report directories under `reports/`

Medium merge-risk directories:

- `runtime/strategy/`
- `runtime/editorial/`
- `runtime/campaign-memory/`
- `runtime/identity/`
- `runtime/execution/`
- `runtime/stabilization/`

Low merge-risk directories:

- docs-only additions under `docs/ai/` when one file per task is owned.
- new iteration files under `iterations/`.

## Parallel session templates

### Safe docs session

Scope:

- `docs/ai/<new-doc>.md`

Allowed:

- Read code and reports.
- Create or update one architecture doc.
- Commit one docs-only change.

Disallowed:

- Runtime code edits.
- Report regeneration.
- Storage changes.

### Safe layer analysis session

Scope:

- one runtime layer directory and its reports.

Allowed:

- Read adapter contracts.
- Document layer inputs/outputs.
- Add layer-specific docs or reports.

Disallowed:

- Adapter rewiring.
- Telegram changes.
- Retrieval changes.

### Safe verification session

Scope:

- one verification script and its matching report directory.

Allowed:

- Improve pass/fail clarity.
- Add report header metadata.
- Run only the matching verification.

Disallowed:

- Change runtime decisions to make a check pass.
- Update unrelated reports.

## Production-risk stop conditions

Stop immediately if a parallel session detects:

- Branch conflicts in integration files.
- Need to edit `.env`, secrets, or deploy config.
- Runtime behavior would change outside the owned layer.
- Retrieval selection or index mutation would occur unexpectedly.
- Telegram production behavior might change.
- Generated storage state changes are not understood.
- Report path changes require edits in a file owned by another active session.

## Recommended next parallelization milestone

Before running true parallel Codex implementation sessions, create:

- a report registry
- a runtime contract map for adapter payloads
- a generated artifact policy
- per-layer owner notes for runtime directories

These should be documentation-first and merged before behavior-preserving code movement begins.
