#!/usr/bin/env python3
"""Corpus stabilization pass before embeddings.

Default workflow is dry-run. It plans paragraph restoration, duplicate routing,
structural tail cleanup, and form/card separation without touching originals,
sorted_sources, or existing cleaned files.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parent))


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "cleaned_corpus" / "good"
REPORT_JSON = ROOT / "reports" / "stabilization_report.json"
REPORT_CSV = ROOT / "reports" / "stabilization_report.csv"
BACKUP_ROOT = ROOT / "cleaned_corpus" / "_backups"


def u(value: str) -> str:
    return value.encode("ascii").decode("unicode_escape")


RU = {
    "chapter": u(r"\u0433\u043b\u0430\u0432\u0430"),
    "contents": u(r"\u0441\u043e\u0434\u0435\u0440\u0436\u0430\u043d\u0438\u0435"),
    "toc": u(r"\u043e\u0433\u043b\u0430\u0432\u043b\u0435\u043d\u0438\u0435"),
    "literature": u(r"\u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430"),
    "references": u(r"\u0441\u043f\u0438\u0441\u043e\u043a \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u044b"),
    "signed_print": u(r"\u043f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u043e \u0432 \u043f\u0435\u0447\u0430\u0442\u044c"),
    "circulation": u(r"\u0442\u0438\u0440\u0430\u0436"),
    "publisher": u(r"\u0438\u0437\u0434\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u043e"),
    "questionnaire": u(r"\u043e\u043f\u0440\u043e\u0441\u043d\u0438\u043a"),
    "card": u(r"\u043a\u0430\u0440\u0442\u0430"),
    "survey": u(r"\u0430\u043d\u043a\u0435\u0442\u0430"),
    "fill": u(r"\u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u044c"),
    "complaints": u(r"\u0436\u0430\u043b\u043e\u0431\u044b"),
    "exam": u(r"\u043e\u0431\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d"),
    "objective": u(r"\u043e\u0431\u044a\u0435\u043a\u0442\u0438\u0432\u043d"),
    "status": u(r"\u0441\u0442\u0430\u0442\u0443\u0441"),
    "therapy": u(r"\u0442\u0435\u0440\u0430\u043f"),
    "clinical": u(r"\u043a\u043b\u0438\u043d\u0438\u0447"),
    "explain": u(r"\u043e\u0431\u044a\u044f\u0441\u043d"),
    "example": u(r"\u043f\u0440\u0438\u043c\u0435\u0440"),
}

HEADING_RE = re.compile(
    rf"(?=(?:{RU['chapter']}|chapter|part|section|раздел|часть)\s+\d{{1,3}}[\.:]?\s+)",
    re.IGNORECASE,
)
NUMBERED_SECTION_RE = re.compile(r"(?=\s\d{1,2}\.\s+[A-ZА-ЯЁ])")
SENTENCE_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZА-ЯЁ])")
PUBLISHER_TAIL_RE = re.compile(
    rf"({RU['signed_print']}|{RU['circulation']}|isbn|удк|ббк|отпечатано|copyright|©)",
    re.IGNORECASE,
)
BIB_TAIL_RE = re.compile(rf"({RU['references']}|{RU['literature']}|references|bibliography)", re.IGNORECASE)
TOC_TAIL_RE = re.compile(rf"({RU['toc']}|{RU['contents']}|contents|{RU['chapter']}\s+\d.+{RU['chapter']}\s+\d)", re.IGNORECASE | re.DOTALL)


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def paragraphs(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]


def paragraph_stats(text: str) -> dict[str, Any]:
    parts = paragraphs(text)
    return {
        "paragraph_count": len(parts),
        "avg_paragraph_chars": round(len(text) / max(len(parts), 1), 1),
        "max_paragraph_chars": max((len(part) for part in parts), default=0),
        "large_one_paragraph": len(parts) <= 2 and len(text) > 10_000,
    }


def split_long_paragraph(text: str, target_chars: int = 1400, max_chars: int = 2400) -> tuple[str, int]:
    """Plan conservative paragraph restoration for huge OCR paragraphs."""
    if not text.strip():
        return text, 0
    initial_parts = paragraphs(text)
    restored: list[str] = []
    splits = 0

    for part in initial_parts:
        if len(part) <= max_chars:
            restored.append(part)
            continue
        stage: list[str] = []
        cursor = 0
        for match in HEADING_RE.finditer(part):
            if match.start() > cursor:
                stage.append(part[cursor : match.start()].strip())
            cursor = match.start()
        if cursor:
            stage.append(part[cursor:].strip())
        else:
            stage = [part]

        for segment in stage:
            segment = segment.strip()
            if not segment:
                continue
            if len(segment) <= max_chars:
                restored.append(segment)
                continue
            sentences = SENTENCE_BOUNDARY_RE.split(segment)
            current: list[str] = []
            current_len = 0
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                starts_numbered = bool(NUMBERED_SECTION_RE.match(" " + sentence))
                if current and (current_len + len(sentence) > target_chars or starts_numbered):
                    restored.append(" ".join(current).strip())
                    splits += 1
                    current = []
                    current_len = 0
                current.append(sentence)
                current_len += len(sentence) + 1
            if current:
                restored.append(" ".join(current).strip())
    if len(restored) > len(initial_parts):
        splits += len(restored) - len(initial_parts)
    return "\n\n".join(restored), splits


def tail_cleanup_plan(text: str) -> tuple[int, list[str]]:
    """Return planned trailing chars to remove and reasons."""
    tail_window_start = max(0, len(text) - 25_000)
    tail = text[tail_window_start:]
    candidates: list[tuple[int, str]] = []

    publisher_match = PUBLISHER_TAIL_RE.search(tail)
    if publisher_match and publisher_match.start() > len(tail) * 0.45:
        candidates.append((tail_window_start + publisher_match.start(), "publisher_tail"))

    bib_match = BIB_TAIL_RE.search(tail)
    if bib_match and bib_match.start() > len(tail) * 0.35:
        references_after = len(re.findall(r"\b(?:19|20)\d{2}\b|isbn|doi|[A-ZА-ЯЁ][a-zа-яё]+,\s*[A-ZА-ЯЁ]\.", tail[bib_match.start() :], re.IGNORECASE))
        if references_after >= 4:
            candidates.append((tail_window_start + bib_match.start(), "bibliography_tail"))

    toc_match = TOC_TAIL_RE.search(tail)
    if toc_match and toc_match.start() > len(tail) * 0.4:
        chapter_hits = len(re.findall(rf"{RU['chapter']}\s+\d", tail[toc_match.start() :], re.IGNORECASE))
        if chapter_hits >= 3:
            candidates.append((tail_window_start + toc_match.start(), "trailing_toc"))

    if not candidates:
        return 0, []
    start, reason = min(candidates, key=lambda item: item[0])
    remove_chars = len(text) - start
    if remove_chars < 300:
        return 0, []
    return remove_chars, [reason]


def repeated_header_footer_candidates(text: str) -> int:
    lines = [line.strip() for line in text.splitlines() if 5 <= len(line.strip()) <= 100]
    counts = Counter(lines)
    return sum(1 for _, count in counts.items() if count >= 4)


def form_score(text: str, filename: str) -> tuple[float, list[str]]:
    low = f"{filename.lower()}\n{text[:30_000].lower()}"
    markers = {
        "card": RU["card"],
        "questionnaire": RU["questionnaire"],
        "survey": RU["survey"],
        "fill": RU["fill"],
        "complaints": RU["complaints"],
        "exam": RU["exam"],
        "objective": RU["objective"],
        "status": RU["status"],
        "sfzh": u(r"\u0441\u0444\u0436"),
        "blank_slots": " c ",
    }
    hits = [name for name, marker in markers.items() if marker in low]
    question_marks = low.count("?")
    colon_density = low.count(":") / max(len(low) / 1000, 1)
    theory_hits = sum(low.count(word) for word in [RU["therapy"], RU["clinical"], RU["explain"], RU["example"]])
    score = min(1.0, len(hits) * 0.12 + min(question_marks, 12) * 0.015 + min(colon_density, 10) * 0.02)
    if theory_hits >= 8 and len(text) > 20_000:
        score -= 0.25
    return max(0.0, round(score, 2)), hits


def normalize_for_hash(text: str) -> str:
    normalized = re.sub(r"\W+", " ", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", normalized).strip()


def fingerprint(text: str) -> str:
    normalized = normalize_for_hash(text)
    return hashlib.sha1(normalized[:200_000].encode("utf-8", errors="ignore")).hexdigest()


def base_key(path: Path) -> str:
    name = path.name
    for suffix in [
        ".ocr.raw.cleaned.txt",
        ".ocr.cleaned.cleaned.txt",
        ".cleaned.cleaned.txt",
        ".cleaned.txt",
    ]:
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return path.stem


def quality_score(text: str) -> float:
    stats = paragraph_stats(text)
    score = 1.0
    if stats["large_one_paragraph"]:
        score -= 0.25
    if "ocr.raw" in text[:100].lower():
        score -= 0.05
    score -= min(0.2, text.count("\ufffd") * 0.01)
    score -= min(0.15, len(re.findall(r"[=_|]{4,}", text[:100_000])) * 0.01)
    return round(max(score, 0.0), 3)


def detect_duplicate_pairs(file_texts: dict[Path, str]) -> dict[Path, dict[str, Any]]:
    groups: dict[str, list[Path]] = defaultdict(list)
    for path in file_texts:
        groups[base_key(path)].append(path)

    results: dict[Path, dict[str, Any]] = {}
    for paths in groups.values():
        if len(paths) < 2:
            continue
        scored = sorted(paths, key=lambda p: (quality_score(file_texts[p]), -("ocr.raw" in p.name), len(file_texts[p])), reverse=True)
        canonical = scored[0]
        for path in scored[1:]:
            a = normalize_for_hash(file_texts[canonical])[:120_000]
            b = normalize_for_hash(file_texts[path])[:120_000]
            similarity = SequenceMatcher(None, a, b).ratio() if a and b else 0.0
            if similarity >= 0.86 or fingerprint(file_texts[canonical]) == fingerprint(file_texts[path]):
                results[path] = {
                    "duplicate_of": relative(canonical),
                    "similarity": round(similarity, 3),
                    "status": "duplicate_candidate",
                }
    return results


def readiness_score(stats: dict[str, Any], planned_text: str) -> float:
    after = paragraph_stats(planned_text)
    score = 1.0
    if after["large_one_paragraph"]:
        score -= 0.35
    if after["avg_paragraph_chars"] > 2400:
        score -= 0.18
    if stats["tail_remove_chars"] > 0:
        score += 0.04
    if stats["duplicate_status"] == "duplicate_candidate":
        score -= 0.25
    if stats["logical_category"] == "form_card":
        score -= 0.2
    return round(max(0.0, min(1.0, score)), 2)


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        candidate = path.with_name(f"{stem}__{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def analyze_file(path: Path, text: str, duplicate_info: dict[str, Any] | None, include_payload: bool = False) -> dict[str, Any]:
    before_stats = paragraph_stats(text)
    restored_text, restore_splits = split_long_paragraph(text) if before_stats["large_one_paragraph"] else (text, 0)
    tail_remove_chars, tail_reasons = tail_cleanup_plan(restored_text)
    stabilized_text = restored_text[:-tail_remove_chars].rstrip() if tail_remove_chars else restored_text
    form_value, form_reasons = form_score(stabilized_text, path.name)
    logical_category = "form_card" if form_value >= 0.42 and len(stabilized_text) < 80_000 else "explanatory_narrative"
    duplicate_status = duplicate_info["status"] if duplicate_info else "canonical_or_unique"
    stats = {
        "tail_remove_chars": tail_remove_chars,
        "duplicate_status": duplicate_status,
        "logical_category": logical_category,
    }

    row: dict[str, Any] = {
        "path": relative(path),
        "filename": path.name,
        "chars_before": len(text),
        "planned_chars_after": len(stabilized_text),
        "paragraphs_before": before_stats["paragraph_count"],
        "paragraphs_after": paragraph_stats(stabilized_text)["paragraph_count"],
        "paragraph_restore_planned": restore_splits > 0,
        "paragraph_restore_splits": restore_splits,
        "tail_cleanup_planned": tail_remove_chars > 0,
        "tail_remove_chars": tail_remove_chars,
        "tail_reasons": tail_reasons,
        "repeated_header_footer_candidates": repeated_header_footer_candidates(stabilized_text),
        "logical_category": logical_category,
        "form_score": form_value,
        "form_reasons": form_reasons,
        "duplicate_status": duplicate_status,
        "duplicate_of": duplicate_info["duplicate_of"] if duplicate_info else "",
        "duplicate_similarity": duplicate_info["similarity"] if duplicate_info else "",
        "chunking_readiness_before": readiness_score({**stats, "tail_remove_chars": 0}, text),
        "chunking_readiness_after": readiness_score(stats, stabilized_text),
        "planned_output": (
            f"cleaned_corpus/forms/{path.name}" if logical_category == "form_card" else f"cleaned_corpus/good/{path.name}"
        ),
        "warnings": [],
    }
    if include_payload:
        row["_stabilized_text"] = stabilized_text
    return row


def public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def write_reports(rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    fields = [
        "path",
        "filename",
        "chars_before",
        "planned_chars_after",
        "paragraphs_before",
        "paragraphs_after",
        "paragraph_restore_planned",
        "paragraph_restore_splits",
        "tail_cleanup_planned",
        "tail_remove_chars",
        "tail_reasons",
        "logical_category",
        "form_score",
        "form_reasons",
        "duplicate_status",
        "duplicate_of",
        "duplicate_similarity",
        "chunking_readiness_before",
        "chunking_readiness_after",
        "planned_output",
        "warnings",
    ]
    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def metadata_path_for(text_path: Path) -> Path:
    if text_path.name.endswith(".cleaned.txt"):
        return text_path.with_name(text_path.name[: -len(".cleaned.txt")] + ".metadata.json")
    return text_path.with_suffix(".metadata.json")


def backup_file(path: Path, backup_dir: Path, manifest: list[dict[str, str]]) -> None:
    if not path.exists():
        return
    backup_path = backup_dir / path.relative_to(ROOT)
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup_path)
    manifest.append({"source": relative(path), "backup": relative(backup_path)})


def write_metadata(path: Path, row: dict[str, Any], operation: str) -> None:
    metadata_path = metadata_path_for(path)
    payload: dict[str, Any] = {}
    if metadata_path.exists():
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            payload = {}
    payload["stabilization"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "operation": operation,
        "logical_category": row["logical_category"],
        "duplicate_status": row["duplicate_status"],
        "duplicate_of": row["duplicate_of"],
        "duplicate_similarity": row["duplicate_similarity"],
        "paragraph_restore_applied": row["paragraph_restore_planned"],
        "paragraph_restore_splits": row["paragraph_restore_splits"],
        "tail_cleanup_applied": row["tail_cleanup_planned"],
        "tail_remove_chars": row["tail_remove_chars"],
        "tail_reasons": row["tail_reasons"],
        "chunking_readiness_before": row["chunking_readiness_before"],
        "chunking_readiness_after": row["chunking_readiness_after"],
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def apply_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / f"stabilization_{timestamp}"
    backup_manifest: list[dict[str, str]] = []
    operations: list[dict[str, Any]] = []
    forms_dir = ROOT / "cleaned_corpus" / "forms"
    forms_dir.mkdir(parents=True, exist_ok=True)

    for row in rows:
        source = ROOT / row["path"]
        source_metadata = metadata_path_for(source)
        backup_file(source, backup_dir, backup_manifest)
        backup_file(source_metadata, backup_dir, backup_manifest)

        stabilized_text = row["_stabilized_text"]
        if row["logical_category"] == "form_card":
            target = unique_path(forms_dir / source.name)
            target.write_text(stabilized_text, encoding="utf-8")
            target_metadata = metadata_path_for(target)
            write_metadata(target, row, operation="moved_to_forms")
            # Keep a small marker metadata next to the original if it still exists, then move originals aside.
            if source.exists():
                source.unlink()
            if source_metadata.exists():
                source_metadata.unlink()
            operations.append(
                {
                    "operation": "move_to_forms",
                    "source": relative(source),
                    "target": relative(target),
                    "metadata": relative(target_metadata),
                }
            )
            continue

        source.write_text(stabilized_text, encoding="utf-8")
        write_metadata(source, row, operation="stabilize_in_place")
        operations.append(
            {
                "operation": "stabilize_in_place",
                "target": relative(source),
                "metadata": relative(metadata_path_for(source)),
                "duplicate_status": row["duplicate_status"],
            }
        )

    manifest_path = ROOT / "reports" / f"stabilization_backup_manifest_{timestamp}.json"
    manifest_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "backup_dir": relative(backup_dir),
                "backups": backup_manifest,
                "operations": operations,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return {
        "backup_dir": relative(backup_dir),
        "backup_manifest": relative(manifest_path),
        "operations": operations,
    }


def build_summary(rows: list[dict[str, Any]], input_dir: Path, mode: str, apply_result: dict[str, Any] | None = None) -> dict[str, Any]:
    paragraph_restores = sum(1 for row in rows if row["paragraph_restore_planned"])
    duplicate_pairs = sum(1 for row in rows if row["duplicate_status"] == "duplicate_candidate")
    forms = sum(1 for row in rows if row["logical_category"] == "form_card")
    tail_cleanups = sum(1 for row in rows if row["tail_cleanup_planned"])
    chars_before = sum(row["chars_before"] for row in rows)
    chars_after = sum(row["planned_chars_after"] for row in rows)
    readiness_before = sum(row["chunking_readiness_before"] for row in rows) / max(len(rows), 1)
    readiness_after = sum(row["chunking_readiness_after"] for row in rows) / max(len(rows), 1)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "input_dir": relative(input_dir),
        "files_analyzed": len(rows),
        "paragraph_restores_planned": paragraph_restores,
        "duplicate_pairs_found": duplicate_pairs,
        "files_moved_to_forms_planned": forms,
        "structural_tails_removed_planned": tail_cleanups,
        "chars_before": chars_before,
        "planned_chars_after": chars_after,
        "planned_chars_removed": chars_before - chars_after,
        "chunking_readiness_before": round(readiness_before, 3),
        "chunking_readiness_after": round(readiness_after, 3),
        "chunking_readiness_delta": round(readiness_after - readiness_before, 3),
        "duplicate_candidates": [public_row(row) for row in rows if row["duplicate_status"] == "duplicate_candidate"],
        "forms_candidates": [public_row(row) for row in rows if row["logical_category"] == "form_card"],
        "tail_cleanup_candidates": [public_row(row) for row in rows if row["tail_cleanup_planned"]],
        "paragraph_restore_candidates": [public_row(row) for row in rows if row["paragraph_restore_planned"]],
        "apply_result": apply_result or {},
        "rows": [public_row(row) for row in rows],
    }


def print_summary(summary: dict[str, Any]) -> None:
    print("Stabilization apply complete." if summary["mode"] == "apply" else "Stabilization dry-run complete.")
    print(f"Files analyzed: {summary['files_analyzed']}")
    print(f"Paragraph restores planned: {summary['paragraph_restores_planned']}")
    print(f"Duplicate pairs found: {summary['duplicate_pairs_found']}")
    print(f"Files planned for cleaned_corpus/forms: {summary['files_moved_to_forms_planned']}")
    print(f"Structural tails planned for removal: {summary['structural_tails_removed_planned']}")
    print(f"Chars before/after: {summary['chars_before']} -> {summary['planned_chars_after']}")
    print(
        "Chunking readiness: "
        f"{summary['chunking_readiness_before']} -> {summary['chunking_readiness_after']} "
        f"(delta {summary['chunking_readiness_delta']})"
    )
    print(f"Report JSON: {REPORT_JSON}")
    print(f"Report CSV: {REPORT_CSV}")
    if summary["mode"] == "apply":
        print(f"Backup manifest: {ROOT / summary['apply_result']['backup_manifest']}")
        print(f"Backup dir: {ROOT / summary['apply_result']['backup_dir']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Corpus stabilization before embeddings.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Input cleaned corpus folder.")
    parser.add_argument("--dry-run", action="store_true", help="Analyze and write reports only.")
    parser.add_argument("--apply", action="store_true", help="Apply stabilization with backups and manifest.")
    args = parser.parse_args()

    if args.dry_run == args.apply:
        raise SystemExit("Choose exactly one mode: --dry-run or --apply.")

    input_dir = Path(args.input)
    if not input_dir.is_absolute():
        input_dir = ROOT / input_dir
    if not input_dir.exists():
        raise SystemExit(f"Input folder not found: {input_dir}")

    files = sorted(input_dir.glob("*.cleaned.txt"))
    file_texts = {path: read_text(path) for path in files}
    duplicate_map = detect_duplicate_pairs(file_texts)
    rows = [analyze_file(path, file_texts[path], duplicate_map.get(path), include_payload=args.apply) for path in files]
    apply_result = apply_rows(rows) if args.apply else None
    summary = build_summary(rows, input_dir, mode="apply" if args.apply else "dry-run", apply_result=apply_result)
    write_reports(rows, summary)
    print_summary(summary)


if __name__ == "__main__":
    main()
