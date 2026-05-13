# Expert Onboarding Intelligence Architecture Snapshot

Snapshot date: 2026-05-12

Current expert: Dinara Kachaeva (`dinara`)

## Purpose

The expert onboarding intelligence layer exists to make source quality explicit before knowledge is used for generation, retrieval weighting, or future expert-specific datasets.

Plain RAG ingestion usually treats source files as roughly equal once they are chunked and embedded. That is not enough for an expert content platform. Dinara's corpus contains different kinds of material: high-confidence approved educational sources, current production references, possible questionnaires, raw style samples, future website or Telegram imports, and administrative or low-signal text. These should not carry the same trust, generation safety, or retrieval weight.

This layer adds metadata and reporting around sources without changing the live bot. It classifies each prepared source, assigns confidence, estimates expert signal strength, detects content kind, and flags noisy material. The output is a documented, auditable metadata layer that can later drive retrieval scoring.

## Current Pipeline

```text
raw/existing source files
  -> source discovery
  -> cleaned/prepared source references
  -> metadata sidecars
  -> source classification
  -> confidence scoring
  -> content taxonomy
  -> safety/noise detection
  -> onboarding reports
  -> future retrieval weighting
```

Current flow:

1. Source files are discovered from expert-local folders and existing prepared knowledge intake folders.
2. Text files are normalized when they come from raw expert folders.
3. Existing prepared files are referenced in place to avoid duplicating current knowledge intake files.
4. A metadata sidecar is written for every prepared or referenced source.
5. The intelligence layer classifies source type from folder, path, filename, and lightweight content hints.
6. Confidence and `expert_signal_score` are assigned using deterministic heuristics.
7. Content kind is inferred from filename, length, structure, and phrase patterns.
8. Questionnaires, low-signal files, duplicate boilerplate, and admin content are flagged as warnings.
9. Source prepare and taxonomy summary reports describe the corpus quality profile.
10. Retrieval weighting is recommended in reports only. It is not applied yet.

## Key Files

- `scripts/expert-onboarding-intelligence.js`: reusable classification, confidence scoring, taxonomy, safety detection, taxonomy summary rendering, and suggested retrieval weights.
- `scripts/expert-retrieval-intelligence.js`: reusable metadata-aware retrieval scoring and reranking utilities.
- `scripts/simulate-retrieval-ranking.js`: local-only simulation tool that loads metadata sidecars, applies reranking, and writes retrieval scoring reports.
- `scripts/expert-context-assembly.js`: reusable local context assembly utility that turns scored candidates into curated context packs.
- `scripts/simulate-context-assembly.js`: local-only simulation tool that reranks Dinara sidecars, assembles per-intent context packs, and writes context assembly reports.
- `scripts/expert-knowledge-source-prepare.js`: source discovery and metadata generation entry point for Dinara onboarding.
- `scripts/generate-dinara-batch-report.js`: batch onboarding report generator; includes latest provenance and taxonomy summary in expert context.
- `expert_profiles/dinara/knowledge_sources/cleaned/_metadata/`: metadata sidecars for prepared or referenced sources.
- `expert_profiles/dinara/reports/onboarding/`: inventory, source prepare, and taxonomy summary reports.
- `knowledge_intake/sexologist/`: current local prepared source folders, including approved and confidence-bucketed sources.
- `knowledge_indexes/sexologist/production/current/docstore.jsonl`: read-only production docstore reference used to identify current production source names.

## Metadata Schema

Metadata sidecars preserve existing fields and add onboarding intelligence fields.

Current fields:

- `expert_id`: expert identifier, currently `dinara`.
- `source_type`: classified source type.
- `confidence_level`: coarse trust group: `high`, `medium`, or `low`.
- `expert_signal_score`: numeric heuristic signal score from `0.0` to `1.0`.
- `content_kind`: inferred content taxonomy label.
- `is_generation_safe`: whether the file appears safe to use directly for generation later.
- `warnings`: warning strings such as `probable_questionnaire`, `low_signal`, `duplicate_boilerplate`, or `admin_content`.
- `source_path`: original local source path.
- `cleaned_path`: normalized output path or referenced existing prepared file path.
- `original_url`: reserved provenance field for future imported web sources.
- `title`: reserved title field.
- `detected_date`: reserved source date field.
- `cleaned_at`: timestamp for the prepare run.
- `clean_version`: text normalization version.
- `content_sha256`: hash of cleaned text.
- `char_count`: cleaned character count.
- `word_count`: cleaned word count.
- `status`: preparation status, currently `prepared`.

Additional implementation detail:

- `classification`: diagnostic object with rule provenance and suggested retrieval weight.

## Taxonomy

### Source Types

- `website_vercel`: expert website or landing page text imported from the Vercel-hosted site.
- `b17_article`: expert-authored or expert-associated B17 article.
- `telegram_channel`: Telegram channel post or export content.
- `raw_sample`: raw author voice or style sample.
- `questionnaire`: questionnaire, intake form, survey, scale, or assessment-like source.
- `approved_dataset`: approved knowledge intake source without high/medium confidence bucket.
- `approved_high_confidence`: curated high-confidence source from approved intake.
- `approved_medium_confidence`: curated medium-confidence source from approved intake.
- `unknown`: fallback when source type cannot be inferred.

Current validation produced `unknown: 0`, which means all prepared files received a concrete classification.

### Confidence Levels

- `high`: suitable as a strong source of expert grounding or future retrieval priority.
- `medium`: useful but should carry less retrieval influence than high-confidence sources.
- `low`: weak, noisy, form-like, or not directly suitable for generation.

### Content Kinds

- `educational`: explanatory, conceptual, instructional, or psychoeducational material.
- `storytelling`: narrative or first-person story-like material.
- `therapeutic_case`: clinical, session, client, or case-oriented material.
- `sales`: offer, course, consultation, price, or conversion-oriented material.
- `faq`: question-and-answer or common-question structure.
- `short_hook`: short social hook, brief post, or compact prompt-like content.
- `questionnaire`: form, intake, assessment, scale, or survey content.
- `unknown`: fallback when content kind cannot be inferred.

## Safety And Noise Logic

`is_generation_safe` means the file does not currently show strong signs of being low-value or unsafe to use directly as generation grounding. It is a metadata flag only. It does not delete, move, exclude, ingest, or promote anything.

Low-signal files are sources with very little usable text or structure that is unlikely to improve content generation. They may still be useful for audit, source tracing, or manual review.

Questionnaires, intake forms, consent forms, administrative text, and duplicate boilerplate should not directly influence generation because they can pull the model toward form language, private intake structure, legal/admin phrasing, or repetitive non-authorial text. They can still be important to preserve as part of the expert corpus, especially for future assessment-specific workflows.

Files are not deleted or moved automatically because classification is heuristic and should remain reversible. The layer reports risk and quality signals first. Filtering and weighting should be explicit follow-up decisions.

## Current Validation Snapshot

Recent local validation:

- Files scanned: 22
- Files prepared: 20
- Metadata JSON files created: 20

Source types:

- `approved_high_confidence`: 16
- `approved_dataset`: 2
- `questionnaire`: 2
- `unknown`: 0

Confidence:

- `high`: 18
- `low`: 2

Content kinds:

- `educational`: 7
- `faq`: 5
- `therapeutic_case`: 3
- `storytelling`: 2
- `questionnaire`: 1
- `sales`: 1
- `short_hook`: 1

Generation safety:

- Safe: 19
- Unsafe: 1

## Metadata-Aware Retrieval Scoring Layer

The retrieval scoring layer is now available as local reusable code, but it is not wired into the live Telegram runtime. It is designed as a post-retrieval reranker: semantic or vector retrieval still produces the initial candidate list, then metadata intelligence adjusts ranking before future generation code consumes it.

Current local flow:

```text
retrieved documents with base scores
  -> normalize source metadata
  -> apply source_type adjustment
  -> apply confidence_level adjustment
  -> apply expert_signal_score adjustment
  -> apply generation safety and warning penalties
  -> optionally apply generation_intent/content_kind match
  -> sort by final_score
  -> return explainable retrieval traces
```

The implementation lives in `scripts/expert-retrieval-intelligence.js` and exposes:

- `scoreRetrievalItem(item, options)`: score one retrieved document.
- `rerankRetrievalItems(items, options)`: score and sort a retrieved candidate list.
- scoring constants for source type, confidence, safety, warnings, content kinds, and generation intents.

The API accepts future intent routing without requiring production generation changes:

```json
{
  "generation_intent": "educational_post"
}
```

Supported prepared intents:

- `educational_post`
- `storytelling`
- `faq_answer`
- `sales_post`
- `short_hook`
- `therapeutic_case`

### Explainability Traces

Every scored item receives a `retrieval_trace` object:

```json
{
  "base_score": 0.81,
  "final_score": 1.34,
  "boosts": [
    "approved_high_confidence:+1",
    "confidence_high:+0.25",
    "educational_match:+0.2"
  ],
  "penalties": [],
  "generation_safe": true,
  "generation_intent": "educational_post",
  "content_kind": "educational",
  "source_type": "approved_high_confidence",
  "confidence_level": "high"
}
```

