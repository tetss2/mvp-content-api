# Runtime Prompt Assembly Report

Generated: 2026-05-14T15:05:40.527Z

Local-only constraints: `local_only`, `no_deploy`, `no_telegram_runtime_mutation`, `no_auto_posting`, `no_railway_deploy`, `no_external_apis`, `no_faiss_or_index_mutation`, `no_ingest_or_promote`, `no_production_database_migration`, `no_production_publishing`, `adapter_mode=local_prompt_assembly_dry_run`, `llm_execution_disabled`, `identity_engine_admin_only`, `identity_engine_local_only`, `campaign_memory_admin_only`, `campaign_memory_local_only`, `strategic_brain_admin_only`, `strategic_brain_local_only`, `editorial_director_admin_only`, `editorial_director_local_only`.

## Prompt Assembly Status

- Real local assembly used for every request: `true`
- Mock content generation used: `false`
- LLM execution mode: `dry_run_prompt_only`

## Per-Run Prompt Metrics

- short-instagram-post: 6145 chars, 2 messages, prompt score 0.855, context 4.
- normal-telegram-post: 6960 chars, 2 messages, prompt score 0.855, context 5.
- long-article-mode: 6144 chars, 2 messages, prompt score 0.855, context 4.
- direct-faq-answer: 6146 chars, 2 messages, prompt score 0.855, context 4.
- soft-sales-consultation: 6989 chars, 2 messages, prompt score 0.83, context 5.

## Example Config Payload

```json
{
  "llmExecutionMode": "dry_run_prompt_only",
  "intended_provider": "openai-compatible-chat",
  "intended_model": "gpt-4o-mini",
  "temperature": 0.65,
  "max_tokens": 700,
  "language": "ru",
  "platform": "instagram",
  "format": "post",
  "length_mode": "short",
  "tone_mode": "expert_warm",
  "cta_style": "soft",
  "production_execution_allowed": false,
  "external_api_calls_allowed": false,
  "telegram_delivery_allowed": false,
  "safety_boundaries": {
    "no_diagnosis": true,
    "no_guaranteed_outcomes": true,
    "no_private_case_details": true,
    "no_suppressed_context": true,
    "no_internal_trace_leakage": true
  }
}
```

## Example Assembled Prompt Preview

```text
# Generation Task
Короткий пост о тревоге в отношениях

# Strategy
Intent=educational_post. Goal: Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.. Recommended structure: hook -> problem framing -> expert explanation -> example -> soft CTA. CTA strategy: Soft invitation to reflect, save, comment, or book a consultation when appropriate..

# Output Constraints
Platform=instagram; length=short; format=post; CTA=soft; language=ru. This is a planning blueprint, not final generated text.

# Context Injection Rules
- Use primary context for factual grounding and main expert position.
- Use supporting context for nuance, objections, examples, or secondary angles.
- Use tone/style context only to influence rhythm, warmth, and framing.
- Do not copy long source fragments; quote only short fragments when attribution or wording matters.
- Do not use unsafe, suppressed, questionnaire, noisy, or low-score items as generation grounding.
- Prefer synthesized output over paraphrase.
- Keep retrieval_trace and assembly_trace available for debugging, not for reader-facing text.

# Curated Context
### Primary context: Введение в сексологию.cleaned.txt
- id: fb5785f1c1a1b181176c33dd84d1c8301852c61a59755966f137d4eef00e02ae
- source_type: approved_high_confidence
- content_kind: educational
- confidence: high

Введение в сексологию Доктор мед. наук, профессор В. А. Доморацкий Секс и сексуальность В повседневной жизни слово «секс» в последнее время часто используют для обозначения полового акта («заниматься сексом»). Но сексуальность — больше, чем просто секс и способность человека к эр

### Primary context: Нарушение_оргазма_у_женщин_и_их_коррекция_.cleaned.txt
- id: f6c5f124626e1532e64f2bed0be500b4a2c19d6e001436393f51f4d99dd49145
- source_type: approved_high_confidence
- content_kind: educational
- confidence: high

Нарушения оргазма у женщин и их коррекция Доктор медицинских наук, профессор В. А. Доморацкий Оргазм Физиологически оргазм представляет собой избавление от нарастающих в процессе сексуального возбуждения мышечного напряжения и переполнения кровью гениталий (миотонии и вазокогнест

### Supporting context: секс дисф. начало (през).cleaned.txt
- id: 31919f7d420f72e2ee1fa71f37c2b7169dd35c384e8b78eed1f6169064edcf10
- source_type: approved_high_confidence
- content_kind: therapeutic_case
- confidence: high

Мужские сексуальные дисфункции и их психотерапия Доктор медицинских наук, профессор В. А. Доморацкий Авторская модель интегративной психотерапии сексуальных дисфункций наиболее полно была представлена нами в докторской диссертации (2004) и книге «Медицинская сексология и психотер

### Supporting context: Стыд и секс.cleaned.txt
- id: f52a96dcc3478cf45881dfdc96ad62249b1c89adeff9d3ea82e76d33a0eb13a1
- source_type: approved_dataset
- content_kind: faq
- confidence: high

Стыд, вина и сексДоктор медицинских наук, профессор В. А. Доморацкий Вина реальная и невротическая Вина - это чувство, которое испытывает человек, думая о чем-то, что он совершил или чего не совершал, как о проступке, достойном порицания: Женщина чувствует себя виноватой за то, ч

No tone/style context selected.

# Safety
Avoid: excessive jargon, diagnosis, fearmongering, guaranteed outcomes, copying long source fragments. Do not diagnose, shame, fearmonger, copy long fragments, or use unsafe/suppressed material. Refer to a specialist when appropriate.

# Produce Final Draft
Write the requested expert conten
```
