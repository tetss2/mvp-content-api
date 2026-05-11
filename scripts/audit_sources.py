#!/usr/bin/env python3
"""
Local source audit for the RAG knowledge base.

This script is intentionally read-only. It skips protected folders and writes a
JSON report with folder, extension, size, and heuristic source hints.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "reports" / "source_audit.json"
PROTECTED_DIRS = {"cleaned", "test-ingestion"}
IGNORED_DIRS = {".git", "node_modules", "__pycache__"}
SCAN_ROOTS = ["sources", "kb"]
TEXT_EXTENSIONS = {".txt", ".md"}
DOC_EXTENSIONS = {".txt", ".md", ".docx", ".doc", ".pdf"}

TEST_WORDS = re.compile(
    r"\b(тест|опросник|шкала|анкета|ключ|балл(?:ы|ов)?|интерпретац|"
    r"выберите|подсчитайте|вариант ответа|ответьте)\b",
    re.IGNORECASE,
)
BIB_WORDS = re.compile(
    r"(список литературы|литература|bibliography|references|издательство|"
    r"doi|isbn)",
    re.IGNORECASE,
)
EXERCISE_WORDS = re.compile(
    r"\b(упражнен\w*|практик\w*|задани\w*|дневник|самонаблюдени\w*|"
    r"запишите|сформулируйте)\b",
    re.IGNORECASE,
)
BOOK_NAME_WORDS = re.compile(
    r"(книга|справочник|руководство|терапия|психотерапия|сексология|"
    r"женщина|мужчина|kaplan|яффе|наго[сз]ки|доморацк)",
    re.IGNORECASE,
)


def is_skipped(path: Path) -> bool:
    parts = set(path.relative_to(ROOT).parts) if path.is_relative_to(ROOT) else set(path.parts)
    return bool(parts & (PROTECTED_DIRS | IGNORED_DIRS))


def iter_files() -> list[Path]:
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
                if not is_skipped(path):
                    files.append(path)
    return sorted(files)


def sample_text(path: Path, max_chars: int = 200_000) -> str:
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:max_chars]
    except OSError:
        return ""


def text_stats(text: str) -> dict[str, int]:
    if not text:
        return {"line_count": 0, "char_count": 0}
    return {"line_count": text.count("\n") + 1, "char_count": len(text)}


def numbered_count(text: str) -> int:
    return len(re.findall(r"(?m)^\s*(?:\d+[\).\:]|[а-яa-z][\).\:])\s+\S+", text, re.IGNORECASE))


def hint_for(path: Path, text: str) -> tuple[str, list[str]]:
    name = path.name.lower()
    ext = path.suffix.lower()
    size = path.stat().st_size
    reasons: list[str] = []

    test_hits = len(TEST_WORDS.findall(text)) + len(TEST_WORDS.findall(name))
    bib_hits = len(BIB_WORDS.findall(text)) + len(BIB_WORDS.findall(name))
    exercise_hits = len(EXERCISE_WORDS.findall(text)) + len(EXERCISE_WORDS.findall(name))
    numbered = numbered_count(text)

    if test_hits >= 3 or (test_hits >= 1 and numbered >= 15):
        reasons.append(f"test/questionnaire markers={test_hits}, numbered_items={numbered}")
        return "test_or_questionnaire", reasons
    if bib_hits >= 5 or "литература" in name:
        reasons.append(f"bibliography markers={bib_hits}")
        return "bibliography_like", reasons
    if exercise_hits >= 3:
        reasons.append(f"exercise markers={exercise_hits}")
        return "exercise_like", reasons
    if ext == ".pdf" and size >= 5 * 1024 * 1024:
        reasons.append("large PDF, likely a book or scanned book")
        return "book_like", reasons
    if BOOK_NAME_WORDS.search(name) and size >= 300 * 1024:
        reasons.append("book/theory words in filename and substantial size")
        return "book_like", reasons
    if ext in DOC_EXTENSIONS and size >= 20 * 1024:
        reasons.append("document-sized source candidate")
        return "source_doc_like", reasons
    if ext in DOC_EXTENSIONS:
        reasons.append("small document candidate")
        return "small_source_or_unclear", reasons
    return "non_source_or_unclear", reasons


def main() -> None:
    files = iter_files()
    folder_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"file_count": 0, "size_bytes": 0})
    extension_stats: Counter[str] = Counter()
    extension_sizes: Counter[str] = Counter()
    candidates: list[dict[str, Any]] = []

    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        size = path.stat().st_size
        folder = path.parent.relative_to(ROOT).as_posix()
        ext = path.suffix.lower() or "<no_ext>"
        text = sample_text(path)
        stats = text_stats(text)
        hint, reasons = hint_for(path, text)

        folder_stats[folder]["file_count"] += 1
        folder_stats[folder]["size_bytes"] += size
        extension_stats[ext] += 1
        extension_sizes[ext] += size

        if ext in DOC_EXTENSIONS:
            candidates.append(
                {
                    "path": rel,
                    "filename": path.name,
                    "extension": ext,
                    "size_bytes": size,
                    "size_kb": round(size / 1024, 1),
                    **stats,
                    "hint": hint,
                    "reasons": reasons,
                }
            )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(ROOT),
        "protected_dirs_skipped": sorted(PROTECTED_DIRS),
        "scan_roots": [name for name in SCAN_ROOTS if (ROOT / name).exists()],
        "summary": {
            "total_files_scanned": len(files),
            "document_candidates": len(candidates),
            "total_size_bytes": sum(path.stat().st_size for path in files),
        },
        "folders": [
            {"path": key, **value, "size_kb": round(value["size_bytes"] / 1024, 1)}
            for key, value in sorted(folder_stats.items())
        ],
        "extensions": [
            {
                "extension": ext,
                "file_count": count,
                "size_bytes": extension_sizes[ext],
                "size_kb": round(extension_sizes[ext] / 1024, 1),
            }
            for ext, count in extension_stats.most_common()
        ],
        "likely_books": [item for item in candidates if item["hint"] == "book_like"],
        "likely_tests_or_questionnaires": [
            item for item in candidates if item["hint"] == "test_or_questionnaire"
        ],
        "likely_useful_source_docs": [
            item for item in candidates if item["hint"] in {"source_doc_like", "book_like"}
        ],
        "all_document_candidates": candidates,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Audit complete: {len(files)} files scanned")
    print(f"Document candidates: {len(candidates)}")
    print(f"Report written: {REPORT_PATH}")
    print("Top extensions:")
    for row in report["extensions"][:8]:
        print(f"  {row['extension']}: {row['file_count']} files, {row['size_kb']} KB")


if __name__ == "__main__":
    main()