These traces make ranking changes auditable during offline evaluation and future support debugging.

### Safety Penalties

`is_generation_safe: false` receives a heavy negative adjustment. Actionable warnings such as questionnaire, low-signal, duplicate boilerplate, or administrative content receive smaller penalties. This suppresses noisy sources without deleting them or preventing future specialized workflows from using them intentionally.

### Intent-Aware Scoring

Content kind matching is prepared but not connected to generation routing. For example:

- `educational_post` boosts `educational` and `therapeutic_case`.
- `faq_answer` boosts `faq`.
- `sales_post` boosts `sales`.
- `short_hook` boosts `short_hook`.
- `therapeutic_case` boosts `therapeutic_case`, with smaller boosts for educational or narrative context.

This keeps the retrieval layer ready for Telegram, Instagram, and future expert surfaces while preserving current bot behavior.

### Local Simulation

`scripts/simulate-retrieval-ranking.js` loads Dinara metadata sidecars, simulates base retrieval scores, applies metadata-aware reranking, prints before/after ranking examples, and writes:

```text
expert_profiles/dinara/reports/onboarding/<timestamp>_retrieval_scoring_report.md
```

The simulation makes no OpenAI calls and does not mutate indexes.

## Context Assembly Intelligence Layer

The context assembly layer is now available as local reusable code, but it is not wired into the live Telegram runtime. It sits after metadata-aware retrieval scoring and before any future prompt or generation orchestration. Its job is to turn scored retrieval candidates into a compact, safe, diverse, explainable context pack.

## Unified Runtime Layer

The platform now has a local-only unified runtime layer in `scripts/unified-generation-runtime.js`. It is an orchestration shell around the existing isolated intelligence systems: retrieval scoring, cognitive graph, audience memory, trust memory, CTA memory, content strategy, production packaging, analytics, AI suppression, repetition prevention, and author voice validation.

This layer does not mutate Telegram runtime code, deploy anything, call external APIs, write to FAISS, ingest sources, promote indexes, auto-post, or migrate a production database. It produces local runtime artifacts and local cognition JSON only.

Current runtime flow:

```text
generation request
  -> load expert identity
  -> load persistent cognition
  -> load campaign state
  -> retrieve local context candidates
  -> evaluate repetition risk
  -> evaluate trust pacing
  -> evaluate audience memory
  -> decide generation strategy
  -> build production pack
  -> validate author voice
  -> suppress generic AI patterns
  -> score quality
  -> persist updated cognition
  -> return final runtime output
```

## Persistent Cognition Storage

Persistent cognition is stored as local JSON under:

```text
storage/cognition/<expert_id>/
```

Supported state files:

- `topic-graph-state.json`: topic graph, relationship memory, repetition intelligence, and recommendations.
- `trust-memory.json`: authority, emotional trust, educational trust, vulnerability trust, consistency trust, and familiarity trajectories.
- `cta-history.json`: recent CTA usage and escalation memory.
- `audience-memory.json`: audience state and identity transition memory.
- `narrative-memory.json`: active threads, authority progression, motifs, and concept reinforcement.
- `emotional-cycles.json`: emotional pacing history and high-intensity cycle memory.
- `optimization-history.json`: runtime quality, validation, hook, CTA, and platform decisions over time.

These files are intentionally independent from production indexes and databases. They make cognition inspectable, reversible, and portable across local simulations before any future production integration is considered.

## Runtime Orchestration Pipeline

The unified runtime uses a centralized runtime state object with these top-level domains:

- Expert identity
- Generation intent
- Audience state
- Campaign context
- Narrative continuity
- Emotional pacing
- CTA pacing
- Trust progression
- Repetition risk
- Platform target
- Production format

The orchestration trace records every major decision in order:

```text
load_expert
load_cognition_state
load_campaign_state
retrieve_context
evaluate_repetition
evaluate_trust_pacing
evaluate_audience_memory
generate_strategic_plan
build_production_pack
validate_author_voice
run_ai_suppression
calculate_quality_score
produce_final_runtime_output
```

This turns prior report-only intelligence into an executable runtime sequence while preserving the current live bot boundaries.

## Runtime Decision Engine

The decision engine dynamically selects:

- Hook type from audience stage, trust score, and recent topic repetition.
- Emotional depth from audience state and recent emotional-cycle intensity.
- CTA strength from trust memory and intent.
- Authority framing from trust accumulation.
- Narrative continuation from recent topic memory.
- Platform adaptation from the requested target surface.
- Content pacing from emotional fatigue and audience readiness.

The output is stored in `runtime_state.decision_engine` and passed into generation planning, production packaging, validation, and final runtime output.

## Runtime Validation Architecture

Runtime validation checks generation readiness before any publishable artifact is considered. Current validators cover:

- Tone consistency through author voice scoring.
- Narrative continuity through active thread and repetition state.
- Repetition risk through topic and hook memory.
- CTA overload risk through trust pacing.
- Audience fatigue through recent emotional intensity.
- Emotional overload through emotional cycle history.
- AI-generic patterns through suppression warnings.

Validation returns `pass` or `pass_with_warnings` plus actionable warning labels such as `author_voice_drift`, `reduce_cta_strength`, and `ai_generic_patterns_detected`.

## Runtime Simulation And Reports

`scripts/simulate-unified-runtime.js` runs a local 30-day evolution simulation. It exercises audience memory, narrative continuity, trust accumulation, CTA pacing, persistent cognition writes, and report generation.

Generated report paths:

```text
reports/runtime/runtime_execution_report.md
reports/runtime/cognition_state_report.md
reports/runtime/runtime_validation_report.md
reports/runtime/narrative_continuity_report.md
reports/runtime/repetition_risk_report.md
reports/runtime/trust_pacing_report.md
reports/runtime/CTA_pacing_report.md
reports/runtime/runtime_quality_report.md
```

Verification commands:

```bash
node --check scripts/unified-generation-runtime.js
node --check scripts/simulate-unified-runtime.js
node scripts/simulate-unified-runtime.js
```

The simulation is local only and confirms no deploy, no Telegram runtime mutation, no external API calls, no FAISS/index mutation, no ingest/promote, and no production publishing.

## Unified Runtime -> Generation Pipeline Integration

The unified runtime now connects to the existing local generation sandbox through an additive adapter:

```text
scripts/runtime-generation-adapter.js
```

The adapter does not replace production generation logic. It sits beside the live system and calls the existing local-only generation modules:

- `scripts/unified-generation-runtime.js`
- `scripts/expert-generation-sandbox.js`
- `scripts/expert-context-assembly.js`
- `scripts/expert-generation-orchestration.js`
- `scripts/expert-retrieval-intelligence.js`
- `scripts/expert-output-evaluation.js`
- `scripts/adapters/mock-generation-adapter.js`

The adapter always uses the mock generation adapter for this phase. It does not call OpenAI or any external provider.

### Current Local-Only Adapter Architecture

```text
generation request
  -> runtime-generation-adapter
  -> load persistent cognition
  -> run unified generation runtime
  -> extract runtime decisions
  -> map decisions into generation sandbox constraints
  -> run local generation sandbox with mock adapter
  -> evaluate generated mock output
  -> merge runtime validation + generation evaluation
  -> return structured local generation result
```

### Execution Flow

1. The adapter accepts `expertId`, topic/request text, intent, platform, length, format, tone, audience state, CTA type, and optional campaign day.
2. It loads local cognition state from `storage/cognition/<expert_id>/`.
3. It runs the unified runtime to evaluate repetition, trust pacing, audience memory, author voice, AI suppression, and quality.
4. It maps runtime decisions into generation sandbox `output_constraints`.
5. It runs the existing generation sandbox with `adapter: "mock"`.
6. It returns a structured result containing runtime state, generation decisions, assembled context summary, generated mock content structure, validation warnings, quality score, repetition risk, CTA/trust pacing, and author voice status.

### State Loading Flow

Persistent cognition remains the runtime source of state:

```text
storage/cognition/dinara/topic-graph-state.json
storage/cognition/dinara/trust-memory.json
storage/cognition/dinara/cta-history.json
storage/cognition/dinara/audience-memory.json
storage/cognition/dinara/narrative-memory.json
storage/cognition/dinara/emotional-cycles.json
storage/cognition/dinara/optimization-history.json
```

The generation sandbox still assembles its own local context from expert metadata sidecars and prepared local knowledge files. This is intentional for the integration phase: it proves compatibility without making runtime context authoritative for production.

### Generation Decision Flow

Runtime decisions are passed into sandbox constraints as local planning context:

- `hook_type`
- `emotional_depth`
- `cta_strength`
- `authority_framing`
- `narrative_continuation`
- `content_pacing`
- normalized platform
- normalized length
- normalized format
- tone and CTA style

The existing sandbox then builds a generation plan, prompt assembly, mock output, evaluation, and local artifacts under expert report folders.

### Validation Flow

The integration result merges two validation layers:

