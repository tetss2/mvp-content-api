# Report Registry Design

## Purpose

This document defines the future report registry structure. It is design-only and does not implement a registry, move report files, rename report files, or change report generators.

The registry should make reports easier to validate, regenerate, review, and parallelize without using report filenames as implicit architecture.

## Registry goals

- Identify the owner layer for each report.
- Distinguish generated artifacts from manually maintained architecture documents.
- Separate validation reports from runtime, preview, simulation, onboarding, retrieval, and evaluation reports.
- Make state mutation and external API expectations visible before a command runs.
- Reduce merge conflicts by assigning report families to one active owner.
- Support future machine-readable checks without changing runtime behavior.

## Report categories

### Architecture reports

Primary location:

- `docs/ai/`

Examples:

- `runtime-audit.md`
- `runtime-layer-map.md`
- `parallelization-zones.md`
- `runtime-contracts.md`

Owner layer:

- AI workflow / architecture governance.

Generated or manual:

- Manual.

Use:

- Planning, contracts, audits, roadmap, iteration definitions, and current-state memory.

### Runtime reports

Current locations:

- `reports/runtime/`
- `reports/runtime-generation/`
- `reports/runtime-execution/`
- `reports/runtime-identity/`
- `reports/runtime-campaign-memory/`
- `reports/runtime-strategy/`
- `reports/runtime-stabilization/`
- `reports/runtime-editorial/`

Future preferred location:

- `reports/runtime/<layer>/`

Owner layer:

- Runtime layer matching the report subdirectory.

Generated or manual:

- Usually generated, sometimes manually curated during architecture audits.

Use:

- Runtime simulations, layer diagnostics, quality analysis, preview summaries, and adapter-level runtime evidence.

### Validation reports

Current location:

- `reports/checks/`

Future preferred location:

- `reports/checks/<domain>/`

Owner layer:

- Verification owner for the domain being checked.

Generated or manual:

- Generated.

Use:

- Pass/fail checks, smoke tests, safety gates, and behavior-preserving migration evidence.

### Preview reports

Current location:

- produced by runtime preview/report logic in `index.js`
- may land in runtime report folders depending on command behavior

Future preferred location:

- `reports/runtime/preview/`

Owner layer:

- Telegram boundary for command entrypoint.
- Report adapter for serialization.
- Runtime adapter for payload data.

Generated or manual:

- Generated.

Use:

- Admin-only preview evidence and report payload inspection.

### Retrieval evaluation reports

Current locations:

- retrieval-specific report paths vary by script and pipeline
- knowledge index reports under `knowledge_indexes/<scenario>/reports/`

Future preferred location:

- `reports/evaluation/retrieval/` for evaluation-only outputs
- `knowledge_indexes/<scenario>/reports/` for ingestion/promotion evidence tied to index assets

Owner layer:

- Retrieval evaluation or knowledge ingestion, depending on mutation scope.

Generated or manual:

- Generated.

Use:

- Retrieval quality, grounding diagnostics, index validation, and ingestion evidence.

### Onboarding and expert-local reports

Current locations:

- `expert_profiles/<expert_id>/reports/`
- `knowledge_intake/<scenario>/reports/`

Owner layer:

- Expert onboarding.

Generated or manual:

- Mixed. Canonical expert profile files may be manual; run reports are generated.

Use:

- Author voice analysis, onboarding inventories, source processing, feedback memory, and expert-local generation evidence.

### Product and evaluation reports

Current locations:

- `reports/content-strategy/`
- `reports/content-production/`
- `reports/content-analytics/`
- `reports/cognitive-graph/`
- `reports/multi-expert/`

Future preferred location:

- `reports/evaluation/<domain>/`

Owner layer:

- Product/evaluation layer.

Generated or manual:

- Usually generated.

Use:

- Content strategy, production quality, analytics, cognitive graph, and multi-expert evaluation.

## Naming conventions

Future report filenames should use lowercase kebab-case:

- `<scope>-<purpose>-report.md`
- `<scope>-<purpose>-verification.md`
- `<scope>-<purpose>-metrics.json`

Examples:

- `adapter-generation-flow-report.md`
- `runtime-preview-summary-report.md`
- `execution-sandbox-verification.md`
- `identity-runtime-report.md`
- `campaign-memory-report.md`
- `strategy-brain-report.md`
- `editorial-director-report.md`
- `stabilization-comparison-report.md`

Avoid for new reports:

- uppercase acronyms in filenames
- duplicate filenames in unrelated directories
- timestamped canonical report names
- broad names such as `runtime_execution_report.md` without a layer path

Legacy names should remain in place until a migration iteration owns both generator and verification updates.

## Manual versus generated classification

Manual reports:

- Written or edited intentionally by humans/Codex as architecture memory.
- Should live primarily under `docs/ai/`.
- Should be committed intentionally and reviewed as source-of-truth documentation.

Generated reports:

