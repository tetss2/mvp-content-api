# Codex Execution Rules

## Core principles

Codex is an implementation engine.

Do not make product-level architectural decisions independently.

Follow iteration files and architecture docs exactly.

## Safety rules

- Do not modify production secrets.
- Do not commit `.env` files.
- Do not modify deployment/runtime configuration unless explicitly requested.
- Do not deploy automatically.
- Do not merge branches automatically.

## Development workflow

For each task:

1. Read the relevant iteration file.
2. Read architecture docs if the task affects runtime structure.
3. Implement changes incrementally.
4. Keep commits logically isolated.
5. Avoid unrelated refactors.
6. Update docs if architecture changes.

## Commit policy

Prefer small commits.

Recommended commit scopes:

- feat:
- fix:
- refactor:
- docs:
- test:
- runtime:
- retrieval:
- onboarding:

## Runtime architecture constraints

Avoid mixing:

- retrieval logic
- runtime orchestration
- Telegram UX
- onboarding pipelines
- evaluation/reporting

Each layer should remain independently maintainable.

## Parallel session policy

Parallel Codex sessions must NOT modify the same files simultaneously.

Allowed future parallel zones:

- onboarding
- Telegram UX
- retrieval evaluation
- docs/reports
- runtime strategy

## Stop conditions

Stop and report if:

- production risk is detected
- retrieval behavior changes unexpectedly
- architecture ambiguity appears
- runtime safety checks fail
- branch conflicts appear
