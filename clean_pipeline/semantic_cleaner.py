#!/usr/bin/env python3
"""Semantic cleaning entrypoint for sorted source documents."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parent))
    from block_classifier import ClassifiedBlock, classify_blocks  # type: ignore
    from io_utils import iter_input_files, read_source_text, write_json  # type: ignore
    from section_detector import build_blocks  # type: ignore
    from text_normalizer import normalize_for_cleaning  # type: ignore
else:
    from .block_classifier import ClassifiedBlock, classify_blocks
    from .io_utils import iter_input_files, read_source_text, write_json
    from .section_detector import build_blocks
    from .text_normalizer import normalize_for_cleaning


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports"
DRY_RUN_JSON = REPORT_DIR / "cleaning_dry_run.json"
DRY_RUN_CSV = REPORT_DIR / "cleaning_dry_run.csv"
APPLY_JSON = REPORT_DIR / "cleaning_apply.json"
APPLY_CSV = REPORT_DIR / "cleaning_apply.csv"
CLEANED_ROOT = ROOT / "cleaned_corpus" / "good"
REJECTED_ROOT = ROOT / "rejected_blocks" / "good"


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def reassemble(blocks: list[ClassifiedBlock]) -> str:
    kept = [block.text.strip() for block in blocks if block.action == "keep" and block.text.strip()]
    return "\n\n".join(kept).strip()


def confidence_for(blocks: list[ClassifiedBlock]) -> float:
    if not blocks:
        return 0.0
    weighted = sum(block.confidence * max(block.char_count, 1) for block in blocks)
    total = sum(max(block.char_count, 1) for block in blocks)
    return round(weighted / total, 2)


def sample_blocks(blocks: list[ClassifiedBlock], action: str, limit: int = 5) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for block in blocks:
        if block.action != action:
            continue
        if action == "keep" and block.label not in {"keep_theory", "keep_clinical", "keep_narrative"}:
            continue
        selected.append(
            {
                "label": block.label,
                "confidence": block.confidence,
                "char_count": block.char_count,
                "reasons": block.reasons,
                "preview": block.preview(),
            }
        )
        if len(selected) >= limit:
            break
    return selected


def process_file(path: Path, input_dir: Path, include_payload: bool = False) -> dict[str, Any]:
    raw_text, read_warnings = read_source_text(path)
    chars_before = len(raw_text)
    normalized_text, normalization_stats = normalize_for_cleaning(raw_text)
    raw_blocks = build_blocks(normalized_text)
    classified = classify_blocks(raw_blocks)
    cleaned_text = reassemble(classified)
    rejected = [block for block in classified if block.action == "reject"]
    kept = [block for block in classified if block.action == "keep"]
    review = [block for block in classified if block.label == "review_unclear"]

    removed_categories = Counter(block.label for block in rejected)
    kept_categories = Counter(block.label for block in kept)
    warnings = list(read_warnings)
    if not raw_text:
        warnings.append("empty_or_unreadable_source")
    if review:
        warnings.append(f"review_unclear_blocks:{len(review)}")
    if chars_before and len(cleaned_text) / chars_before < 0.35:
        warnings.append("large_removal_ratio_review_recommended")

    cleaned_rel = f"cleaned_corpus/good/{path.stem}.cleaned.txt"
    metadata_rel = f"cleaned_corpus/good/{path.stem}.metadata.json"
    rejected_rel = f"rejected_blocks/good/{path.stem}.rejected.jsonl"
    report: dict[str, Any] = {
        "original_path": relative(path),
        "relative_input_path": path.relative_to(input_dir).as_posix(),
        "planned_cleaned_path": cleaned_rel,
        "planned_metadata_path": metadata_rel,
        "planned_rejected_blocks_path": rejected_rel,
        "cleaned_path": cleaned_rel,
        "metadata_path": metadata_rel,
        "rejected_blocks_path": rejected_rel,
        "chars_before": chars_before,
        "chars_after": len(cleaned_text),
        "blocks_total": len(classified),
        "kept_blocks_count": len(kept),
        "rejected_blocks_count": len(rejected),
        "removed_sections_count": len(rejected),
        "review_unclear_blocks_count": len(review),
        "cleaning_confidence": confidence_for(classified),
        "categories_removed": dict(sorted(removed_categories.items())),
        "categories_kept": dict(sorted(kept_categories.items())),
        "normalization": normalization_stats,
        "warnings": warnings,
        "removed_examples": sample_blocks(classified, "reject", limit=5),
        "kept_theory_examples": sample_blocks(classified, "keep", limit=5),
    }
    if include_payload:
        report["_cleaned_text"] = cleaned_text
        report["_rejected_blocks"] = [
            {
                "file": relative(path),
                "block_index": block.index,
                "label": block.label,
                "confidence": block.confidence,
                "reasons": block.reasons,
                "char_count": block.char_count,
                "text": block.text,
            }
            for block in rejected
        ]
    return report


def public_report(report: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in report.items() if not key.startswith("_")}


def write_csv(file_reports: list[dict[str, Any]], csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "original_path",
        "chars_before",
        "chars_after",
        "blocks_total",
        "kept_blocks_count",
        "rejected_blocks_count",
        "review_unclear_blocks_count",
        "cleaning_confidence",
        "categories_removed",
        "warnings",
    ]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for report in file_reports:
            writer.writerow({field: report.get(field, "") for field in fields})


def build_summary(file_reports: list[dict[str, Any]], input_dir: Path, mode: str) -> dict[str, Any]:
    removed_counter: Counter[str] = Counter()
    kept_counter: Counter[str] = Counter()
    warnings: list[str] = []
    for report in file_reports:
        removed_counter.update(report["categories_removed"])
        kept_counter.update(report["categories_kept"])
        warnings.extend(f"{report['original_path']}: {warning}" for warning in report["warnings"])

    removed_examples: list[dict[str, Any]] = []
    kept_examples: list[dict[str, Any]] = []
    for report in file_reports:
        for example in report["removed_examples"]:
            removed_examples.append({"file": report["original_path"], **example})
            if len(removed_examples) >= 5:
                break
        if len(removed_examples) >= 5:
            break
    for report in file_reports:
        for example in report["kept_theory_examples"]:
            kept_examples.append({"file": report["original_path"], **example})
            if len(kept_examples) >= 5:
                break
        if len(kept_examples) >= 5:
            break

    chars_before = sum(report["chars_before"] for report in file_reports)
    chars_after = sum(report["chars_after"] for report in file_reports)
    blocks_removed = sum(report["rejected_blocks_count"] for report in file_reports)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "input_dir": relative(input_dir),
        "files_processed": len(file_reports),
        "chars_before": chars_before,
        "chars_after": chars_after,
        "chars_removed": chars_before - chars_after,
        "blocks_removed": blocks_removed,
        "removed_categories": dict(removed_counter.most_common()),
        "kept_categories": dict(kept_counter.most_common()),
        "removed_examples": removed_examples,
        "kept_theory_examples": kept_examples,
        "warnings": warnings,
        "files": [public_report(report) for report in file_reports],
        "schemas": {
            "metadata": {
                "original_path": "string",
                "cleaned_path": "string",
                "rejected_blocks_path": "string",
                "chars_before": "integer",
                "chars_after": "integer",
                "removed_sections_count": "integer",
                "kept_blocks_count": "integer",
                "rejected_blocks_count": "integer",
                "cleaning_confidence": "float",
                "warnings": "array[string]",
                "categories_removed": "object[string, integer]",
            },
            "rejected_block": {
                "file": "string",
                "block_index": "integer",
                "label": "string",
                "confidence": "float",
                "reasons": "array[string]",
                "text": "string",
            },
        },
    }


def print_summary(summary: dict[str, Any]) -> None:
    if summary["mode"] == "apply":
        print(f"Apply complete. Files processed: {summary['files_processed']}")
        print(f"Rejected blocks saved: {summary['blocks_removed']}")
    else:
        print(f"Dry-run complete. Files processed: {summary['files_processed']}")
        print(f"Blocks that would be removed: {summary['blocks_removed']}")
    print(f"Chars before/after: {summary['chars_before']} -> {summary['chars_after']}")
    print("Removed categories:")
    for category, count in summary["removed_categories"].items():
        print(f"  {category}: {count}")
    if summary["mode"] == "apply":
        print(f"Report JSON: {APPLY_JSON}")
        print(f"Report CSV: {APPLY_CSV}")
        print(f"Cleaned corpus: {CLEANED_ROOT}")
        print(f"Rejected blocks: {REJECTED_ROOT}")
    else:
        print(f"Report JSON: {DRY_RUN_JSON}")
        print(f"Report CSV: {DRY_RUN_CSV}")


def write_apply_outputs(file_reports: list[dict[str, Any]]) -> None:
    CLEANED_ROOT.mkdir(parents=True, exist_ok=True)
    REJECTED_ROOT.mkdir(parents=True, exist_ok=True)
    for report in file_reports:
        cleaned_path = ROOT / report["cleaned_path"]
        metadata_path = ROOT / report["metadata_path"]
        rejected_path = ROOT / report["rejected_blocks_path"]

        cleaned_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        rejected_path.parent.mkdir(parents=True, exist_ok=True)

        cleaned_path.write_text(report["_cleaned_text"], encoding="utf-8")
        metadata = public_report(report)
        metadata["generated_at"] = datetime.now(timezone.utc).isoformat()
        metadata["mode"] = "apply"
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        with rejected_path.open("w", encoding="utf-8") as handle:
            for block in report["_rejected_blocks"]:
                handle.write(json.dumps(block, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic cleaning for sorted good sources.")
    parser.add_argument("--input", required=True, help="Input folder, usually sorted_sources/good")
    parser.add_argument("--dry-run", action="store_true", help="Run analysis and write reports only.")
    parser.add_argument("--apply", action="store_true", help="Write cleaned corpus, metadata, and rejected blocks.")
    args = parser.parse_args()

    if args.dry_run == args.apply:
        raise SystemExit("Choose exactly one mode: --dry-run or --apply.")

    input_dir = (ROOT / args.input).resolve() if not Path(args.input).is_absolute() else Path(args.input)
    if not input_dir.exists():
        raise SystemExit(f"Input folder not found: {input_dir}")

    files = iter_input_files(input_dir)
    file_reports = [process_file(path, input_dir, include_payload=args.apply) for path in files]
    mode = "apply" if args.apply else "dry-run"
    if args.apply:
        write_apply_outputs(file_reports)
    summary = build_summary(file_reports, input_dir, mode=mode)
    if args.apply:
        write_json(APPLY_JSON, summary)
        write_csv(file_reports, APPLY_CSV)
    else:
        write_json(DRY_RUN_JSON, summary)
        write_csv(file_reports, DRY_RUN_CSV)
    print_summary(summary)


if __name__ == "__main__":
    main()