- Runtime validation: repetition risk, trust/CTA pacing, audience fatigue, emotional overload, author voice status, AI-generic warnings.
- Generation sandbox evaluation: structure quality, clarity, warmth, hallucination risk, CTA quality, context utilization, output warnings.

The adapter returns a combined quality score and combined warning list. Current expected local warnings include `author_voice_drift`, `mock_adapter_used`, `missing_cta`, and `reduce_cta_strength`.

### Runtime Generation Simulation

`scripts/simulate-runtime-generation-flow.js` runs five local requests for `dinara`:

- short Instagram post
- normal Telegram post
- long article mode
- direct FAQ answer
- soft sales/consultation post

Generated reports:

```text
reports/runtime-generation/runtime_generation_flow_report.md
reports/runtime-generation/runtime_adapter_report.md
reports/runtime-generation/runtime_generation_validation_report.md
reports/runtime-generation/runtime_integration_risks_report.md
```

### Blocked From Production

The adapter is intentionally blocked from production use until separate validation is complete:

- No Telegram handler integration.
- No Telegram polling/runtime mutation.
- No production publishing.
- No auto-posting.
- No Railway deploy or environment changes.
- No external API generation.
- No FAISS/vector index mutation.
- No ingest/promote.
- No production database migration.

Before Telegram runtime integration, the platform must validate exact Telegram payload shape, Markdown escaping, caption limits, runtime persistence failure behavior, real generated draft quality, duplicate-topic suppression, CTA escalation, and a human approval workflow.

## Runtime Prompt Assembly Dry Run

The runtime-generation adapter now performs real local prompt assembly without executing an LLM. The current mode is:

```text
llmExecutionMode: dry_run_prompt_only
```

This replaces the earlier mock-content bridge. The adapter no longer uses the mock generation adapter as the generation result. Instead, it assembles the full prompt package that a future LLM call would receive, then stops before execution.

### How Prompt Assembly Works

Current local flow:

```text
generation request
  -> load persistent cognition
  -> run unified runtime decisions
  -> load local retrieval candidates from expert metadata
  -> rerank retrieval candidates
  -> assemble context pack
  -> create generation orchestration plan
  -> assemble final system/user prompt
  -> build message payload
  -> build config payload
  -> validate prompt package
  -> return dry-run generation package
```

The adapter reuses existing local builders:

- `createLocalRetrievalCandidates()` from `scripts/expert-generation-sandbox.js`
- `rerankRetrievalItems()` from `scripts/expert-retrieval-intelligence.js`
- `assembleContextPack()` from `scripts/expert-context-assembly.js`
- `createGenerationPlan()` from `scripts/expert-generation-orchestration.js`
- `assembleFinalPrompt()` from `scripts/expert-generation-sandbox.js`

### Data Used

The prompt package contains:

- Expert id and expert profile summary.
- Original generation request.
- Selected local context items.
- Runtime cognition summary.
- Runtime decisions.
- Content length mode.
- Style/tone mode.
- Audience assumptions.
- CTA policy.
- Anti-repetition constraints.
- Author voice constraints.
- Final assembled prompt.
- Chat-style message payload.
- Config payload.
- Prompt validation result.
- Combined runtime/prompt quality score.

The config payload explicitly marks:

```text
production_execution_allowed: false
external_api_calls_allowed: false
telegram_delivery_allowed: false
```

### What Remains Simulated

Final content text remains unavailable in this dry run because the adapter intentionally does not call an LLM. Prompt package validation scores prompt readiness, context sufficiency, and runtime warning state. It does not claim that final generated copy has been tested.

### Blocked From Production

Still blocked:

- Telegram runtime integration.
- Live OpenAI or other LLM execution.
- Auto-posting or publishing.
- Railway deploy.
- FAISS/index mutation.
- Ingest/promote workflows.
- Production database migrations.
- Direct replacement of the existing Telegram generation path.

### Next Step Toward Admin-Only Telegram Preview Mode

The next safe step is an admin-only preview command that reads the dry-run prompt package and renders it as an internal preview artifact without publishing. That step should remain feature-flagged, should not send generated content to normal users, and should require explicit admin approval before any live LLM execution is introduced.

Current local flow:

```text
retrieved documents with base scores
  -> metadata-aware retrieval reranking
  -> scored candidates with retrieval_trace
  -> context assembly by generation_intent
  -> selected_items and suppressed_items
  -> future prompt/context builder
```

The implementation lives in `scripts/expert-context-assembly.js` and exposes:

- `assembleContextPack(input)`: select and suppress scored candidates under safety, diversity, duplicate, and budget rules.
- `GENERATION_INTENT_STRATEGIES`: intent-to-content-kind strategy map.
- `DEFAULT_ASSEMBLY_OPTIONS`: default local caps for context items, total characters, content-kind usage, and source-type usage.

### Input Shape

The assembler accepts a future integration shape:

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "max_context_items": 6,
  "max_total_chars": 12000,
  "candidates": []
}
```

Candidates can contain source metadata directly, nested under `metadata`, or normalized under `retrieval_metadata`. If present, `retrieval_trace` is preserved exactly so the context pack can explain why each candidate had its score.

### Output Shape

The assembler returns:

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "selected_items": [],
  "suppressed_items": [],
  "context_summary": {},
  "assembly_trace": []
}
```

Selected items include `selected_because` and `selection_rank`. Suppressed items include `suppressed_because`. The `assembly_trace` keeps an auditable action log and carries the original retrieval trace forward.

### Intent Strategies

Supported generation intents:

| generation_intent | preferred content kinds |
| --- | --- |
| `educational_post` | `educational`, `therapeutic_case`, `faq` |
| `storytelling` | `storytelling`, `therapeutic_case`, `educational` |
| `faq_answer` | `faq`, `educational` |
| `sales_post` | `sales`, `educational`, `storytelling` |
| `short_hook` | `short_hook`, `storytelling`, `sales` |
| `therapeutic_case` | `therapeutic_case`, `educational`, `storytelling` |

Intent matching is used during assembly explainability and selection preference. It does not rewrite generation prompts and does not call a model.

### Diversity Balancing

The assembler currently enforces:

- no exact duplicate `content_sha256` selections;
- max 2 selected items per `content_kind`;
- max 3 selected items per `source_type`;
- configurable `max_context_items`;
- configurable `max_total_chars`.

The context summary warns when the pack is too narrow, only has one source type, has too few safe candidates, reaches the character budget, or suppresses duplicates.

### Suppression Logic

Candidates can be suppressed for:

- `generation_unsafe`: `is_generation_safe` is false;
- `questionnaire_context`: source type or content kind is questionnaire-like and should not ground normal generation;
- `noisy_warnings`: actionable warning metadata is present;
- `low_final_score`: final retrieval score is non-positive after metadata penalties;
- `duplicate_content_hash`: the same content hash was already selected;
- `content_kind_limit`: a content kind would be overused;
- `source_type_limit`: a source type would be overused;
- `max_context_items_reached`: the pack is already full;
- `context_budget_exceeded`: the item would exceed the character budget.

The bookkeeping warning `existing_prepared_file_referenced_without_copy` is not treated as noisy because it describes local provenance, not generation risk.

### Explainability Traces

Each selected item records reasons such as:

```json
{
  "selected_because": [
    "high_final_score",
    "intent_content_match",
    "generation_safe",
    "source_diversity"
  ],
  "selection_rank": 1
}
```

Each suppressed item records reasons such as:

```json
{
  "suppressed_because": [
    "generation_unsafe",
    "duplicate_content_hash",
    "context_budget_exceeded"
  ]
}
```

These assembly reasons are separate from retrieval scoring reasons. Future support tooling can show both layers: why a document ranked where it did, and why it was or was not included in generation context.

### Local Simulation

`scripts/simulate-context-assembly.js` loads Dinara metadata sidecars, creates deterministic local base retrieval scores, applies `scripts/expert-retrieval-intelligence.js`, assembles context packs for every supported intent, prints an educational-post example, and writes:

```text
expert_profiles/dinara/reports/onboarding/<timestamp>_context_assembly_report.md
```

The simulation reads local sidecars and text excerpts only. It makes no OpenAI calls, does not run ingest or promote, does not mutate production indexes, does not touch FAISS/vector indexes, and does not change the live bot.

### Future Wiring Into Generation

Future generation orchestration should call context assembly after retrieval reranking and before prompt construction. The prompt-building layer can consume `selected_items[].content`, while observability can store `context_summary` and `assembly_trace`. This keeps retrieval, assembly, and prompt writing as separate steps and makes multi-expert routing easier to evaluate.

## Generation Orchestration Simulation Layer

The generation orchestration simulation layer is now available as local reusable code, but it is not wired into the live Telegram runtime. It sits after context assembly and before any future prompt rendering or model call. Its job is to turn an assembled context pack into a structured generation plan, prompt blueprint, context injection plan, output policy, and orchestration trace.

Current local flow:

```text
metadata sidecars
  -> simulated retrieval candidates
  -> metadata-aware reranking
  -> context assembly
  -> generation orchestration
  -> prompt blueprint and output policy
  -> future prompt renderer / model call
```

