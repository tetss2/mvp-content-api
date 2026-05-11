# Local Source Sorting Pipeline

This pipeline audits and classifies local knowledge-base materials without paid APIs, SaaS, OpenAI calls, n8n, or external services.

## Safety Rules

- `cleaned/` and `test-ingestion/` are skipped wherever they appear.
- Originals are never deleted.
- `classify_sources.py` only writes reports.
- `apply_sorting.py --apply` copies files into `sorted_sources/`; it does not move files.
- Existing files are never overwritten. Name conflicts get a `__1`, `__2`, ... suffix.
- Every apply run writes an operation log and rollback manifest in `reports/sorting_logs/`.

## Proposed Sorting Structure

```text
sorted_sources/
  originals/
  good/
  surveys/
  tests/
  exercises/
  bibliography/
  ocr_required/
  trash/
  unclear/
cleaned/          # protected, not touched by these scripts
test-ingestion/   # protected, not touched by these scripts
```

The current scripts copy directly into category folders under `sorted_sources/`. The `originals/` bucket is reserved for a later archival flow if you want a full mirrored copy of raw inputs.

## Commands

```bash
python scripts/audit_sources.py
python scripts/classify_sources.py --dry-run
python scripts/apply_sorting.py
python scripts/apply_sorting.py --apply
```

`python scripts/apply_sorting.py` without `--apply` creates only a planned operation log. Use `--apply` only after reviewing `reports/source_classification.csv`.

If `reports/source_classification.csv` is locked by Excel, `classify_sources.py` writes a fresh `reports/source_classification.pending.csv`. `apply_sorting.py` will use that pending report when it is newer than the main CSV.

## Reports

- `reports/source_audit.json`: folder counts, extension stats, file sizes, and likely books/tests/source docs.
- `reports/source_classification.csv`: main review table.
- `reports/source_classification.pending.csv`: fallback review table when the main CSV is locked.
- `reports/source_classification.json`: same classification data plus category counts.
- `reports/sorting_logs/*.json`: dry-run/apply logs and rollback manifests.

Each classification row includes:

- `path`
- `filename`
- `extension`
- `size`
- `line_count`
- `char_count`
- `detected_category`
- `confidence`
- `reasons`
- `recommended_action`
- `target_folder`
- `sha256`
- `duplicate_of`

## Categories

- `good_source`
- `book_theory`
- `article`
- `test`
- `questionnaire`
- `exercise`
- `bibliography`
- `ocr_required`
- `ocr_noise`
- `duplicate`
- `unclear`

## Classification Logic

The classifier is hybrid but fully local:

1. Rule-based signals:
   - regex keyword hits;
   - filename analysis;
   - numbered-list density;
   - document size;
   - duplicate SHA-256 hash detection.
2. Local heuristics:
   - explanatory/theory markers;
   - OCR noise score;
   - OCR-required detection for PDF scans or image-only PDFs;
   - bibliography markers;
   - test/questionnaire blocks;
   - exercise/practice markers;
   - unclear bucket when extraction or signals are weak.

PDF files without local text extraction are classified as `ocr_required` and copied to `sorted_sources/ocr_required/` only when `apply_sorting.py --apply` is used. They are not treated as trash or unclear. Legacy `.doc` files still require manual review unless a text conversion layer is added.

## Next Stage Architecture

Production cleaning should happen only after sorting review, and only for:

- `sorted_sources/good/`
- `book_theory` rows copied into `sorted_sources/good/`

Recommended next folders:

```text
cleaning_stage/
  accepted_chunks/
  rejected_chunks/
  cleaning_reports/
```

Rejected chunks should be preserved with reasons such as OCR noise, bibliography-only block, questionnaire/test block, duplicate chunk, or too-short fragment. This repository does not run production cleaning yet; the scripts only prepare the sorting layer.
