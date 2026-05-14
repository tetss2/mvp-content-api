# Report Standardization Plan

## Goal

Create a stable reporting taxonomy before runtime, onboarding, retrieval, and future parallel Codex work expand further.

This document is a plan only. It does not change report generators or runtime behavior.

## Current report landscape

Reports currently exist across several categories:

- Runtime reports: `reports/runtime/`
- Runtime generation reports: `reports/runtime-generation/`
- Runtime execution reports: `reports/runtime-execution/`
- Runtime identity reports: `reports/runtime-identity/`
- Runtime campaign memory reports: `reports/runtime-campaign-memory/`
- Runtime strategy reports: `reports/runtime-strategy/`
- Runtime stabilization reports: `reports/runtime-stabilization/`
- Runtime editorial reports: `reports/runtime-editorial/`
- Verification reports: `reports/checks/`
- Content strategy reports: `reports/content-strategy/`
- Content production reports: `reports/content-production/`
- Content analytics reports: `reports/content-analytics/`
- Cognitive graph reports: `reports/cognitive-graph/`
- Multi-expert reports: `reports/multi-expert/`
- Knowledge cleaning/classification reports at `reports/` root and `reports/sorting_logs/`
- Expert-specific reports under `expert_profiles/<expert_id>/reports/`
- Feedback reports under `feedback_reports/`

The current structure is useful but not yet standardized enough for safe parallel automation.

## Current report generators

Primary report-producing files include:

- `scripts/verify-runtime-safety-gate.js`
- `scripts/verify-runtime-preview-mode.js`
- `scripts/verify-runtime-execution-sandbox.js`
- `scripts/verify-runtime-identity.js`
- `scripts/verify-campaign-memory.js`
- `scripts/verify-strategic-brain.js`
- `scripts/verify-runtime-stabilization.js`
- `scripts/verify-editorial-director.js`
- `scripts/simulate-runtime-generation-flow.js`
- `scripts/simulate-runtime-quality-stabilization.js`
- `scripts/simulate-runtime-generation-flow.js`
- `scripts/simulate-campaign-memory.js`
- `scripts/simulate-strategic-brain.js`
- `scripts/simulate-editorial-director.js`
- `scripts/simulate-content-strategy.js`
- `scripts/simulate-content-production.js`
- `scripts/simulate-content-analytics.js`
- `scripts/simulate-cognitive-graph.js`
- `scripts/simulate-multi-expert-runtime.js`
- `scripts/generate-dinara-batch-report.js`
- runtime preview report functions in `index.js`

## Naming inconsistencies

### Directory naming

Current runtime-related directories mix broad and narrow categories:

- `reports/runtime/`
- `reports/runtime-generation/`
- `reports/runtime-execution/`
- `reports/runtime-identity/`
- `reports/runtime-campaign-memory/`
- `reports/runtime-strategy/`
- `reports/runtime-stabilization/`
- `reports/runtime-editorial/`

Problem:

- `reports/runtime/` overlaps with all `reports/runtime-*` directories.
- `reports/runtime-generation/` can mean prompt package generation, final content generation, or adapter-level generation.
- `reports/checks/` mixes verification outputs for multiple layers.

### File naming

Current files use mostly snake_case, but there are exceptions:

- `CTA_pacing_report.md`
- `CTA_memory_report.md`
- `runtime_adapter_report.md`
- `runtime_execution_report.md` in both `reports/runtime/` and `reports/runtime-execution/`
- `narrative_continuity_report.md` in both `reports/runtime/` and `reports/content-strategy/`
- `cta_pacing_report.md` in both `reports/runtime-stabilization/` and `reports/runtime/` with different capitalization in one case

Problem:

- Duplicate names make search results ambiguous.
- Case differences create unnecessary cross-platform risk.
- A report name alone does not always reveal whether it is a simulation, verification, preview, or generated artifact.

### Generated versus canonical reports

Some reports appear to be stable documentation-like outputs. Others are generated artifacts from simulations or checks.

Problem:

- Generated reports are stored beside canonical architecture reports.
- Future Codex sessions may edit generated artifacts manually or commit regenerated report churn.

## Duplicated reports and overlapping concepts

### Runtime execution

Potential overlap:

- `reports/runtime/runtime_execution_report.md`
- `reports/runtime-execution/runtime_execution_report.md`
- `reports/runtime-execution/runtime_execution_quality_report.md`
- `reports/checks/runtime_execution_sandbox_verification_report.md`

Suggested distinction:

- Runtime execution summary.
- Execution quality metrics.
- Sandbox risk report.
- Verification check result.

### Runtime quality and stabilization

Potential overlap:

- `reports/runtime/runtime_quality_report.md`
- `reports/runtime-stabilization/runtime_quality_improvement_report.md`
- `reports/runtime-stabilization/stabilization_comparison_report.md`
- `reports/runtime-stabilization/stabilization_metrics.json`
- `reports/runtime-generation/runtime_generation_validation_report.md`

Suggested distinction:

- Prompt/package quality.
- Output quality.
- Stabilization before/after delta.
- Verification result.

### Narrative and CTA reports

Potential overlap:

- `reports/runtime/narrative_continuity_report.md`
- `reports/content-strategy/narrative_continuity_report.md`
- `reports/runtime-campaign-memory/narrative_arc_report.md`
- `reports/runtime-strategy/narrative_loop_report.md`
- `reports/cognitive-graph/narrative_memory_report.md`
- `reports/runtime/CTA_pacing_report.md`
- `reports/runtime-stabilization/cta_pacing_report.md`
- `reports/content-strategy/cta_distribution_report.md`
- `reports/cognitive-graph/CTA_memory_report.md`
- `reports/runtime-campaign-memory/cta_fatigue_report.md`