The implementation lives in `scripts/expert-generation-orchestration.js` and exposes:

- `createGenerationPlan(input)`: create a structured generation strategy, prompt blueprint, context injection plan, output policy, and trace.
- `getSupportedIntents()`: list available generation intents.
- `getIntentStrategy(intent)`: retrieve the deterministic strategy for one intent.
- `normalizeOutputPolicy(outputConstraints)`: validate and normalize platform, length, format, CTA, and tone constraints.
- `buildContextInjectionPlan(contextPack)`: classify selected context as primary, supporting, tone/style, background, or excluded.

### Input Shape

The orchestrator accepts this future integration shape:

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "user_request": "Напиши экспертный пост про женскую сексуальность",
  "context_pack": {},
  "output_constraints": {
    "platform": "instagram",
    "length": "medium",
    "tone": "expert_warm",
    "format": "post",
    "cta_style": "soft"
  }
}
```

The `context_pack` is expected to be the output of `assembleContextPack`. The orchestrator does not read production indexes, call OpenAI, mutate FAISS/vector files, run ingest, run promote, deploy, or touch the live bot.

### Output Shape

The orchestrator returns:

```json
{
  "expert_id": "dinara",
  "generation_intent": "educational_post",
  "generation_strategy": {},
  "prompt_blueprint": {},
  "context_injection_plan": {},
  "output_policy": {},
  "orchestration_trace": []
}
```

This is a planning artifact only. It does not contain final generated social content and is not sent to a model.

### Intent Strategies

Supported generation intents:

| generation_intent | goal | structure |
| --- | --- | --- |
| `educational_post` | useful expert explanation | hook -> problem framing -> expert explanation -> example -> soft CTA |
| `storytelling` | emotional identification and trust | situation -> inner conflict -> insight -> expert meaning -> CTA |
| `faq_answer` | direct helpful expert answer | short answer -> nuance -> practical recommendation -> when to seek specialist |
| `sales_post` | ethical conversion without aggressive pressure | pain point -> consequence -> expert solution -> trust proof -> CTA |
| `short_hook` | attention capture | punchy statement / contrast / myth / question |
| `therapeutic_case` | explain through anonymized case logic | case setup -> pattern -> interpretation -> general lesson -> CTA |

Every strategy defines:

- `goal`;
- `recommended_structure`;
- `voice_priorities`;
- `context_usage_rules`;
- `cta_strategy`;
- `forbidden_patterns`;
- `quality_checklist`.

### Prompt Blueprint Architecture

The prompt blueprint is structured into named sections for a future prompt renderer:

- `system_instruction`;
- `expert_voice_instruction`;
- `generation_strategy_instruction`;
- `context_pack_instruction`;
- `output_constraints_instruction`;
- `safety_instruction`;
- `final_user_request`.

These are section plans, not a final prompt sent to OpenAI. Future wiring can render these sections into a model prompt only after offline evaluation and safety review.

### Context Injection Rules

The context injection plan separates assembled context into roles:

- `primary_context`: the strongest selected items for factual grounding and the main expert position.
- `supporting_context`: secondary material for nuance, objections, examples, or alternative angles.
- `tone_style_context`: selected items that should influence rhythm, warmth, framing, or authorial feel only.
- `background_context`: safe selected items retained for diagnostics or possible later use.
- `suppressed_context`: unsafe, noisy, questionnaire-like, duplicate, or over-budget items that must not ground future generation.

Current injection rules:

- Use primary context for factual grounding and expert position.
- Use supporting context for nuance and examples.
- Use tone/style context only for voice and framing.
- Limit quoted source text to short fragments.
- Avoid copying long source fragments.
- Avoid unsafe, suppressed, questionnaire, noisy, or low-score material.
- Prefer synthesized output over paraphrase.
- Keep retrieval, assembly, and orchestration traces for diagnostics, not reader-facing copy.

### Output Policies

The output policy normalizes future generation constraints:

- `platform`: `instagram`, `telegram`, or `generic`;
- `length`: `short`, `medium`, or `long`;
- `format`: `post`, `carousel_script`, `reel_script`, `answer`, or `hook_list`;
- `cta_style`: `none`, `soft`, `direct`, or `consultative`;
- `tone`: `expert_warm`, `direct`, `empathetic`, `provocative`, or `calm`;
- `language`: defaults to `ru`;
- `final_text_generation`: always `false` in this layer.

The policy defines constraints for future generation but does not generate text.

### Safety Rules

The orchestration layer carries forward source safety decisions and adds generation-specific safety boundaries:

- do not use `suppressed_items` as grounding;
- do not use questionnaire-like or unsafe sources in normal expert content;
- do not diagnose from social content;
- do not shame, fearmonger, or promise guaranteed outcomes;
- do not invent trust proof, clinical certainty, or offer details;
- anonymize and generalize case material;
- refer to specialist support when appropriate.

### Explainability Traces

Every generation plan includes `orchestration_trace` entries such as:

```json
[
  { "step": "intent_strategy_selected" },
  { "step": "context_pack_received" },
  { "step": "primary_context_selected" },
  { "step": "safety_rules_applied" },
  { "step": "output_policy_applied" },
  { "step": "prompt_blueprint_created" }
]
```

This sits alongside `retrieval_trace` and `assembly_trace`, giving a future support view across all local decision layers.

### Local Simulation

`scripts/simulate-generation-orchestration.js` loads Dinara metadata sidecars, simulates retrieval scoring, runs context assembly, runs generation orchestration for all supported intents, prints an educational-post example, and writes:

```text
expert_profiles/dinara/reports/onboarding/<timestamp>_generation_orchestration_report.md
```

The report includes supported intents, strategy per intent, an example `educational_post` generation plan, prompt blueprint sections, context injection example, output policy example, orchestration trace, and future integration recommendations.

### Future Live Integration Path

Future live integration should keep the same boundaries:

1. Retrieve candidate chunks.
2. Apply metadata-aware retrieval reranking.
3. Assemble a safe context pack.
4. Create a generation plan with this orchestration layer.
5. Render a prompt from the blueprint in a separate prompt-rendering layer.
6. Call a model only after offline evaluation and platform-specific safety checks.
7. Store retrieval, assembly, and orchestration traces for diagnostics.

The Telegram bot should not consume this layer until prompt rendering, evaluation fixtures, and live runtime integration are explicitly designed.

## Local Generation Sandbox

The local generation sandbox is the first execution layer for expert content generation experiments. It is intentionally separate from the live Telegram bot and production indexes. It can assemble final prompts, run a local generation adapter, store artifacts, evaluate outputs with heuristics, and compare runs for future feedback learning.

Current sandbox flow:

```text
user request
  -> local retrieval candidate simulation from metadata sidecars
  -> metadata-aware retrieval scoring
  -> context assembly
  -> generation orchestration
  -> final prompt assembly
  -> local generation adapter
  -> heuristic output evaluation
  -> timestamped artifact storage
  -> comparison summary
