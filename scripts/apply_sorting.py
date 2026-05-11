#!/usr/bin/env python3
"""
Apply the local source sorting plan by copying files only.

Safety properties:
- requires --apply;
- never deletes originals;
- skips protected folders;
- never overwrites existing files;
- writes an operation log and rollback manifest.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPORT_CSV = ROOT / "reports" / "source_classification.csv"
PENDING_REPORT_CSV = ROOT / "reports" / "source_classification.pending.csv"
LOG_DIR = ROOT / "reports" / "sorting_logs"
PROTECTED_DIRS = {"cleaned", "test-ingestion"}


def is_protected(path: Path) -> bool:
    try:
        parts = set(path.relative_to(ROOT).parts)
    except ValueError:
        parts = set(path.parts)
    return bool(parts & PROTECTED_DIRS)


def unique_target(target_dir: Path, filename: str) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    candidate = target_dir / filename
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    suffix = candidate.suffix
    counter = 1
    while True:
        next_candidate = target_dir / f"{stem}__{counter}{suffix}"
        if not next_candidate.exists():
            return next_candidate
        counter += 1


def resolve_plan_path() -> Path:
    if PENDING_REPORT_CSV.exists() and (
        not REPORT_CSV.exists() or PENDING_REPORT_CSV.stat().st_mtime > REPORT_CSV.stat().st_mtime
    ):
        return PENDING_REPORT_CSV
    if REPORT_CSV.exists():
        return REPORT_CSV
    raise SystemExit(f"Missing classification report: {REPORT_CSV}. Run scripts/classify_sources.py first.")


def read_plan() -> tuple[Path, list[dict[str, str]]]:
    plan_path = resolve_plan_path()
    with plan_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return plan_path, list(csv.DictReader(handle))


def apply_plan(rows: list[dict[str, str]], apply: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    operations: list[dict[str, Any]] = []
    rollback: list[dict[str, Any]] = []

    for row in rows:
        source = (ROOT / row["path"]).resolve()
        target_folder = (ROOT / row["target_folder"]).resolve()
        status = "planned"
        message = ""

        if not source.exists():
            status = "skipped"
            message = "source_missing"
        elif is_protected(source) or is_protected(target_folder):
            status = "skipped"
            message = "protected_path"
        elif row["detected_category"] == "duplicate":
            status = "skipped"
            message = "duplicate_review_only"
        else:
            target = unique_target(target_folder, source.name)
            if apply:
                shutil.copy2(source, target)
                status = "copied"
                rollback.append(
                    {
                        "action": "delete_copied_file",
                        "target": target.relative_to(ROOT).as_posix(),
                        "source": source.relative_to(ROOT).as_posix(),
                    }
                )
            message = "copy_file"
            operations.append(
                {
                    "status": status,
                    "message": message,
                    "source": source.relative_to(ROOT).as_posix(),
                    "target": target.relative_to(ROOT).as_posix(),
                    "category": row["detected_category"],
                    "confidence": row["confidence"],
                }
            )
            continue

        operations.append(
            {
                "status": status,
                "message": message,
                "source": row["path"],
                "target": "",
                "category": row["detected_category"],
                "confidence": row["confidence"],
            }
        )

    return operations, rollback


def write_logs(operations: list[dict[str, Any]], rollback: list[dict[str, Any]], apply: bool) -> tuple[Path, Path]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    op_log = LOG_DIR / f"sorting_operations_{timestamp}.json"
    rollback_manifest = LOG_DIR / f"rollback_manifest_{timestamp}.json"
    op_log.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "apply": apply,
                "operations": operations,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    rollback_manifest.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "note": "Rollback means deleting copied targets listed here. Originals were not changed.",
                "entries": rollback,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return op_log, rollback_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy classified sources into sorted folders.")
    parser.add_argument("--apply", action="store_true", help="Actually copy files. Without this flag only a plan is logged.")
    args = parser.parse_args()

    plan_path, rows = read_plan()
    operations, rollback = apply_plan(rows, apply=args.apply)
    op_log, rollback_manifest = write_logs(operations, rollback, apply=args.apply)
    copied = sum(1 for item in operations if item["status"] == "copied")
    planned = sum(1 for item in operations if item["status"] == "planned")
    skipped = sum(1 for item in operations if item["status"] == "skipped")

    if args.apply:
        print(f"Copied files: {copied}")
    else:
        print("Dry run only. Add --apply to copy files.")
        print(f"Planned copies: {planned}")
    print(f"Plan used: {plan_path}")
    print(f"Skipped: {skipped}")
    print(f"Operation log: {op_log}")
    print(f"Rollback manifest: {rollback_manifest}")


if __name__ == "__main__":
    main()
