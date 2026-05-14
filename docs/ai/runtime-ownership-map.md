# Runtime Ownership Map

## Purpose

This document maps repository zones by ownership, forbidden responsibilities, refactor pressure, and parallel-safety level. It is intended to help future Codex sessions avoid accidental runtime, retrieval, Telegram, report, or state coupling.

Safety levels:

- `low`: safe for isolated docs or analysis work when files are not shared.
- `medium`: safe with clear file ownership and validation.
- `high`: integration-sensitive; use one active owner.
- `critical`: production-sensitive or shared mutable state; avoid unless explicitly scoped.

## `index.js`

Parallel-safety level: `critical`

Owns:

- Telegram polling runtime.
- Telegram command handlers and callback flows.
- User state for active chats.
- Delivery format selection and media delivery.
- Admin runtime preview entrypoint.
- Current runtime preview report serialization.

Must not own:

- Runtime sublayer algorithms.
- Retrieval ranking or index behavior.
- Runtime memory store internals.
- Report taxonomy decisions beyond current preview/report integration.
- Deployment configuration or secrets.

Future refactor pressure:

- Move admin runtime preview/report serialization behind a runtime-preview/report adapter after contracts and report registry exist.
- Keep production Telegram UX changes separate from runtime architecture work.

Parallel notes:

- Do not edit in parallel with `scripts/runtime-generation-adapter.js` or report serializer work.
- Any change here should be assumed production-sensitive unless proven admin-only and behavior-preserving.

## `runtime/`

Parallel-safety level: `medium`

Owns:

- Layer-local runtime behavior for execution, identity, campaign memory, strategy, editorial direction, and stabilization.
- Layer-owned state APIs and diagnostics.
- Layer-specific scoring, recommendations, warnings, validation, and memory updates.

Must not own:

- Telegram handlers or user-facing UX flows.
- Retrieval index mutation.
- Knowledge ingestion or promotion.
- Cross-layer report taxonomy.
- Deployment or production config.

Future refactor pressure:

- Add stable layer-level entrypoints only after adapter payload contracts are documented.
- Keep layer internals separate from orchestration bridge code.
- Reduce runtime-to-`scripts/` imports over time, especially around stabilization and quality analysis.

Parallel notes:

- A single runtime subdirectory can usually be worked on safely if adapter payloads are not changed.
- Avoid persistent simulations for the same expert during parallel sessions.
- Treat changes that alter adapter inputs/outputs as integration work, not layer-local work.

## `scripts/`

Parallel-safety level: `high`

Owns:

- Runtime prototypes and orchestration bridges.
- Verification and simulation commands.
- Knowledge ingestion utilities.
- Retrieval, generation, report, and onboarding helper scripts.
- Adapter utilities, including mock and OpenAI generation adapters.

Must not own:

- Long-term runtime layer algorithms that should live under `runtime/`.
- Telegram UX behavior.
- Report taxonomy as implicit path strings without registry documentation.
- Production configuration or secrets.

Future refactor pressure:

- Classify scripts into stable interfaces, prototypes, verification commands, simulations, ingestion tools, and one-off utilities.
- Move stable runtime responsibilities out of broad orchestration prototypes in small behavior-preserving steps.
- Keep verification scripts aligned with the report registry once it exists.

Parallel notes:

- `scripts/runtime-generation-adapter.js`, `scripts/unified-generation-runtime.js`, and `scripts/runtime-quality-analyzer.js` are single-owner integration files.
- Verification-only script edits should own one check family at a time.
- Ingestion/promote scripts should not run during runtime architecture iterations unless explicitly scoped.

## `reports/`

Parallel-safety level: `high`

Owns:

- Generated and manually maintained report artifacts.
- Runtime, verification, content, cognitive graph, multi-expert, and evaluation summaries.
- Evidence produced by simulations, checks, preview runs, and batch workflows.

Must not own:

- Runtime behavior.
- Runtime contract source of truth before registry classification.
- Knowledge or retrieval state.
- Telegram UX decisions.

Future refactor pressure:

- Introduce a report registry before renaming or moving generated report families.
- Classify reports as manual, generated, archival, verification, runtime, preview, evaluation, or architecture.
- Standardize future report headers and filenames without rewriting all existing reports at once.