```

The main implementation lives in:

- `scripts/expert-generation-sandbox.js`: reusable sandbox pipeline, final prompt assembly, artifact storage, and run comparison.
- `scripts/expert-output-evaluation.js`: local heuristic evaluation layer.
- `scripts/adapters/mock-generation-adapter.js`: deterministic local mock generation provider.
- `scripts/adapters/openai-generation-adapter.js`: optional local OpenAI provider.
- `scripts/run-local-generation-sandbox.js`: local runner for example scenarios and sandbox reporting.

### Final Prompt Assembly

The sandbox converts the orchestration `prompt_blueprint` into a real prompt shape with:

- system prompt;
- expert voice layer;
- generation strategy layer;
- curated context injection;
- safety layer;
- output constraints;
- final user request.

The final prompt includes selected safe context only. It uses `context_injection_plan.primary_context`, `supporting_context`, and `tone_style_context` to look up matching `context_pack.selected_items`. It does not inject `suppressed_items`, unsafe sources, questionnaire-like suppressed context, or noisy excluded items.

Prompt files are stored locally under generation run artifacts. API keys are never written to logs or reports.

### Adapter Architecture

Generation adapters are intentionally small provider boundaries. The sandbox currently supports:

- `mock`: deterministic local output for repeatable offline tests;
- `openai`: optional local OpenAI generation using `OPENAI_API_KEY`.

The runner defaults to the mock adapter. Set `GENERATION_SANDBOX_ADAPTER=openai` for a local OpenAI sandbox run. If OpenAI is requested without an API key, the sandbox falls back to the mock adapter and records a warning. This keeps execution local and prevents production wiring from appearing implicitly.

Future providers can implement the same adapter shape:

```json
{
  "provider": "mock",
  "model": "local-deterministic-mock",
  "output": "...",
  "usage": null,
  "warnings": []
}
```

### Artifact Storage

Each run writes a timestamped folder under:

```text
expert_profiles/dinara/reports/generation_runs/
```

Every run stores:

- `request.json`;
- `context_pack.json`;
- `orchestration_plan.json`;
- `final_prompt.txt`;
- `generated_output.md`;
- `evaluation.json`;
- `run_summary.md`.

This makes individual generation attempts auditable and comparable without mutating production indexes or live runtime behavior.

### Evaluation Layer

`scripts/expert-output-evaluation.js` performs heuristic/local scoring only. It estimates:

- `style_match_score`;
- `structure_quality_score`;
- `educational_clarity_score`;
- `emotional_warmth_score`;
- `redundancy_score`;
- `hallucination_risk`;
- `cta_quality`;
- `expert_tone_match_score`;
- `context_utilization_quality_score`;
- `overall_score`;
- `warnings`.

The evaluator does not call external services. It is a first-pass signal for offline comparison, not a substitute for expert review.

### Sandbox Execution Flow

`scripts/run-local-generation-sandbox.js` executes example scenarios:

- educational Instagram post;
- storytelling Telegram post;
- FAQ answer;
- short hook list;
- therapeutic case post.

It writes per-run artifacts, evaluates every output, compares runs, and writes:

```text
expert_profiles/dinara/reports/onboarding/<timestamp>_generation_sandbox_report.md
```

The report includes executed scenarios, strategies used, prompt structure examples, evaluation summaries, comparison summaries, warnings, and recommendations for feedback learning.

### Comparison Support

The sandbox can compare multiple runs by intent, platform, format, adapter, output policy, prompt strategy, and evaluation scores. `compareGenerationRuns(runs)` returns:

- run count;
- best run;
- lowest scoring run;
- average overall score;
- high-risk runs;
- warning counts;
- per-run summaries and output paths.

This creates a foundation for testing multiple prompt strategies against the same context pack or comparing platform policies before live integration.

### Future Feedback Loop Integration

Future feedback learning should add human labels next to, not over, heuristic evaluation:

- factuality;
- expert voice match;
- usefulness;
- emotional safety;
- CTA ethics;
- publish readiness;
- reviewer notes;
- selected revision strategy.

Those labels can later train prompt policy choices, preferred context mixes, or post-generation revision rules. The current sandbox only stores artifacts and heuristic scores.

### Future Live Generation Integration

Live generation should remain blocked until:

1. Offline sandbox runs are reviewed.
2. Prompt rendering rules are stable.
3. Unsafe/suppressed context exclusion is tested.
4. Human feedback labels exist for representative outputs.
5. Runtime observability stores retrieval, assembly, orchestration, generation, and evaluation traces.
6. Telegram and Instagram adapters have explicit safety and retry behavior.

When live generation is designed, it should consume the same boundaries: retrieval scoring, context assembly, orchestration, prompt assembly, adapter execution, evaluation, and trace storage. The live bot should not call sandbox scripts directly.

## Feedback Memory Layer

The feedback memory layer is a local-only intelligence layer that reads generation sandbox artifacts and stores reusable learning signals. It does not modify prompts, retrieval scoring, production indexes, Telegram behavior, or model weights. Its purpose is to make generation outcomes analyzable before any future adaptive behavior is considered.

Current local flow:

```text
generation run artifacts
  -> feedback signal extraction
  -> successful pattern memory
  -> weak pattern memory
  -> retrieval feedback analytics
  -> style feedback analytics
  -> CTA feedback analytics
  -> recommendation-only reports
```

The implementation lives in:

- `scripts/expert-feedback-memory.js`: reusable memory extraction, aggregation, scoring, style drift detection, recommendation generation, and storage.
- `scripts/analyze-feedback-memory.js`: report generation from feedback memory files.
- `scripts/simulate-feedback-learning.js`: local simulation that rebuilds memory from generation artifacts and writes reports.

Feedback memory is stored under:

```text
expert_profiles/dinara/feedback_memory/
```

Current files:

- `successful_patterns.json`;
- `weak_patterns.json`;
- `retrieval_feedback.json`;
- `style_feedback.json`;
- `cta_feedback.json`;
- `generation_feedback_log.jsonl`.

### Learning Signal Extraction

The feedback layer extracts signals from:

- `request.json`;
- `context_pack.json`;
- `orchestration_plan.json`;
- `generated_output.md`;
- `evaluation.json`.

Extracted signals include:

- generation intent;
- platform, format, tone, and CTA style;
- strategy structure pattern;
- context kind and source-type signature;
- selected and suppressed context counts;
- evaluation scores and warnings;
- orchestration steps;
- context assembly actions;
- repeated phrase candidates;
- style drift warnings.

Signals are classified as:

- `successful`: high overall score, no high hallucination risk, and no warnings;
- `weak`: low score, non-low hallucination risk, or warnings;
- `neutral`: neither clearly successful nor clearly weak.

### Pattern Intelligence

Pattern scoring tracks:

- `pattern`;
- `usage_count`;
- `average_score`;
- `recent_trend`;
- intent distribution;
- warning counts;
- example run ids.

The current layer tracks both successful and weak patterns. Example pattern shape:

```json
{
  "pattern": "hook -> problem framing -> expert explanation -> example -> soft CTA",
  "usage_count": 1,
  "average_score": 0.83,
  "recent_trend": "stable"
}
```

Adaptive recommendations are generated from these memories, but they are recommendations only. They do not rewrite prompts, alter orchestration strategies, or change retrieval weights.

### Style Drift Detection

The feedback layer emits style drift warnings for review signals such as:

- low expert tone match;
- low emotional warmth;
- generic AI wording;
- repetitive phrasing;
- overly structured robotic output;
- repetitive paragraph openings.

Style drift detection is heuristic and local. It should be paired with human expert review before any future prompt changes.

### Retrieval Learning Analysis

Retrieval learning is analytics-only. It tracks:

- which content-kind mixes correlate with high scores;
- which source-type mixes correlate with high scores;
- which full context signatures perform best;
- which context mixes correlate with weak outputs or warnings.

This layer must not mutate retrieval scoring automatically. Future changes to retrieval weights should be explicit, reviewed, and tested offline.

### CTA Learning Analysis

CTA feedback tracks CTA style, CTA quality, and warnings such as `missing_cta`. The recommendation engine can suggest stronger CTA handling for specific intents, but it does not alter generation strategies automatically.

### Feedback Reports

`scripts/simulate-feedback-learning.js` and `scripts/analyze-feedback-memory.js` write reports under:

```text
expert_profiles/dinara/reports/feedback_memory/
```

Current reports:

- `feedback_memory_report.md`;
- `style_drift_report.md`;
- `retrieval_learning_report.md`;
- `generation_pattern_report.md`.

These reports summarize strongest generation patterns, weakest generation patterns, best and weakest intent types, common warnings, repeated hallucination risks, overused phrasing, style drift warnings, retrieval learning insights, and recommendation-only next steps.

### Future Adaptive Learning

Future adaptive learning should remain staged:

1. Accumulate sandbox runs.
2. Store heuristic feedback memory.
3. Add human review labels beside heuristic scores.
4. Compare prompt strategies offline.
5. Promote only reviewed recommendations into prompt policy changes.
6. Test new policy changes in the sandbox before any live use.

No automatic self-training, autonomous prompt rewriting, production runtime mutation, Telegram integration, Railway deployment, OpenAI fine-tuning, or automatic retrieval mutation is allowed in this layer.

### Future Expert Fine-Tuning Path

If expert fine-tuning is considered later, feedback memory can help select candidate training examples and exclusion examples. That future path must be explicit and separate:

- reviewed human labels are required;
- private or unsafe material must be excluded;
- hallucination and style drift warnings must be resolved;
- training data export must be a separate audited script;
- OpenAI fine-tuning or any provider fine-tuning must not be called by feedback memory scripts.

For now, feedback memory is an analytics and recommendation foundation only.

## Author Voice Intelligence Layer

The author voice intelligence layer creates a persistent structured voice model for each expert. It is local-only and reusable for future multi-expert style adaptation. It does not wire into Telegram, rewrite prompts automatically, fine-tune a model, deploy, or mutate production indexes.

Current local flow:

```text
expert voice/source files
  -> author voice extraction
  -> emotional tone modeling
  -> sentence rhythm modeling
  -> vocabulary intelligence
  -> CTA style intelligence
  -> storytelling behavior modeling
  -> generic AI suppression list
  -> style similarity scoring for sandbox outputs
  -> voice reports
