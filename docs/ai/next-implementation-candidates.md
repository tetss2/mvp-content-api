# Next Implementation Candidates

## Purpose

This document lists small implementation candidates for future Codex iterations. These are intentionally scoped to reduce production risk, clarify runtime ownership, and prepare for future parallel work.

Risk levels:

- `low`: docs or read-only checks; unlikely to affect runtime behavior.
- `medium`: small helper or verification code; requires focused validation.
- `high`: integration-sensitive; should be isolated and reviewed carefully.

## Candidate 1: Create manual report registry

Purpose:

- Create the first human-readable registry of current report families, owner layers, generated/manual classification, and safe regeneration expectations.

Target files:

- `docs/ai/report-registry.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/report-registry.md`

Parallel-safe:

- Yes, if no other session edits report architecture docs.

Notes:

- Do not move or regenerate reports in the same iteration.

## Candidate 2: Add report header checklist

Purpose:

- Document the required header for future Markdown reports and define which fields are mandatory for validation reports versus runtime reports.

Target files:

- `docs/ai/report-header-policy.md`
- optionally update `docs/ai/report-registry-design.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/report-header-policy.md docs/ai/report-registry-design.md`

Parallel-safe:

- Yes, if report registry work is not editing the same files.

Notes:

- Keep this as policy only; do not update report generators yet.

## Candidate 3: Add runtime payload schema notes

Purpose:

- Define documentation-only payload shapes for adapter outputs before introducing code schemas.

Target files:

- `docs/ai/runtime-payload-schema-notes.md`
- optionally update `docs/ai/runtime-contracts.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/runtime-payload-schema-notes.md docs/ai/runtime-contracts.md`

Parallel-safe:

- Yes, if no other session edits runtime contracts.

Notes:

- Focus on keys, owners, and consumers; avoid changing `scripts/runtime-generation-adapter.js`.

## Candidate 4: Classify scripts by ownership

Purpose:

- Create a script ownership inventory that separates runtime prototypes, verification scripts, simulation scripts, ingestion tools, retrieval tools, and adapters.

Target files:

- `docs/ai/script-ownership-inventory.md`

Risk level:

- `low`

Validation command:

- `rg --files scripts`

Parallel-safe:

- Yes, documentation-only.

Notes:

- This prepares future safe migration from `scripts/` into stable runtime interfaces.

## Candidate 5: Add state mutation audit checklist

Purpose:

- Create a checklist for reviewing whether commands write to `storage/`, generated reports, knowledge indexes, or expert-local run artifacts.

Target files:

- `docs/ai/state-mutation-audit-checklist.md`
- optionally update `docs/ai/runtime-state-safety-policy.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/state-mutation-audit-checklist.md docs/ai/runtime-state-safety-policy.md`

Parallel-safe:

- Yes, if state policy is not being edited by another session.

Notes:

- Do not add lock files or change runtime commands yet.

## Candidate 6: Add verification command registry design

Purpose:

- Document available verification commands, expected report outputs, state mutation expectations, and external API expectations.

Target files:

- `docs/ai/verification-command-registry-design.md`

Risk level:

- `low`

Validation command:

- `rg --files scripts | rg "verify-"`

Parallel-safe:

- Yes, documentation-only.

Notes:

- This should precede any verification script changes.

## Candidate 7: Introduce non-enforcing schema fixtures

Purpose:

- Add tiny JSON schema examples for report registry and runtime payload metadata without wiring them into runtime code.

Target files:

- `docs/ai/schemas/report-registry-entry.example.json`
- `docs/ai/schemas/runtime-payload-metadata.example.json`

Risk level:

- `medium`

Validation command:

- `node -e "JSON.parse(require('fs').readFileSync('docs/ai/schemas/report-registry-entry.example.json','utf8')); JSON.parse(require('fs').readFileSync('docs/ai/schemas/runtime-payload-metadata.example.json','utf8'))"`

Parallel-safe:

- Yes, if schema examples are docs-only and not imported by code.

Notes:

- Keep schemas example-only until a later implementation iteration approves enforcement.

## Candidate 8: Add generated artifact ignore/review policy

Purpose:

- Document which generated artifacts are safe to commit, which require explicit ownership, and which should normally remain uncommitted.

Target files:

- `docs/ai/generated-artifact-policy.md`
- optionally update `docs/ai/parallelization-zones.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/generated-artifact-policy.md docs/ai/parallelization-zones.md`

Parallel-safe:

- Yes, if parallelization docs are not being edited elsewhere.

Notes:

- Do not change `.gitignore` until generated artifact policy is reviewed.

## Candidate 9: Add report registry linter plan

Purpose:

- Design a future read-only script that validates report registry paths and header fields without changing reports.

Target files:

- `docs/ai/report-registry-linter-plan.md`

Risk level:

- `low`

Validation command:

- `git diff -- docs/ai/report-registry-linter-plan.md`

Parallel-safe:

- Yes, documentation-only.

Notes:

- Implementation should be a later separate iteration.

## Candidate 10: Add runtime preview extraction plan

Purpose:

- Plan the smallest future behavior-preserving extraction of admin preview report serialization out of `index.js`.

Target files:

- `docs/ai/runtime-preview-extraction-plan.md`

Risk level:

- `low` for planning, `high` for implementation.

Validation command:

- `git diff -- docs/ai/runtime-preview-extraction-plan.md`

Parallel-safe:

- Planning is parallel-safe if no other session edits runtime contracts.
- Implementation is not parallel-safe with Telegram UX or adapter work.

Notes:

- Keep as a plan only until report registry and payload schema notes exist.

## Recommended ordering

1. Create manual report registry.
2. Add runtime payload schema notes.
3. Add script ownership inventory.
4. Add state mutation audit checklist.
5. Add verification command registry design.
6. Add non-enforcing schema fixtures.
7. Plan runtime preview extraction.

This order keeps documentation and ownership stable before any helper structures or code checks are introduced.
