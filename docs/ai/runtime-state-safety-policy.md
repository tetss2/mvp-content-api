# Runtime State Safety Policy

## Purpose

This policy defines how runtime state should be handled before enabling parallel Codex sessions. It is documentation-only and does not change runtime persistence, storage paths, preview behavior, or simulation commands.

## Core policy

Runtime state writes must be explicit, scoped, and attributable. Future parallel Codex sessions should not share mutable runtime state unless a task intentionally owns that state and has a locking or namespace strategy.

## Local state risks

Local state can be changed by:

- runtime preview commands
- runtime simulations
- layer-specific memory engines
- generation runs
- onboarding runs
- ingestion and promotion scripts
- verification commands that execute runtime flows

Risk patterns:

- State changes can look like meaningful code results even when they are incidental.
- Repeated previews for the same expert can alter memory and affect later diagnostics.
- Generated state diffs can hide unrelated code or report changes.
- Parallel sessions can overwrite or interleave each other's memory updates.

Default rule:

- Architecture, contract, registry, and report-design iterations should not mutate local runtime state.

## Persistent state risks

Persistent runtime state is especially sensitive when stored under shared paths such as:

- `storage/`
- runtime memory stores used by identity, campaign memory, strategy, editorial, or cognition layers
- expert-local generation run folders under `expert_profiles/<expert_id>/reports/generation_runs/`
- generated report directories under `reports/`

Risk patterns:

- Multiple sessions writing the same expert memory create non-deterministic results.
- A simulation can persist state that later makes a verification report pass or fail for the wrong reason.
- Generated timestamped artifacts can produce merge noise.
- State generated on one machine may not be valid evidence on another.

Default rule:

- Do not commit persistent runtime state churn unless the iteration explicitly owns state fixtures, state migration, or generated evidence.

## Generated artifact risks

Generated artifacts include:

- runtime reports
- verification reports
- preview reports
- batch generation outputs
- onboarding inventories
- knowledge intake reports
- generation run summaries
- metrics JSON files

Risk patterns:

- Generated artifacts may be stale, environment-specific, timestamped, or produced with external APIs.
- Report directories can become conflict-heavy if multiple sessions regenerate broad report families.
- Generated reports may be mistaken for canonical architecture docs.

Default rule:

- Regenerate only the report family owned by the current task.
- Do not commit unrelated generated artifacts.
- Prefer documenting expected registry behavior before moving generated reports.

## Safe write zones

Safe for documentation-first iterations:

- new docs under `docs/ai/`
- new iteration plans under `iterations/`
- manually authored architecture notes

Conditionally safe with explicit ownership:

- one runtime sublayer under `runtime/<layer>/`
- one verification script and matching report family
- one expert's onboarding documentation
- one report family when generator and validation scope are known

Safe only when explicitly scoped:

- `storage/`
- `knowledge_indexes/`
- `knowledge_intake/`
- generated reports under `reports/`
- expert-local generated run artifacts

## Dangerous shared-write zones

Avoid parallel writes to:

- `storage/`
- `index.js`
- `scripts/runtime-generation-adapter.js`
- `scripts/unified-generation-runtime.js`
- `scripts/runtime-quality-analyzer.js`
- broad generated report directories under `reports/`
- `knowledge_indexes/`
- deployment config
- `.env` or secret-bearing files

Why:

- These paths either affect production behavior, connect multiple runtime layers, or store shared mutable artifacts.

## Persistence expectations

Future runtime commands should make persistence behavior visible:

- `persist: false`: command should not write runtime memory.
- `persist: true`: command intentionally writes runtime memory.
- `persist: auto`: legacy or transitional behavior; should be documented before parallel use.
- `stateNamespace`: optional namespace for run-specific or branch-specific state.
- `stateOwner`: iteration, branch, or command owner.

These fields are design targets only until implemented.

## Recommended namespace strategy

For future parallel work, stateful commands should write to a namespace that includes:

- branch name
- iteration id
- expert id
- runtime layer
- run id or timestamp

Example namespace shape:

```text
storage/runtime-runs/<branch>/<iteration>/<expert-id>/<layer>/<run-id>/
```

For long-lived memory stores, use:

```text
storage/<layer>/<expert-id>/
```

For temporary simulations, use:

```text
storage/tmp/<branch>/<run-id>/
```

Namespace rules:

- Temporary namespaces should be ignored or cleaned by explicit cleanup commands.
- Long-lived memory namespaces should not be written by architecture-only tasks.
- Branch-specific namespaces should not be promoted automatically.

## Recommended lock strategy

Before enabling parallel stateful sessions, introduce a lightweight lock concept.

Future lock metadata should include:

- owner branch
- owner task or iteration
- expert id
- state family
- created timestamp
- expected release condition

Possible lock path:

```text
storage/.locks/<state-family>-<expert-id>.json
```

Lock rules:

- A session must check for an active lock before persistent simulation or preview.
- A stale lock should require explicit user or iteration approval to clear.
- Lock files should not contain secrets.
- Lock creation should be scoped to stateful commands, not documentation-only work.

## Report-state coordination

Reports should state whether runtime state was mutated.

Future report metadata should include:

- `State mutation: false`
- `State mutation: true`
- `State namespace: <path or n/a>`
- `State owner: <branch or iteration>`

Rules:

- Verification reports should identify whether the command writes state.
- Preview reports should distinguish local/admin preview state from production Telegram behavior.
- Generated reports should not be used as canonical contracts unless classified in the report registry.

## External API coordination

External API calls can make reports non-repeatable.

Rules:

- Architecture and contract iterations should avoid commands that call external APIs.
- Report metadata should disclose external API use.
- Regeneration commands that use external APIs should be scoped and documented.
- External API results should not be used to justify behavior-preserving code movement without deterministic checks.

## Pre-flight checklist for stateful work

Before running a stateful runtime command:

1. Confirm the task explicitly owns state mutation.
2. Identify the expert id and state family.
3. Check whether another session owns the same state family.
4. Prefer `persist: false` if the task only needs diagnostics.
5. Record expected generated report paths.
6. Commit only intentional state/report changes.

## Stop conditions

Stop and report if:

- a command would mutate `storage/` unexpectedly
- generated state diffs appear after a docs-only task
- a runtime preview changes production Telegram behavior
- retrieval indexes would be mutated during runtime work
- a persistent simulation must run for the same expert as another active session
- secret or deployment configuration changes would be needed

## Current policy for Iteration 03

- No runtime state should be mutated.
- No generated reports should be regenerated.
- No report paths should be moved.
- No runtime logic should be changed.
- No retrieval, Telegram, deployment, or `.env` behavior should change.