```

The implementation lives in:

- `scripts/expert-author-voice.js`: reusable author voice extraction, profile persistence, generic AI detection, style scoring, and recommendation helpers.
- `scripts/simulate-author-voice.js`: local simulation that builds Dinara's voice profile, scores sandbox outputs, and writes reports.

Profiles are stored under:

```text
expert_profiles/dinara/voice/
```

Current files:

- `tone_profile.json`;
- `sentence_rhythm.json`;
- `vocabulary_profile.json`;
- `cta_style_profile.json`;
- `storytelling_profile.json`;
- `emotional_profile.json`;
- `conversational_patterns.json`;
- `expert_phrases.json`;
- `forbidden_generic_ai_phrases.json`.

### Emotional Tone Modeling

The emotional tone model estimates normalized local scores for:

- warmth;
- empathy;
- directness;
- softness;
- authority;
- educational tone;
- therapeutic tone;
- conversational energy;
- clinical style.

The derived `emotional_profile.json` keeps higher-level signals such as emotional range, emotional safety, and clinical distance. These scores are heuristic and should be reviewed before being used as live generation constraints.

### Vocabulary Intelligence

The vocabulary profile extracts:

- common phrases;
- emotional phrases;
- educational phrases;
- therapeutic wording;
- expert terminology;
- soft CTA patterns;
- audience addressing style;
- high-confidence expert phrases;
- generic AI phrasing found in local sources;
- overused phrases.

`expert_phrases.json` separates high-confidence, emotional, educational, therapeutic, and CTA phrase groups. Future prompt systems may use these as style references, but this layer does not inject them into production prompts automatically.

### CTA Style Intelligence

The CTA profile models:

- soft CTA style;
- direct CTA style;
- therapeutic CTA style;
- engagement CTA style;
- Instagram-style CTA behavior;
- Telegram conversational CTA behavior;
- aggressive CTA risk;
- low-warmth CTA risk;
- weak engagement CTA risk.

CTA findings are recommendations only. They can support future prompt review and feedback labeling, not automatic prompt mutation.

### Generic AI Suppression

The layer persists `forbidden_generic_ai_phrases.json`, a reusable suppression list for robotic or low-human phrasing such as:

- `Важно понимать`;
- `Следует отметить`;
- `В современном мире`;
- `Подводя итог`;
- repetitive numbered over-structuring;
- formulaic intro/list/conclusion shapes;
- corporate neutral abstraction.

The suppression list is advisory. Future generation layers can use it for evaluation, linting, or review warnings after explicit integration.

### Style Similarity Scoring

`scoreAuthorVoiceMatch(output, profile)` estimates:

- tone similarity;
- vocabulary similarity;
- rhythm similarity;
- emotional similarity;
- CTA similarity;
- storytelling similarity;
- generic AI risk;
- overall voice match score;
- style adaptation recommendations.

This scoring is used locally by `scripts/simulate-author-voice.js` to compare generated sandbox outputs against the persistent profile.

### Future Adaptive Style Engine

The future adaptive style engine should remain staged:

1. Build persistent author voice profiles.
2. Score sandbox outputs against the profiles.
3. Combine voice scores with feedback memory and human review labels.
4. Recommend prompt policy changes offline.
5. Test changes in the sandbox.
6. Only after review, wire selected constraints into future generation orchestration.

No autonomous prompt rewriting, OpenAI fine-tuning, production runtime mutation, Telegram integration, Railway deployment, ingest/promote, or retrieval mutation is allowed in this layer.

## Multi-Expert Runtime Architecture

The multi-expert runtime layer introduces a reusable identity and configuration boundary around the existing local intelligence modules. It is designed to let future Telegram, Instagram, and SaaS onboarding flows resolve an expert-specific runtime without assuming that Dinara is the only expert.

Current implementation:

- `configs/experts/registry.json`: local expert identity registry.
- `configs/experts/dinara/`: active Dinara runtime config.
- `configs/experts/template/`: reusable config schema examples.
- `configs/experts/relationship_coach_demo/`: placeholder demo expert.
- `configs/experts/medical_educator_demo/`: placeholder demo expert.
- `configs/experts/finance_creator_demo/`: placeholder demo expert.
- `scripts/expert-registry.js`: resolver, policy loader, capability matrix builder, and isolation validator.
- `scripts/simulate-multi-expert-runtime.js`: local simulation and reporting entry point.
- `templates/expert-onboarding/`: future onboarding contract for required folders, configs, reports, style profiles, and evaluation files.

The layer is configuration-first. It does not call OpenAI, does not create embeddings, does not ingest datasets, does not promote indexes, does not mutate FAISS/vector files, and does not change Telegram polling or webhook behavior.

## Expert Isolation Model

Each expert receives a scoped runtime identity:

```json
{
  "expert_id": "dinara",
  "retrieval_namespace": "dinara_main",
  "voice_profile_path": "expert_profiles/dinara/voice",
  "feedback_memory_path": "expert_profiles/dinara/feedback_memory",
  "generation_policy_path": "configs/experts/dinara/generation-policy.json",
  "safety_policy_path": "configs/experts/dinara/safety-policy.json",
  "style_constraints_path": "configs/experts/dinara/style-constraints.json"
}
```

Isolation rules:

- Retrieval must include an expert namespace.
- Voice profile paths must stay inside the expert's own profile or config scope.
- Feedback memory paths must stay separate from voice profile paths.
- Generation policies must forbid shared prompt memory.
- Style policies must forbid cross-expert voice examples.
- Runtime config files must carry matching `expert_id` and retrieval namespace values.
- Demo experts use placeholder configs only and do not introduce real datasets.

This prevents cross-expert retrieval leakage, voice contamination, feedback contamination, accidental prompt mixing, and shared style memory corruption at the architecture boundary.

## Expert Registry System

The registry stores expert metadata and stable paths to runtime policies. It is intentionally small and deterministic so future onboarding automation can add experts without changing generation code.

Reusable functions in `scripts/expert-registry.js`:

- `getExpertConfig(expertId)`
- `getExpertVoiceProfile(expertId)`
- `getExpertGenerationPolicy(expertId)`
- `getExpertRetrievalNamespace(expertId)`
- `getExpertFeedbackMemory(expertId)`
- `resolveExpertRuntime(expertId)`
- `validateExpertIsolation()`
- `buildCapabilityMatrix()`

The registry is not a router yet. Existing Dinara runtime behavior remains unchanged because the live bot does not import this module.

## Runtime Resolution Layer

Runtime resolution turns an `expert_id` into a complete local config bundle:

```text
expert_id
  -> registry metadata
  -> expert config
  -> retrieval settings
  -> generation policy
  -> tone policy
  -> CTA policy
  -> safety policy
  -> style constraints
  -> context policy
  -> output policy
  -> capability profile
  -> voice profile path
  -> feedback memory path