- Produced by scripts, previews, simulations, batch runs, or verification commands.
- Should include source command and state mutation metadata when practical.
- Should not be manually edited unless explicitly reclassified or used as static evidence.

Archival generated reports:

- Timestamped or run-specific outputs.
- Safe to preserve as evidence, but not safe as canonical contracts.
- Should not be regenerated casually during unrelated tasks.

## Validation versus runtime reports

Validation reports:

- Answer whether a check passed.
- Should include command, status, scope, mutation expectations, and failure details.
- Should be used as merge evidence for behavior-preserving changes.

Runtime reports:

- Describe what runtime layers observed, recommended, or produced.
- May include scores, diagnostics, warnings, summaries, and payload excerpts.
- Should not be used as pass/fail evidence unless paired with a verification report.

Preview reports:

- Describe an admin-only runtime preview run.
- Should clearly state whether external APIs were used and whether state was mutated.
- Should not imply Telegram production UX changed.

## Proposed registry fields

A future machine-readable registry entry should contain:

```json
{
  "id": "runtime.identity.identity-runtime-report",
  "path": "reports/runtime-identity/identity_runtime_report.md",
  "futurePath": "reports/runtime/identity/identity-runtime-report.md",
  "title": "Identity Runtime Report",
  "ownerLayer": "runtime-identity",
  "reportClass": "runtime",
  "reportType": "simulation",
  "format": "markdown",
  "generated": true,
  "canonical": false,
  "sourceCommand": "node scripts/simulate-author-voice.js",
  "sourceFiles": ["scripts/simulate-author-voice.js", "runtime/identity/"],
  "stateMutation": "none|optional|writes-storage",
  "externalApiCalls": "false|true|unknown",
  "safeToRegenerate": "yes|no|scoped",
  "parallelOwner": "runtime-identity",
  "notes": "Legacy path retained until generator migration."
}
```

Field meanings:

- `id`: stable registry identifier.
- `path`: current report path.
- `futurePath`: optional target path after migration.
- `ownerLayer`: layer accountable for report semantics.
- `reportClass`: architecture, runtime, validation, preview, retrieval, onboarding, product-evaluation, or archive.
- `reportType`: audit, simulation, verification, preview, metrics, batch, inventory, or design.
- `generated`: whether a command normally produces the file.
- `canonical`: whether the file is source-of-truth documentation.
- `sourceCommand`: command that produces it, or `n/a`.
- `sourceFiles`: generator or layer files that can change report output.
- `stateMutation`: expected state behavior.
- `externalApiCalls`: whether regeneration may call external services.
- `safeToRegenerate`: whether Codex may regenerate it during normal validation.
- `parallelOwner`: report family owner for parallel work planning.

## Future registry location

Preferred first implementation:

- `docs/ai/report-registry.md`

Reason:

- Markdown is reviewable and matches the current architecture docs workflow.
- It can include a table of current reports before any code consumes it.

Possible later implementation:

- `docs/ai/report-registry.json`

Reason:

- Machine-readable checks can validate paths, headers, ownership, and mutation expectations.

Implementation order:

1. Create Markdown registry of current canonical and generated report families.
2. Add new-report conventions for future reports only.
3. Add JSON registry only after fields stabilize.
4. Add a verification script that reads the registry without changing report generators.
5. Migrate one report family at a time.

## Safe migration rules

- Do not rename or move reports until their generator and verification command are identified.
- Do not combine report moves with runtime behavior changes.
- Do not regenerate unrelated report families.
- Do not commit report churn from storage-mutating simulations unless the task explicitly owns it.
- For each migrated report family, update generator, expected path, and verification evidence in one scoped commit.

## Initial owner-layer mapping

- `reports/runtime/`: runtime adapter / legacy broad runtime.
- `reports/runtime-generation/`: runtime generation adapter.
- `reports/runtime-execution/`: runtime execution.
- `reports/runtime-identity/`: runtime identity.
- `reports/runtime-campaign-memory/`: runtime campaign memory.
- `reports/runtime-strategy/`: runtime strategy.
- `reports/runtime-stabilization/`: runtime stabilization.
- `reports/runtime-editorial/`: runtime editorial.
- `reports/checks/`: verification.
- `reports/content-strategy/`: product/evaluation content strategy.
- `reports/content-production/`: product/evaluation content production.
- `reports/content-analytics/`: product/evaluation content analytics.
- `reports/cognitive-graph/`: product/evaluation cognitive graph.
- `reports/multi-expert/`: multi-expert evaluation.
- `expert_profiles/<expert_id>/reports/`: expert onboarding and expert-local generated evidence.
- `knowledge_intake/<scenario>/reports/`: knowledge intake.
- `knowledge_indexes/<scenario>/reports/`: knowledge index promotion/rollback evidence.

## Non-goals for this iteration

- No code registry implementation.
- No report writer implementation.
- No report path migration.
- No generated report regeneration.
- No runtime, retrieval, Telegram, or deployment behavior changes.