Suggested distinction:

- Continuity: generated content coherence.
- Arc: campaign memory progression.
- Loop: strategic audience movement.
- Memory: cognition graph/history.
- Pacing: runtime decision pressure.
- Distribution: content strategy analytics.
- Fatigue: campaign memory risk.

## Missing report categories

The following categories would help future maintainability:

- `runtime-preview`: admin-only Telegram preview runs from `index.js`.
- `runtime-contracts`: payload shape, schema versions, and adapter contract reports.
- `runtime-state`: state mutation/persistence reports for cognition, identity, campaign, strategy, and editorial stores.
- `runtime-boundaries`: checks that confirm no Telegram mutation, no deploy config mutation, no retrieval index mutation, and no secret changes.
- `retrieval-evaluation`: retrieval quality and grounding reports separate from runtime generation.
- `onboarding`: expert onboarding reports separate from runtime.
- `generated-artifacts`: optional location or naming marker for reports produced by simulation commands.

## Proposed report taxonomy

Use four high-level report classes:

### 1. Architecture docs

Location:

- `docs/ai/`

Purpose:

- Human-authored architecture, state, roadmap, audit, layer map, and planning documents.

Examples:

- `runtime-audit.md`
- `runtime-layer-map.md`
- `report-standardization-plan.md`
- `parallelization-zones.md`

Rule:

- These are manually maintained and should be committed intentionally.

### 2. Runtime reports

Location:

- `reports/runtime/<layer>/`

Proposed layer folders:

- `adapter/`
- `preview/`
- `execution/`
- `identity/`
- `campaign-memory/`
- `strategy/`
- `editorial/`
- `stabilization/`
- `state/`
- `contracts/`

Purpose:

- Runtime-specific simulation, preview, quality, and layer reports.

Rule:

- Prefer layer-specific folders over broad `reports/runtime/` and many sibling `reports/runtime-*` folders.

### 3. Verification reports

Location:

- `reports/checks/<domain>/`

Proposed domains:

- `runtime/`
- `retrieval/`
- `onboarding/`
- `telegram/`
- `reports/`

Purpose:

- Pass/fail validation outputs, safety gate summaries, and smoke check evidence.

Rule:

- Verification reports should include status, command, timestamp, scope, and changed-state expectations.

### 4. Product/evaluation reports

Location:

- `reports/evaluation/<domain>/`

Proposed domains:

- `content-strategy/`
- `content-production/`
- `content-analytics/`
- `cognitive-graph/`
- `retrieval/`
- `multi-expert/`

Purpose:

- Product-facing or evaluation-facing output, not runtime orchestration internals.

Rule:

- These reports should not be used as runtime contract definitions.

## Proposed file naming convention

Use lowercase kebab-case for future report filenames:

- `<scope>-<purpose>-report.md`
- `<scope>-<purpose>-report.json`
- `<scope>-<purpose>-metrics.json`
- `<scope>-<purpose>-verification.md`

Examples:

- `adapter-generation-flow-report.md`
- `execution-sandbox-verification.md`
- `identity-runtime-report.md`
- `campaign-memory-report.md`
- `strategy-brain-report.md`
- `editorial-director-report.md`
- `stabilization-comparison-report.md`
- `runtime-preview-summary-report.md`

Avoid:

- uppercase acronyms in filenames
- duplicate filenames in different directories unless the directory is part of a documented taxonomy
- mixing generated timestamps and canonical names unless the report is explicitly archival

## Proposed required report header

Future Markdown reports should start with:

```md
# <Human Report Title>

- Generated: <ISO timestamp>
- Scope: <runtime|retrieval|onboarding|telegram|evaluation|architecture>
- Layer: <adapter|execution|identity|campaign-memory|strategy|editorial|stabilization|n/a>
- Report type: <simulation|verification|preview|audit|metrics|batch>
- Source command: `<command or n/a>`
- Production mutation: `false`
- External API calls: `false|true|n/a`
- State mutation: `false|true|n/a`
- Status: `pass|pass_with_warnings|fail|n/a`
```

JSON reports should include the same fields as top-level keys where practical.

## Standardization phases

### Phase 1: Document and freeze names

Do now or next iteration:

- Document current report paths.
- Mark generated reports versus canonical docs.
- Avoid renaming files until generators are mapped.

### Phase 2: Add report registry

Future file:

- `docs/ai/report-registry.md`

Contents:

- report path
- owner script
- layer
- report type
- generated or manual
- safe to regenerate
- expected state mutation

### Phase 3: Standardize new reports only

Before moving old reports:

- Require new reports to use the standard header.
- Require new report paths to follow the taxonomy.
- Avoid touching existing report generators unless a task owns that layer.

### Phase 4: Move generated report paths safely

Only after registry exists:

- Move one report family at a time.
- Update the generator script and verification script in the same commit.
- Run the related verification command.
- Do not mix report moves with runtime logic changes.

### Phase 5: Introduce shared report utilities

Only after naming is stable:

- Add a shared report writer for headers and path creation.
- Keep it formatting-only.
- Do not let report utilities make runtime decisions.

## Parallel-safety rules for reports

- One Codex session should own a report directory at a time.
- Avoid committing regenerated reports from unrelated commands.
- Do not manually edit generated report artifacts unless the task is documentation-only and the file is classified as manual.
- Do not rename report files while another session is editing verification scripts.
- Generated stateful runtime previews should not run in parallel against the same expert without isolated storage.

## Recommended next iteration

Create a report registry before changing generator code. The registry should identify which reports are canonical and which are generated artifacts, then assign ownership by layer.