```

Future generation systems should resolve all expert-specific inputs through this layer before retrieving context, assembling prompts, scoring voice, or reading feedback memory. This keeps runtime behavior explicit and makes multi-tenant support auditable.

## Multi-Tenant Expert Intelligence

Capabilities are declared per expert:

```json
{
  "supports_storytelling": true,
  "supports_sales_posts": true,
  "supports_therapeutic_content": true,
  "supports_short_hooks": true,
  "supports_long_articles": true,
  "supports_reels_scripts": false,
  "supports_cta_generation": true
}
```

Future routers can use the capability matrix to decide whether an expert can produce a specific format or content type. Policy files then constrain how that capability may be used: allowed content kinds, forbidden content kinds, emotional tone limits, medical/legal sensitivity, CTA aggressiveness limits, therapeutic constraints, and educational constraints.

The current simulation validates that each expert resolves to separate retrieval, generation, tone, CTA, safety, style, context, and output configs. It also simulates namespace-filtered retrieval, voice matching inside the expert scope, and feedback memory loading from expert-scoped paths.

## Future SaaS Expert Onboarding

The onboarding template defines what future automation must collect and validate before an expert can become active:

- required expert metadata;
- required runtime config files;
- required voice/style profile locations;
- required feedback memory locations;
- required onboarding reports;
- required evaluation files;
- required retrieval namespace;
- required capability profile.

Future SaaS onboarding should remain staged:

1. Create draft expert identity and config files.
2. Collect source inventory and author voice material.
3. Run local classification, retrieval, context assembly, orchestration, sandbox, author voice, and feedback simulations.
4. Generate reports for human review.
5. Only after review, decide whether to build indexes, wire routing, or activate live surfaces.

Automatic onboarding is not active. The current layer only prepares the architecture and validation contract.

## Isolation & Safety Guarantees

The multi-expert layer currently guarantees the following at the local architecture level:

- no Railway deploy;
- no production runtime mutation;
- no Telegram runtime changes;
- no OpenAI fine-tuning;
- no FAISS/index mutation;
- no ingest or promote;
- no automatic onboarding;
- no cross-expert namespace reuse;
- no cross-expert voice profile path reuse;
- no shared prompt memory in generation policy;
- no unscoped style examples in generation policy;
- no template paths used as live runtime paths.

Validation reports are written under:

```text
reports/multi-expert/
```

The reports are local audit artifacts only.

## Content Strategy Intelligence

The content strategy intelligence layer turns isolated expert generation into strategic campaign planning. It does not generate final posts. It creates planning artifacts that future generation and editorial review systems can consume after explicit integration.

Current implementation:

- `scripts/content-strategy-engine.js`: reusable deterministic planning engine.
- `scripts/simulate-content-strategy.js`: local 30-day strategy simulation and report generator.
- `schemas/content-planning/`: JSON schemas for campaign plans, content nodes, CTAs, audience states, narrative arcs, and topic graphs.
- `reports/content-strategy/`: generated planning reports.

Supported content intents:

- educational
- authority
- therapeutic
- engagement
- sales
- soft_sales
- storytelling
- FAQ
- objection_handling
- audience_warming
- lead_magnet
- reels_hook
- carousel
- longform_article

The strategy layer is recommendation-only. It does not post, schedule, call OpenAI, mutate prompts, mutate indexes, deploy, or change Telegram runtime behavior.

## Campaign Orchestration

Campaign intelligence supports reusable strategic structures:

- multi-post campaigns;
- warming sequences;
- authority-building sequences;
- launch campaigns;
- educational series;
- emotional storytelling arcs;
- conversion sequences;
- FAQ clusters;
- trust-building flows.

The campaign planner creates a sequence of content nodes. Each node has a day, week, topic, intent, platform, audience state, CTA type, campaign stage, narrative dependency, emotional frame, and expert positioning. The current simulation builds a 30-day trust-building flow for Dinara and writes:

```text
reports/content-strategy/content_strategy_report.md
reports/content-strategy/campaign_flow_report.md
```

These reports are planning maps only, not generation outputs.

## Narrative Continuity Engine

The narrative continuity engine tracks:

- repeated themes;
- emotional progression;
- audience sophistication;
- CTA escalation;
- storytelling continuity;
- expert positioning continuity.

This gives future editorial review a way to see whether a content calendar is building trust over time or simply repeating isolated posts. The engine stores dependencies between adjacent nodes and flags repeated theme clusters so future generation can intentionally continue a thread instead of accidentally recycling the same frame.

Current output:

```text
reports/content-strategy/narrative_continuity_report.md
```

## Audience-State Intelligence

Audience-state intelligence adapts planning to the likely reader relationship stage:

- cold;
- warming;
- engaged;
- trusting;
- considering_purchase;
- resistant;
- overwhelmed;
- returning_reader.

Each state has preferred content intents, preferred CTA types, a next-state recommendation, and a planning note. For example, cold audiences receive low-pressure, recognition-oriented content. Trusting audiences can receive soft sales, lead magnets, or objection-handling content. Overwhelmed audiences receive simpler therapeutic or educational content with low-pressure CTAs.

Current output:

```text
reports/content-strategy/audience_progression_report.md
```

## CTA Escalation Architecture

CTA progression is modeled separately from content intent. Supported CTA types:

- soft CTA;
- educational CTA;
- emotional CTA;
- consultation CTA;
- DM CTA;
- save/share CTA;
- trust CTA;
- low-pressure CTA.

The engine tracks distribution, repetition, fatigue risk, and escalation pacing across campaign stages. Consultation CTAs should appear only after enough trust-building and objection-handling content has prepared the audience.

Current output:

```text
reports/content-strategy/cta_distribution_report.md
```

## Anti-Repetition System

Anti-repetition intelligence detects repeated:

- hooks;
- emotional framing;
- storytelling structures;
- CTA patterns;
- expert themes;
- opening-line risk.

Warnings are advisory. They do not rewrite prompts or mutate generation behavior. Future generation systems can use these warnings to vary openings, CTAs, story structures, or emotional frames before content is created.

Current output:

```text
reports/content-strategy/repetition_detection_report.md
```

## Platform-Aware Planning

The planning layer supports platform and format-aware nodes:

- Instagram posts;
- Telegram longreads;
- Reels scripts;
- story sequences;
- carousel concepts;
- mini-series;
- FAQ threads.

Platform planning is still separate from final generation. The node's platform tells future orchestration which output policy and format to use, but the current layer does not render captions, scripts, longreads, or production-ready text.

The platform-aware plan is designed to sit upstream of existing local generation orchestration:

```text
campaign strategy
  -> content node
  -> future expert runtime resolver
  -> future retrieval/context assembly
  -> future generation orchestration
  -> future sandbox evaluation
  -> human review
