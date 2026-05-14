# Iteration 03 — Runtime Contracts & Ownership

## Goal

Create lightweight architecture contracts that make runtime orchestration safer, more maintainable, and ready for future parallel Codex sessions.

This iteration should NOT rewrite runtime logic.

It should create documentation and small non-invasive contract files only if safe.

---

# Context

Iteration 02 identified key risks:

- runtime orchestration is split between `runtime/`, `scripts/`, and `index.js`
- report naming and directory structure are inconsistent
- runtime preview/report logic remains close to Telegram handlers
- persistent local runtime state may create future parallel execution conflicts
- high-risk integration files include `index.js`, `scripts/runtime-generation-adapter.js`, and `scripts/unified-generation-runtime.js`

---

# Tasks

## Task 1 — Runtime contract map

Create:

`docs/ai/runtime-contracts.md`

Document expected contracts for:

- generation adapter
- retrieval adapter
- identity adapter
- campaign memory adapter
- strategic brain adapter
- editorial director adapter
- report adapter
- Telegram boundary layer

For each contract, document:

- responsibility
- input ownership
- output ownership
- forbidden responsibilities
- known risk areas

---

## Task 2 — Runtime ownership map

Create:

`docs/ai/runtime-ownership-map.md`

Document ownership boundaries for:

- `index.js`
- `runtime/`
- `scripts/`
- `reports/`
- `storage/`
- `knowledge_indexes/`
- `knowledge_intake/`
- `expert_profiles/`

Include:

- what each zone owns
- what it must not own
- future refactor pressure
- parallel-safety level

---

## Task 3 — Report registry design

Create:

`docs/ai/report-registry-design.md`

Define a future report registry structure.

Document:

- report categories
- naming conventions
- owner layer
- generated vs manual reports
- validation reports vs runtime reports
- future machine-readable registry idea

Do NOT implement the registry in code unless it is obviously safe and minimal.

---

## Task 4 — Runtime state safety policy

Create:

`docs/ai/runtime-state-safety-policy.md`

Document how runtime state should be handled before enabling parallel Codex sessions.

Include:

- local state risks
- persistent state risks
- generated artifact risks
- safe write zones
- dangerous shared-write zones
- recommended lock/namespace strategy for future work

---

## Task 5 — Next implementation candidates

Create:

`docs/ai/next-implementation-candidates.md`

List 5-10 small implementation tasks that are safe candidates for future Codex iterations.

For each candidate include:

- purpose
- target files
- risk level
- validation command if available
- whether it can run in parallel with other work

---

# Constraints

- Do not deploy.
- Do not modify `.env`.
- Do not modify production secrets.
- Do not rewrite runtime logic.
- Do not perform large refactors.
- Do not change Telegram user-facing behavior.
- Do not change retrieval behavior.

This iteration is still architecture-first, but should produce practical contracts that make future code changes faster and safer.

---

# Definition of done

Iteration is complete when these files exist:

- `docs/ai/runtime-contracts.md`
- `docs/ai/runtime-ownership-map.md`
- `docs/ai/report-registry-design.md`
- `docs/ai/runtime-state-safety-policy.md`
- `docs/ai/next-implementation-candidates.md`

Final report must include:

- completed tasks
- commits created
- files changed
- highest-risk architecture zones
- recommended iteration 04