Parallel notes:

- One session should own one report family or directory.
- Avoid committing regenerated reports from unrelated commands.
- Generated report churn should be treated as evidence only when the task explicitly asks for it.

## `storage/`

Parallel-safety level: `critical`

Owns:

- Local runtime memory state.
- Identity, campaign memory, strategy, editorial, cognition, and other stateful runtime artifacts.
- Preview and simulation side effects when persistence is enabled.

Must not own:

- Canonical architecture documentation.
- Report registry decisions.
- Production knowledge source of truth.
- Secrets or deployment config.

Future refactor pressure:

- Make preview/simulation persistence explicit.
- Introduce per-run or per-branch state namespaces for future parallel sessions.
- Add lock or ownership metadata before stateful parallel work.

Parallel notes:

- Do not commit storage churn unless the iteration explicitly owns state migration or fixture updates.
- Do not run persistent simulations for the same expert in parallel.
- Prefer `persist: false` for architecture, report, and verification-only iterations.

## `knowledge_indexes/`

Parallel-safety level: `critical`

Owns:

- Promoted or production-like knowledge indexes.
- Knowledge index manifests and ingestion reports tied to usable retrieval assets.
- Retrieval data that can affect grounding behavior.

Must not own:

- Runtime orchestration decisions.
- Telegram UX.
- Runtime memory state.
- Report taxonomy.

Future refactor pressure:

- Keep index promotion, rollback, and validation flows isolated from runtime architecture work.
- Ensure retrieval evaluation is distinct from index mutation.

Parallel notes:

- Do not mutate indexes during runtime contract or report work.
- Retrieval evaluation can read these assets, but ingestion/promote operations need an explicitly scoped iteration.

## `knowledge_intake/`

Parallel-safety level: `medium`

Owns:

- Staged source processing artifacts.
- Cleaning and processing reports for knowledge intake.
- Pre-promotion ingestion outputs.

Must not own:

- Runtime generation decisions.
- Production Telegram behavior.
- Runtime memory state.
- Final promoted index behavior without promotion workflow approval.

Future refactor pressure:

- Keep intake state clearly separated from promoted index state.
- Document generated artifacts and safe cleanup rules before parallel onboarding sessions expand.

Parallel notes:

- Safe for onboarding/intake work when isolated by expert or intake batch.
- Avoid mixing intake changes with runtime adapter or retrieval ranking changes.

## `expert_profiles/`

Parallel-safety level: `medium`

Owns:

- Expert-specific author voice, profile, onboarding outputs, reports, and generation run artifacts.
- Expert-local evidence for voice, feedback, onboarding, and generation runs.

Must not own:

- Shared runtime layer algorithms.
- Global report taxonomy.
- Production deployment configuration.
- Retrieval index promotion unless the onboarding iteration explicitly owns it.

Future refactor pressure:

- Separate canonical expert profile data from generated reports and run artifacts.
- Add clearer generated/manual classification for expert-local files.
- Prepare multi-expert-safe namespaces for onboarding and runtime previews.

Parallel notes:

- Safe when sessions own separate experts or separate report families.
- For the same expert, coordinate writes to reports and generated run folders.
- Avoid committing incidental generation-run artifacts from unrelated validation.

## Cross-zone ownership rules

- Runtime behavior changes belong under `runtime/` or a scoped integration script, not `index.js`.
- Telegram behavior changes belong in `index.js` and should not be mixed with runtime contract work.
- Report path changes require report registry awareness and generator updates.
- Retrieval behavior changes require explicit retrieval ownership and validation.
- Storage mutations require explicit state ownership and parallel-safety justification.
- Knowledge promotion requires an ingestion/promotion iteration, not runtime architecture work.

## Highest-risk zones

- `index.js`
- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `scripts/runtime-quality-analyzer.js`
- `storage/`
- `knowledge_indexes/`
- generated report directories under `reports/`

## Safe architecture-first zones

- New docs under `docs/ai/`.
- New iteration files under `iterations/`.
- Layer-specific documentation that does not change runtime code.
- Report registry design documents before registry implementation.
