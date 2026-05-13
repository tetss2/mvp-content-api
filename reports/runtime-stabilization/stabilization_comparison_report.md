# Runtime Stabilization Comparison Report

Generated: 2026-05-13T19:49:46.881Z

## Summary

- Runs: 10
- Runtime mode: local admin preview, dry_run_prompt_only
- Average quality before: 0.753
- Average quality after: 0.831
- Production generation changed: NO
- External API usage: NO

## Before vs After

| Run | Quality Before | Quality After | Voice Before | Voice After | CTA Before | CTA After | Generic Before | Generic After |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| relationship-anxiety | 0.77 | 0.847 | 0.692 | 0.772 | 0.08 | 0 | 0.28 | 0.14 |
| emotional-dependency | 0.745 | 0.822 | 0.692 | 0.772 | 0.08 | 0 | 0.42 | 0.28 |
| sexuality-myths | 0.77 | 0.847 | 0.692 | 0.772 | 0.08 | 0 | 0.28 | 0.14 |
| shame-and-desire | 0.759 | 0.836 | 0.638 | 0.718 | 0.08 | 0 | 0.28 | 0.14 |
| boundaries-intimacy | 0.721 | 0.804 | 0.692 | 0.772 | 0.26 | 0.14 | 0.42 | 0.28 |
| body-safety | 0.776 | 0.854 | 0.71 | 0.79 | 0.08 | 0 | 0.28 | 0.14 |
| avoidance-close | 0.745 | 0.822 | 0.692 | 0.772 | 0.08 | 0 | 0.42 | 0.28 |
| conflict-after-sex | 0.755 | 0.833 | 0.62 | 0.7 | 0.08 | 0 | 0.28 | 0.14 |
| low-desire | 0.77 | 0.847 | 0.692 | 0.772 | 0.08 | 0 | 0.28 | 0.14 |
| consultation-soft | 0.716 | 0.799 | 0.692 | 0.772 | 0.295 | 0.175 | 0.42 | 0.28 |

## Remaining Weak Areas

- Scores are deterministic preview heuristics; real generated drafts still need separate review.
- Prompt stabilization is guidance-only and intentionally not wired to public generation.
- Some voice profile source files contain noisy encoded samples, so confidence remains bounded.

## What Still Blocks Real Runtime Execution

- No real LLM output has been validated against these constraints.
- Telegram delivery, Markdown limits, and human approval are not integrated with runtime output.
- Production rollout needs a feature flag, rollback plan, and admin approval workflow.