```

No current live runtime consumes this plan.

## Autonomous Production Pipeline

The autonomous content production pipeline converts campaign plan nodes into structured multi-format content packs. It is a local production simulation layer only. It does not publish, schedule, post, deploy, mutate Telegram runtime, mutate indexes, ingest/promote data, or fine-tune models.

Current implementation:

- `scripts/content-production-pipeline.js`: reusable production simulation engine.
- `scripts/simulate-production-pipeline.js`: local runner that produces packs and reports.
- `schemas/content-production/`: JSON schemas for production packs, platform outputs, hooks, CTA variants, narrative sync, and structures.
- `reports/content-production/`: generated production reports.

Supported pipeline stages:

- strategy selection;
- context assembly;
- retrieval selection;
- voice injection;
- emotional alignment;
- CTA injection;
- hook generation;
- structure generation;
- platform adaptation;
- anti-repetition validation;
- hallucination-risk validation;
- output evaluation;
- packaging.

Each stage is simulated and traceable inside the production pack. The pipeline uses campaign nodes as the source of truth and records that all retrieval/context inputs are simulated local planning artifacts.

## Hook Intelligence System

Hook intelligence generates multiple hook variants per pack:

- emotional hooks;
- curiosity hooks;
- authority hooks;
- therapeutic hooks;
- pain-point hooks;
- controversial hooks;
- story hooks;
- short-form hooks;
- reels hooks.

The engine tracks hook fatigue, repetition, and predicted effectiveness. Hook warnings are advisory and are intended for future editorial review or sandbox comparison.

Current output:

```text
reports/content-production/hook_intelligence_report.md
```

## Platform Adaptation Layer

The platform adaptation layer creates structured adaptations for:

- Instagram;
- Telegram;
- Reels;
- Carousel;
- Stories.

For each format, the pack records ideal length, pacing, paragraph density, emotional rhythm, CTA placement, and readability. This does not render final publish-ready content. It creates structured artifacts that a future sandbox or human editor can inspect.

Current output:

```text
reports/content-production/platform_adaptation_report.md
```

## Narrative Synchronization

Narrative synchronization keeps multi-format outputs aligned with:

- cross-format continuity;
- consistent emotional tone;
- synchronized CTA escalation;
- synchronized audience progression;
- synchronized storytelling dependencies.

Each production pack records the previous pack relationship and the current emotional frame, audience state, CTA escalation level, and storytelling structure. This lets future campaign production maintain continuity across formats instead of producing disconnected single posts.

Current output:

```text
reports/content-production/narrative_sync_report.md
```

## Multi-Format Production

The production pipeline supports structured pack outputs for:

- `instagram_post`;
- `telegram_longread`;
- `reels_script`;
- `carousel_script`;
- `story_sequence`;
- `faq_answer`;
- `authority_post`;
- `emotional_story`;
- `sales_post`;
- `educational_post`;
- `consultation_cta_post`.

Each pack contains:

- main post artifact;
- title;
- hook variants;
- CTA variants;
- hashtag ideas;
- pinned comment ideas;
- story followups;
- carousel slide ideas;
- reels adaptation;
- short teaser versions.

These are local artifacts only. They are not sent to Telegram, Instagram, queues, schedulers, or production feeds.

## AI Suppression Engine

The AI suppression engine scans generated artifact blocks for generic AI phrasing, robotic motivational language, repetitive expert cliches, artificial empathy patterns, over-explaining, and corporate AI tone.

The current implementation removes detected generic phrases from local artifact blocks and records warnings. It does not rewrite live prompts, alter production generation, or mutate expert voice profiles.

Current output:

```text
reports/content-production/ai_suppression_report.md
```

## Production Quality Intelligence

Production quality scoring estimates:

- style similarity;
- emotional match;
- clarity;
- readability;
- expert authenticity;
- AI-generic risk;
- hallucination risk;
- CTA quality;
- engagement potential.

Scores are heuristic and local. They are designed to compare content pack quality before any future generation or publishing integration is considered.

Current output:

```text
reports/content-production/production_quality_report.md
```

## Analytics Intelligence Layer

The analytics intelligence layer analyzes simulated content performance from local production packs and extracts optimization insights. It is local-only and does not connect to real Telegram, Instagram, or social analytics APIs.

Current implementation:

- `scripts/content-analytics-engine.js`: reusable simulated analytics and optimization engine.
- `scripts/simulate-content-analytics.js`: local 30-day analytics runner.
- `schemas/content-analytics/`: schemas for engagement, hook performance, CTA analytics, audience transitions, optimization recommendations, and growth patterns.
- `reports/content-analytics/`: generated analytics reports.

The layer consumes local production pipeline packs and returns simulated engagement metrics, pattern analysis, decay warnings, growth signals, and recommendation artifacts.

## Engagement Simulation Engine

The engagement model simulates:

- views;
- saves;
- shares;
- comments;
- likes;
- retention;
- watch time;
- profile clicks;
- DM conversion;
- CTA conversion;
- consultation interest;
- carousel completion;
- reels completion.

Metrics are deterministic planning signals, not real performance data. They are used to test how future optimization loops may behave without connecting to live platforms.

## Hook Optimization Intelligence

Hook analytics tracks:

- hook effectiveness;
- emotional hook performance;
- curiosity hook performance;
- authority hook performance;
- short-form performance;
- retention by hook type;
- hook fatigue;
- hook decay over time.

The engine groups performance by selected hook type and recommends stronger opening patterns when retention signals are weak.

## CTA Analytics System

CTA analytics estimates:

- CTA conversion;
- CTA fatigue;
- CTA escalation success;
- consultation CTA effectiveness;
- emotional CTA effectiveness;
- soft CTA effectiveness;
- DM CTA effectiveness.

The recommendations focus on pacing, spacing high-intent CTAs, and alternating conversion asks with trust-building or educational CTAs.

## Audience Transition Intelligence

Audience transition analytics tracks movement such as:

- cold to warming;
- warming to engaged;
- engaged to trusting;
- trusting to consultation interest.

It flags friction points, drop-off zones, and emotional overload risk. Future strategy simulations can use these signals to add stabilizing educational or therapeutic content between high-pressure transitions.

## Growth Pattern Detection

Growth pattern intelligence detects:

- viral-like structures;
- high-retention structures;
- trust accelerators;
- authority amplifiers;
- conversion patterns;
- high-save patterns;
- high-share patterns.

These patterns are recommendation inputs for future strategy and production simulations. They do not automatically mutate prompts, rankings, posting schedules, or production feeds.

## Optimization Recommendation Engine

The recommendation engine generates optimization guidance for:

- hooks;
- CTA pacing;
- emotional framing;
- structure changes;
- topic prioritization;
- audience-state progression;
- platform adaptation;
- storytelling balance.

Recommendations remain local reports. Human review is required before any future strategy or generation policy changes.

## Central Cognitive Graph

The central cognitive graph layer adds persistent expert cognition modeling as a local-only simulation architecture. It is designed to sit above existing onboarding, retrieval, feedback, author voice, planning, production, and analytics intelligence without changing live generation or Telegram behavior.

Current implementation:

- `scripts/expert-cognitive-graph.js`: reusable deterministic cognition engine.
- `scripts/simulate-cognitive-graph.js`: 90-day local simulation and report generator.
- `schemas/cognitive-graph/`: JSON schemas for topic nodes, relationships, narrative memory, trust state, emotional cycles, CTA memory, audience memory, and full cognition state.
- `reports/cognitive-graph/`: generated cognition reports.

The graph tracks weighted topic relationships, semantic clusters, recurring themes, emotional associations, authority domains, trust-building domains, and conversion-driving domains. Topic distance, narrative proximity, and emotional overlap are exposed as scoring helpers for future offline evaluation.

## Long-Term Narrative Memory

Narrative memory tracks continuity across simulated months rather than individual isolated content pieces. It models:

- narrative arcs by topic cluster;
- story progression stages;
- recurring storytelling motifs;
- unresolved narrative threads;
- emotional callbacks;
- authority progression;
- audience journey continuity.

This enables future planning systems to ask whether a theme should be continued, resolved, cooled down, or reinforced. The current layer only writes reports and does not alter prompt construction, production generation, or publishing.

## Audience Memory Simulation

Audience memory estimates what the audience has already heard and how strongly concepts may be remembered. It tracks:

- heard topics;
- topic saturation;
- repetition probability;
- emotional fatigue placeholders;
- trust familiarity;
- novelty scoring;
- reinforcement opportunities.

The simulation is heuristic and deterministic. It is intended to make memory pressure visible before future content planning decisions, not to infer real audience state from platform APIs.

## Semantic Repetition Intelligence

Semantic repetition intelligence detects soft repetition across:

- concepts;
- hooks;
- framing patterns;
- CTA structures;
- emotional pacing;
- storytelling templates.

Warnings identify narrative redundancy, hook fatigue, repeated conversion structures, and concept overexposure. The detector is local and report-only; it does not rewrite content or suppress live generation.

## Trust Accumulation Engine

Trust accumulation models how expert credibility and audience familiarity might evolve through repeated content exposure. It tracks:

- authority growth;
- emotional trust growth;
- educational trust;
- vulnerability trust;
- consistency trust;
- audience familiarity;
- trust trajectory scoring;
- authority trajectory scoring.

These signals help future strategy layers pace educational authority, vulnerability, and conversion. They are not connected to real analytics or automated offer timing.

## Emotional Progression Intelligence

Emotional progression intelligence tracks emotional cycles and pacing risk across a simulated content calendar. It models:

- emotional overload risk;
- pacing balance;
- therapeutic depth progression;
- audience emotional saturation;
- calm-down or bridge-content needs.

The goal is to prevent repeated high-intensity posts from exhausting the audience while preserving therapeutic depth. Current outputs are recommendation reports only.

## Expert Identity Evolution

The identity evolution layer tracks how the expert's public positioning changes over time. It records:

- evolving expert positioning;
- dominant identity traits;
- authority archetype evolution;
- communication drift;
- voice consistency across months.

This creates an early warning system for identity drift, such as becoming too sales-oriented, too academic, too vague, or too emotionally heavy compared with the expert's intended voice.

## Cognitive Recommendation System

The cognitive recommendation engine produces local guidance for:

- narrative continuation;
- topic revisiting;
- emotional balancing;
- trust pacing;
- novelty injection;
- authority reinforcement;
- CTA cooldown;
- storytelling evolution;
- concept reinforcement.

Recommendations synthesize graph proximity, audience memory, repetition warnings, CTA pressure, emotional overload, trust trajectory, and unresolved narrative threads. They are planning artifacts only and require human review before any future operational integration.

## Content Decay Intelligence

Content decay intelligence detects:

- repetition fatigue;
- declining engagement patterns;
- stale CTA structures;
- overused emotional framing;
- authority saturation;
- audience desensitization.

Decay warnings help avoid overusing the same themes, CTAs, hooks, and emotional frames across future campaign batches.

## Current Limitations

- Classification is heuristic and deterministic; it does not use ML or OpenAI calls.
- `source_type` may require manual correction when filenames or folder placement are ambiguous.
- Metadata-aware scoring is implemented as a local reusable layer, but it is not yet wired into production retrieval or generation.
- Context assembly is implemented as a local reusable layer, but it is not yet wired into production retrieval or generation.
- Generation orchestration is implemented as a local reusable layer, but it is not yet wired into prompt rendering, OpenAI calls, production retrieval, or the live bot.
- The generation sandbox can execute local mock or optional local OpenAI runs, but it is not wired into production prompt generation or Telegram.
- Feedback memory is implemented as local analytics and recommendations only; it does not perform automatic self-improvement or production mutation.
- Author voice intelligence is implemented as local profile extraction and scoring only; it does not automatically adapt live prompts.
- Multi-expert runtime resolution is implemented as local reusable architecture only; it is not wired into Telegram, OpenAI generation, retrieval service routing, or production indexes.
- Content strategy intelligence is implemented as local campaign planning only; it is not wired into posting, scheduling, production generation, or Telegram/Instagram runtime behavior.
- Autonomous content production is implemented as local simulation artifacts only; it is not wired into live generation, production feeds, auto-posting, Telegram, Instagram, or deployment.
- Content analytics intelligence is simulated only; it does not connect to real social APIs, publish content, mutate live strategy, or change production behavior.
- Central cognitive graph and long-term memory intelligence are implemented as local simulation and report generation only; they do not mutate Telegram runtime, production generation, retrieval indexes, FAISS files, ingest/promote flows, deployment, or posting behavior.
- Suggested source weights are now encoded in the local scoring layer and should still be evaluated offline before live use.
- Production indexes are not mutated by this layer.
- Current detection uses lightweight path and content patterns, so edge cases should be reviewed in reports before retrieval behavior depends on them.

## Next: Generation Context Orchestration

The next architecture step is to evaluate how retrieval scoring and context assembly should feed a future generation context builder while keeping behavior explainable.

Future orchestration should:

- Use `source_type` weights as a prior for source quality.
- Boost or dampen chunks using `confidence_level`.
- Use `expert_signal_score` as a continuous scoring feature.
- Penalize or exclude unsafe/noisy files when `is_generation_safe` is false.
- Prefer `content_kind` based on user generation intent, such as educational posts, storytelling, FAQs, sales copy, or therapeutic-case explanations.
- Produce explainable retrieval and assembly traces that show which metadata features influenced ranking and context selection.
- Keep generation prompt construction separate from context assembly until evaluated offline.

Proposed source type weight table from the taxonomy report:

| source_type | suggested_weight |
| --- | ---: |
| approved_high_confidence | 1.00 |
| b17_article | 0.95 |
| website_vercel | 0.90 |
| approved_dataset | 0.85 |
| approved_medium_confidence | 0.78 |
| telegram_channel | 0.75 |
| raw_sample | 0.45 |
| questionnaire | 0.10 |
| unknown | 0.25 |

## Safety Constraints

This layer is intentionally local-first.

Current constraints:

- No Railway deploy.
- No production mutation.
- No FAISS or index mutation unless explicitly requested.
- No ingest or promote unless explicitly requested.
- No live Telegram behavior changes.
- No generation prompt changes.
- Metadata-aware retrieval behavior exists locally only and is not active in the live bot.

The layer currently writes metadata and reports only.
