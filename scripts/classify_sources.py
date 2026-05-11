#!/usr/bin/env python3
"""
Rule-based local classifier for source materials.

No paid APIs, no SaaS, no file mutation. The script writes CSV/JSON reports with
recommended copy targets for a later explicit apply step.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports"
CSV_REPORT = REPORT_DIR / "source_classification.csv"
JSON_REPORT = REPORT_DIR / "source_classification.json"
PENDING_CSV_REPORT = REPORT_DIR / "source_classification.pending.csv"
PROTECTED_DIRS = {"cleaned", "test-ingestion"}
IGNORED_DIRS = {".git", "node_modules", "__pycache__"}
SCAN_ROOTS = ["sources", "kb"]
SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx", ".doc", ".pdf"}

CATEGORY_TO_TARGET = {
    "good_source": "sorted_sources/good",
    "book_theory": "sorted_sources/good",
    "article": "sorted_sources/good",
    "test": "sorted_sources/tests",
    "questionnaire": "sorted_sources/surveys",
    "exercise": "sorted_sources/exercises",
    "bibliography": "sorted_sources/bibliography",
    "ocr_required": "sorted_sources/ocr_required",
    "ocr_noise": "sorted_sources/trash",
    "duplicate": "sorted_sources/unclear",
    "unclear": "sorted_sources/unclear",
}

TEST_WORDS = re.compile(
    r"\b(test|тест|опросник|шкала|анкета|ключ|балл(?:ы|ов)?|интерпретац|"
    r"выберите|подсчитайте|обведите|вариант ответа|ответьте|суммируйте)\b",
    re.IGNORECASE,
)
QUESTIONNAIRE_WORDS = re.compile(
    r"\b(опросник|анкета|шкала|опрос|soi|сфж|сфм|сексуальная формула)\b",
    re.IGNORECASE,
)
EXERCISE_WORDS = re.compile(
    r"\b(упражнен\w*|практик\w*|задани\w*|дневник|самонаблюдени\w*|"
    r"запишите|сформулируйте|попробуйте|выполните)\b",
    re.IGNORECASE,
)
BIB_WORDS = re.compile(
    r"(список литературы|литература|bibliography|references|издательство|"
    r"doi|isbn|монография|учебное пособие)",
    re.IGNORECASE,
)
THEORY_WORDS = re.compile(
    r"\b(психотерап\w*|сексолог\w*|сексуальн\w*|отношени\w*|травм\w*|"
    r"тревог\w*|желани\w*|либидо|интимн\w*|клиническ\w*|исследован\w*)\b",
    re.IGNORECASE,
)
ARTICLE_WORDS = re.compile(r"\b(статья|article|исследование|обзор|заметка)\b", re.IGNORECASE)
BOOK_WORDS = re.compile(
    r"(книга|справочник|руководство|терапия|психотерапия|сексология|"
    r"женщина|мужчина|kaplan|яффе|наго[сз]ки|доморацк|святоч|стерн)",
    re.IGNORECASE,
)


def is_skipped(path: Path) -> bool:
    try:
        parts = set(path.relative_to(ROOT).parts)
    except ValueError:
        parts = set(path.parts)
    return bool(parts & (PROTECTED_DIRS | IGNORED_DIRS))


def iter_candidates() -> list[Path]:
    roots = [ROOT / name for name in SCAN_ROOTS if (ROOT / name).exists()]
    if not roots:
        roots = [ROOT]
    files: list[Path] = []
    for scan_root in roots:
        for dirpath, dirnames, filenames in os.walk(scan_root):
            dirnames[:] = [d for d in dirnames if d not in PROTECTED_DIRS and d not in IGNORED_DIRS]
            folder = Path(dirpath)
            if is_skipped(folder):
                continue
            for filename in filenames:
                path = folder / filename
                if path.suffix.lower() in SUPPORTED_EXTENSIONS and not is_skipped(path):
                    files.append(path)
    return sorted(files)


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_text(path: Path, limit: int = 1_000_000) -> tuple[str, list[str]]:
    ext = path.suffix.lower()
    warnings: list[str] = []
    if ext in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="ignore")[:limit], warnings
    if ext == ".docx":
        try:
            with zipfile.ZipFile(path) as archive:
                raw = archive.read("word/document.xml")
            root = ElementTree.fromstring(raw)
            namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            paragraphs = []
            for paragraph in root.findall(".//w:p", namespace):
                pieces = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
                if pieces:
                    paragraphs.append("".join(pieces))
            return "\n".join(paragraphs)[:limit], warnings
        except Exception as exc:  # noqa: BLE001 - report, do not fail a full batch
            warnings.append(f"docx_text_extract_failed:{exc.__class__.__name__}")
            return "", warnings
    warnings.append(f"text_extract_not_supported_for_{ext or 'no_ext'}")
    return "", warnings


def count(pattern: re.Pattern[str], value: str) -> int:
    return len(pattern.findall(value or ""))


def line_count(text: str) -> int:
    return text.count("\n") + 1 if text else 0


def numbered_items(text: str) -> int:
    return len(re.findall(r"(?m)^\s*(?:\d+[\).\:]|[а-яa-z][\).\:])\s+\S+", text, re.IGNORECASE))


def ocr_noise_score(text: str) -> float:
    if not text:
        return 0.0
    sample = text[:50_000]
    chars = len(sample)
    replacement = sample.count("\ufffd")
    letters = len(re.findall(r"[A-Za-zА-Яа-яЁё]", sample))
    very_short_lines = sum(1 for line in sample.splitlines() if 0 < len(line.strip()) <= 2)
    lines = max(1, sample.count("\n") + 1)
    non_text_ratio = 1 - (letters / max(chars, 1))
    short_line_ratio = very_short_lines / lines
    return min(1.0, non_text_ratio * 0.6 + short_line_ratio * 0.4 + min(0.4, replacement / max(chars, 1) * 10))


def classify(path: Path, text: str, duplicate: bool, warnings: list[str]) -> tuple[str, float, list[str]]:
    name = path.name.lower()
    full = f"{name}\n{text.lower()}"
    size = path.stat().st_size
    ext = path.suffix.lower()
    reasons: list[str] = []

    if duplicate:
        return "duplicate", 0.98, ["same SHA-256 hash as an earlier candidate"]

    test_hits = count(TEST_WORDS, full)
    questionnaire_hits = count(QUESTIONNAIRE_WORDS, full)
    exercise_hits = count(EXERCISE_WORDS, full)
    bib_hits = count(BIB_WORDS, full)
    theory_hits = count(THEORY_WORDS, full)
    article_hits = count(ARTICLE_WORDS, full)
    numbered = numbered_items(text)
    noise = ocr_noise_score(text)
    chars = len(text)
    bib_density = bib_hits / max(chars / 10_000, 1)

    if warnings:
        reasons.extend(warnings)

    if ext == ".pdf" and not text:
        return "ocr_required", 0.92, [
            *reasons,
            "scanned pdf or image-only pdf requires OCR before content classification",
        ]

    if "ocr_preprocessing_report" in name or "preprocessing_report" in name:
        return "unclear", 0.82, [*reasons, "pipeline report, not a source document"]

    if text and chars > 2_000 and noise >= 0.56 and theory_hits < 5:
        return "ocr_noise", round(0.75 + min(noise - 0.56, 0.2), 2), [*reasons, f"high OCR noise score={noise:.2f}"]

    if (bib_hits >= 8 and (chars < 25_000 or bib_density >= 7 or theory_hits < 8)) or (
        "литература" in name and bib_hits >= 2
    ):
        return "bibliography", min(0.95, 0.65 + bib_hits / 100), [
            *reasons,
            f"bibliography markers={bib_hits}",
            f"bibliography_density={bib_density:.2f}",
        ]

    if size >= 500 * 1024 and (BOOK_WORDS.search(name) or theory_hits >= 15):
        return "book_theory", 0.84, [*reasons, f"large theory document, theory markers={theory_hits}"]

    if re.search(r"(^|[_\-\s])(test|тест)([_\-\s\.]|$)", name):
        return "test", 0.86, [*reasons, "test marker in filename"]

    if questionnaire_hits >= 2 or (questionnaire_hits >= 1 and numbered >= 8):
        return "questionnaire", min(0.96, 0.66 + questionnaire_hits / 30 + min(numbered, 30) / 100), [
            *reasons,
            f"questionnaire markers={questionnaire_hits}",
            f"numbered_items={numbered}",
        ]

    if test_hits >= 4 or (test_hits >= 2 and numbered >= 10):
        return "test", min(0.95, 0.62 + test_hits / 40 + min(numbered, 40) / 120), [
            *reasons,
            f"test markers={test_hits}",
            f"numbered_items={numbered}",
        ]

    if exercise_hits >= 4 or (exercise_hits >= 2 and numbered >= 6):
        return "exercise", min(0.9, 0.6 + exercise_hits / 40), [*reasons, f"exercise markers={exercise_hits}"]

    if ext == ".pdf" and size >= 5 * 1024 * 1024:
        confidence = 0.82 if BOOK_WORDS.search(name) else 0.68
        return "book_theory", confidence, [*reasons, "large PDF treated as likely book/theory source"]

    if chars >= 8_000 and theory_hits >= 8:
        return "good_source", min(0.9, 0.62 + theory_hits / 100), [*reasons, f"explanatory/theory markers={theory_hits}"]

    if chars >= 1_500 and (article_hits >= 1 or theory_hits >= 4):
        return "article", min(0.84, 0.58 + (article_hits + theory_hits) / 80), [
            *reasons,
            f"article markers={article_hits}",
            f"theory markers={theory_hits}",
        ]

    if not text and ext == ".doc":
        return "unclear", 0.45, [*reasons, "no local text extraction available; classify after OCR/text conversion"]

    return "unclear", 0.5, [*reasons, "insufficient local signals"]


def action_for(category: str) -> str:
    if category == "duplicate":
        return "review_duplicate_do_not_ingest"
    if category == "ocr_required":
        return "copy_to_ocr_queue"
    if category in {"ocr_noise", "unclear"}:
        return "copy_for_manual_review"
    if category in {"good_source", "book_theory", "article"}:
        return "copy_to_source_bucket_then_prepare_cleaning"
    return "copy_to_specialized_bucket"


def build_rows() -> list[dict[str, Any]]:
    candidates = iter_candidates()
    seen_hashes: dict[str, Path] = {}
    rows: list[dict[str, Any]] = []

    for path in candidates:
        rel = path.relative_to(ROOT).as_posix()
        digest = file_hash(path)
        duplicate = digest in seen_hashes
        if not duplicate:
            seen_hashes[digest] = path
        text, warnings = read_text(path)
        category, confidence, reasons = classify(path, text, duplicate, warnings)
        target_folder = CATEGORY_TO_TARGET[category]
        rows.append(
            {
                "path": rel,
                "filename": path.name,
                "extension": path.suffix.lower() or "<no_ext>",
                "size": path.stat().st_size,
                "line_count": line_count(text),
                "char_count": len(text),
                "detected_category": category,
                "confidence": f"{confidence:.2f}",
                "reasons": " | ".join(reasons),
                "recommended_action": action_for(category),
                "target_folder": target_folder,
                "sha256": digest,
                "duplicate_of": seen_hashes[digest].relative_to(ROOT).as_posix() if duplicate else "",
            }
        )
    return rows


def write_reports(rows: list[dict[str, Any]], dry_run: bool) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    fields = [
        "path",
        "filename",
        "extension",
        "size",
        "line_count",
        "char_count",
        "detected_category",
        "confidence",
        "reasons",
        "recommended_action",
        "target_folder",
        "sha256",
        "duplicate_of",
    ]
    summary: dict[str, int] = defaultdict(int)
    for row in rows:
        summary[row["detected_category"]] += 1
    JSON_REPORT.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "root": str(ROOT),
                "dry_run": dry_run,
                "protected_dirs_skipped": sorted(PROTECTED_DIRS),
                "category_counts": dict(sorted(summary.items())),
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    csv_path = CSV_REPORT
    try:
        with CSV_REPORT.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    except PermissionError:
        csv_path = PENDING_CSV_REPORT
        with PENDING_CSV_REPORT.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
        print(f"Warning: {CSV_REPORT} is locked. Wrote fresh CSV to {PENDING_CSV_REPORT}")
    return csv_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Classify local source documents without external APIs.")
    parser.add_argument("--dry-run", action="store_true", help="Only write reports. This is the default behavior.")
    args = parser.parse_args()

    rows = build_rows()
    csv_path = write_reports(rows, dry_run=True)

    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        counts[row["detected_category"]] += 1
    print(f"Classified {len(rows)} source candidates. No files were moved or copied.")
    print(f"CSV report: {csv_path}")
    print(f"JSON report: {JSON_REPORT}")
    for category, total in sorted(counts.items()):
        print(f"  {category}: {total}")
    if not args.dry_run:
        print("Note: classification is report-only; use scripts/apply_sorting.py --apply to copy files.")


if __name__ == "__main__":
    main()
