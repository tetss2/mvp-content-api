#!/usr/bin/env python3
"""Semantic chunk generator for the stabilized cleaned corpus.

This module intentionally does not create embeddings or perform ingestion. It
prepares paragraph-aware, semantic-boundary-aware chunks with stable IDs and
metadata suitable for a later embedding pipeline.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "cleaned_corpus" / "good"
CHUNKS_ROOT = ROOT / "chunks" / "good"
CHUNK_METADATA_ROOT = ROOT / "chunk_metadata" / "good"
CHUNK_REPORTS_ROOT = ROOT / "chunk_reports"
CORPUS_MANIFEST = ROOT / "chunk_metadata" / "corpus_chunk_manifest.json"

CHUNK_VERSION = 1
PIPELINE_VERSION = "chunker_v1"
DEFAULT_NAMESPACE = "dinara_kachayeva_knowledge_base"
DEFAULT_LANGUAGE = "ru"
DEFAULT_RETRIEVAL_WEIGHT = 1.0

MIN_TOKENS = 350
TARGET_TOKENS = 650
MAX_TOKENS = 950
HARD_MAX_TOKENS = 1150
MAX_OVERLAP_TOKENS = 180
ORPHAN_TOKEN_THRESHOLD = 220

BRIDGE_MARKERS = (
    "поэтому",
    "однако",
    "при этом",
    "таким образом",
    "кроме того",
    "например",
    "в результате",
)
TOPIC_SHIFT_MARKERS = (
    "глава",
    "раздел",
    "часть",
    "chapter",
    "section",
)


@dataclass
class Paragraph:
    index: int
    text: str
    label: str
    token_estimate: int


@dataclass
class ChunkPlan:
    chunk_index: int
    paragraphs: list[Paragraph]
    overlap_from_previous: list[int]

    @property
    def text(self) -> str:
        return "\n\n".join(paragraph.text for paragraph in self.paragraphs).strip()

    @property
    def paragraph_range(self) -> list[int]:
        return [self.paragraphs[0].index, self.paragraphs[-1].index]

    @property
    def token_estimate(self) -> int:
        return estimate_tokens(self.text)


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def normalize_text_for_hash(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def stable_chunk_id(canonical_source: str, paragraph_range: list[int], normalized_text: str) -> str:
    """Return sha1(canonical_source + paragraph_range + normalized_text)."""
    payload = canonical_source + json.dumps(paragraph_range, separators=(",", ":")) + normalized_text
    return hashlib.sha1(payload.encode("utf-8", errors="ignore")).hexdigest()


def estimate_tokens(text: str) -> int:
    # Conservative multilingual estimate. Russian words often tokenize slightly
    # above whitespace count, so combine word and character estimates.
    words = len(re.findall(r"\S+", text))
    chars = max(1, len(text))
    return max(words, round(chars / 4.2))


def split_paragraphs(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]


def paragraph_label(text: str) -> str:
    value = text.strip()
    lower = value.lower()
    if len(value) <= 140 and re.match(r"^(?:глава|раздел|часть|chapter|section)\s+\d+", lower):
        return "heading"
    if len(value) <= 120 and value == value.upper() and len(re.findall(r"[A-Za-zА-Яа-яЁё]", value)) >= 5:
        return "heading"
    if re.match(r"^\s*(?:\d+[\).:]|[-*])\s+\S+", value):
        return "list_like"
    if any(marker in lower for marker in ["например", "пример", "случай", "пациент", "клиент"]):
        return "example_or_clinical"
    return "narrative"


def build_paragraphs(text: str) -> list[Paragraph]:
    paragraphs: list[Paragraph] = []
    for index, paragraph in enumerate(split_paragraphs(text)):
        paragraphs.append(
            Paragraph(
                index=index,
                text=paragraph,
                label=paragraph_label(paragraph),
                token_estimate=estimate_tokens(paragraph),
            )
        )
    return paragraphs


def sentence_split_long_paragraph(paragraph: Paragraph) -> list[Paragraph]:
    if paragraph.token_estimate <= MAX_TOKENS:
        return [paragraph]
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+(?=[A-ZА-ЯЁ])", paragraph.text) if item.strip()]
    split: list[Paragraph] = []
    current: list[str] = []
    current_tokens = 0
    sub_index = 0
    for sentence in sentences:
        sentence_tokens = estimate_tokens(sentence)
        if current and current_tokens + sentence_tokens > MAX_TOKENS:
            text = " ".join(current).strip()
            split.append(
                Paragraph(
                    index=paragraph.index,
                    text=text,
                    label=f"{paragraph.label}_split_{sub_index}",
                    token_estimate=estimate_tokens(text),
                )
            )
            sub_index += 1
            current = []
            current_tokens = 0
        current.append(sentence)
        current_tokens += sentence_tokens
    if current:
        text = " ".join(current).strip()
        split.append(
            Paragraph(
                index=paragraph.index,
                text=text,
                label=f"{paragraph.label}_split_{sub_index}",
                token_estimate=estimate_tokens(text),
            )
        )
    return split or [paragraph]


def is_semantic_boundary(paragraph: Paragraph, current_tokens: int) -> bool:
    if paragraph.label == "heading" and current_tokens >= MIN_TOKENS:
        return True
    if paragraph.label == "list_like" and current_tokens >= TARGET_TOKENS:
        return True
    if current_tokens >= TARGET_TOKENS and paragraph.text[:1].isupper():
        return True
    return False


def paragraph_is_bridge(paragraph: Paragraph) -> bool:
    return bool(
        re.match(r"^(?:и|но|следовательно|" + "|".join(re.escape(marker) for marker in BRIDGE_MARKERS) + r")\b", paragraph.text.strip().lower())
    )


def has_semantic_closure(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.endswith((".", "!", "?", ":", "»", "\"")):
        return True
    return False


def starts_topic_boundary(chunk: ChunkPlan) -> bool:
    if not chunk.paragraphs:
        return False
    first = chunk.paragraphs[0]
    lower = first.text.strip().lower()
    if first.label == "heading":
        return True
    return any(re.match(rf"^{re.escape(marker)}\s+\d+", lower) for marker in TOPIC_SHIFT_MARKERS)


def explicit_topic_shift_between(left: ChunkPlan, right: ChunkPlan) -> bool:
    if starts_topic_boundary(right):
        return True
    if not left.paragraphs or not right.paragraphs:
        return False
    left_last = left.paragraphs[-1].text.strip().lower()
    right_first = right.paragraphs[0].text.strip().lower()
    if left_last.endswith(":") and starts_topic_boundary(right):
        return True
    return bool(re.match(r"^(?:итак|следующая|следующий|новая|новый)\b", right_first))


def is_orphan_chunk(chunk: ChunkPlan) -> bool:
    if chunk.token_estimate < ORPHAN_TOKEN_THRESHOLD:
        return True
    if len(chunk.paragraphs) == 1:
        paragraph = chunk.paragraphs[0]
        if paragraph.token_estimate < 280 and paragraph_is_bridge(paragraph) and not has_semantic_closure(paragraph.text):
            return True
    return False


def merge_chunk(left: ChunkPlan, right: ChunkPlan, index: int) -> ChunkPlan:
    paragraphs = left.paragraphs + right.paragraphs
    overlap = sorted(set(left.overlap_from_previous + right.overlap_from_previous))
    return ChunkPlan(chunk_index=index, paragraphs=paragraphs, overlap_from_previous=overlap)


def can_merge(left: ChunkPlan, right: ChunkPlan) -> bool:
    if left.token_estimate + right.token_estimate > MAX_TOKENS:
        return False
    if explicit_topic_shift_between(left, right):
        return False
    return True


def lexical_overlap_score(left: ChunkPlan, right: ChunkPlan) -> float:
    words_left = set(re.findall(r"[A-Za-zА-Яа-яЁё]{4,}", left.text.lower()))
    words_right = set(re.findall(r"[A-Za-zА-Яа-яЁё]{4,}", right.text.lower()))
    if not words_left or not words_right:
        return 0.0
    return len(words_left & words_right) / max(min(len(words_left), len(words_right)), 1)


def renumber_chunks(chunks: list[ChunkPlan]) -> list[ChunkPlan]:
    return [
        ChunkPlan(chunk_index=index, paragraphs=chunk.paragraphs, overlap_from_previous=chunk.overlap_from_previous)
        for index, chunk in enumerate(chunks)
    ]


def merge_orphan_chunks(chunks: list[ChunkPlan]) -> list[ChunkPlan]:
    merged: list[ChunkPlan] = []
    index = 0
    while index < len(chunks):
        chunk = chunks[index]
        if not is_orphan_chunk(chunk):
            merged.append(chunk)
            index += 1
            continue

        merged_into_previous = False
        if merged and can_merge(merged[-1], chunk):
            previous_candidate = merge_chunk(merged[-1], chunk, merged[-1].chunk_index)
            next_score = lexical_overlap_score(chunk, chunks[index + 1]) if index + 1 < len(chunks) else 0.0
            previous_score = lexical_overlap_score(merged[-1], chunk)
            if previous_score >= next_score or index + 1 >= len(chunks):
                merged[-1] = previous_candidate
                merged_into_previous = True

        if merged_into_previous:
            index += 1
            continue

        if index + 1 < len(chunks) and can_merge(chunk, chunks[index + 1]):
            merged.append(merge_chunk(chunk, chunks[index + 1], chunk.chunk_index))
            index += 2
            continue

        merged.append(chunk)
        index += 1

    return renumber_chunks(merged)


def split_oversized_chunk(paragraphs: list[Paragraph]) -> list[list[Paragraph]]:
    """Split an oversized chunk conservatively.

    Priority:
    1. semantic boundary: heading/list/example transitions near target size;
    2. paragraph boundary closest to target;
    3. sentence split already performed for huge individual paragraphs.
    """
    total = sum(paragraph.token_estimate for paragraph in paragraphs)
    if total <= MAX_TOKENS or len(paragraphs) <= 1:
        return [paragraphs]

    running = 0
    semantic_candidates: list[tuple[int, int]] = []
    paragraph_candidates: list[tuple[int, int]] = []
    for index, paragraph in enumerate(paragraphs[1:], start=1):
        running += paragraphs[index - 1].token_estimate
        if running < MIN_TOKENS:
            continue
        distance = abs(running - TARGET_TOKENS)
        if paragraph.label in {"heading", "list_like", "example_or_clinical"} and not paragraph_is_bridge(paragraph):
            semantic_candidates.append((distance, index))
        if not paragraph_is_bridge(paragraph):
            paragraph_candidates.append((distance, index))

    chosen: int | None = None
    if semantic_candidates:
        chosen = min(semantic_candidates, key=lambda item: item[0])[1]
    elif paragraph_candidates:
        chosen = min(paragraph_candidates, key=lambda item: item[0])[1]

    if chosen is None:
        return [paragraphs]

    left = paragraphs[:chosen]
    right = paragraphs[chosen:]
    return split_oversized_chunk(left) + split_oversized_chunk(right)


def choose_overlap(paragraphs: list[Paragraph]) -> list[Paragraph]:
    if not paragraphs:
        return []
    tail = paragraphs[-1]
    if tail.label == "heading":
        return []
    if tail.token_estimate <= MAX_OVERLAP_TOKENS:
        return [tail]
    return []


def plan_chunks(paragraphs: list[Paragraph]) -> list[ChunkPlan]:
    expanded: list[Paragraph] = []
    for paragraph in paragraphs:
        expanded.extend(sentence_split_long_paragraph(paragraph))

    chunks: list[ChunkPlan] = []
    current: list[Paragraph] = []
    overlap: list[Paragraph] = []
    current_tokens = 0

    def flush() -> None:
        nonlocal current, overlap, current_tokens
        if not current:
            return
        for group in split_oversized_chunk(current[:]):
            chunks.append(
                ChunkPlan(
                    chunk_index=len(chunks),
                    paragraphs=group,
                    overlap_from_previous=[paragraph.index for paragraph in overlap if paragraph in group],
                )
            )
        overlap = choose_overlap(current)
        current = overlap[:]
        current_tokens = sum(paragraph.token_estimate for paragraph in current)

    for paragraph in expanded:
        if current and is_semantic_boundary(paragraph, current_tokens):
            flush()
        current.append(paragraph)
        current_tokens += paragraph.token_estimate
        if current_tokens >= MAX_TOKENS:
            flush()
    flush()

    chunks = [chunk for chunk in chunks if chunk.text]
    chunks = merge_orphan_chunks(chunks)
    return [chunk for chunk in chunks if chunk.token_estimate <= HARD_MAX_TOKENS or len(chunk.paragraphs) == 1]


def semantic_continuity_score(chunk: ChunkPlan) -> float:
    labels = [paragraph.label for paragraph in chunk.paragraphs]
    score = 0.82
    long_narrative_chain = len(chunk.paragraphs) >= 4 and sum(1 for label in labels if label == "narrative") >= 4
    if labels and labels[0] == "heading" and len(labels) > 1:
        score += 0.08
    if len(set(labels)) > 3:
        score -= 0.08
    if long_narrative_chain and chunk.token_estimate > TARGET_TOKENS:
        score -= 0.1
    if chunk.token_estimate < MIN_TOKENS:
        score -= 0.12
    if chunk.token_estimate > MAX_TOKENS:
        score -= 0.18
    if chunk.token_estimate > HARD_MAX_TOKENS:
        score -= 0.22
    return round(max(0.0, min(1.0, score)), 2)


def overlap_redundancy(chunk: ChunkPlan) -> float:
    if not chunk.overlap_from_previous:
        return 0.0
    overlap_tokens = sum(
        paragraph.token_estimate for paragraph in chunk.paragraphs if paragraph.index in chunk.overlap_from_previous
    )
    return round(overlap_tokens / max(chunk.token_estimate, 1), 3)


def load_metadata(source_path: Path) -> dict[str, Any]:
    metadata_path = source_path.with_name(source_path.name[: -len(".cleaned.txt")] + ".metadata.json")
    if not metadata_path.exists():
        return {}
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def should_exclude(source_path: Path, metadata: dict[str, Any]) -> tuple[bool, str]:
    if "forms" in source_path.parts:
        return True, "forms_folder_excluded"
    stabilization = metadata.get("stabilization", {})
    if stabilization.get("duplicate_status") == "duplicate_candidate":
        return True, "duplicate_candidate"
    return False, ""


def retrieval_weight_for(metadata: dict[str, Any]) -> float:
    stabilization = metadata.get("stabilization", {})
    if stabilization.get("logical_category") == "form_card":
        return 0.0
    if stabilization.get("tail_cleanup_applied") or stabilization.get("paragraph_restore_applied"):
        return 1.05
    return DEFAULT_RETRIEVAL_WEIGHT


def build_chunk_record(
    chunk: ChunkPlan,
    source_path: Path,
    metadata: dict[str, Any],
    namespace: str,
    language: str,
) -> dict[str, Any]:
    source_file = relative(source_path)
    canonical_source = metadata.get("stabilization", {}).get("duplicate_of") or source_file
    normalized_text = normalize_text_for_hash(chunk.text)
    paragraph_range = chunk.paragraph_range
    chunk_id = stable_chunk_id(canonical_source, paragraph_range, normalized_text)
    stabilization = metadata.get("stabilization", {})

    return {
        "chunk_id": chunk_id,
        "chunk_version": CHUNK_VERSION,
        "pipeline_version": PIPELINE_VERSION,
        "text": chunk.text,
        "metadata": {
            "namespace": namespace,
            "language": language,
            "retrieval_weight": retrieval_weight_for(metadata),
            "source_file": source_file,
            "canonical_source": canonical_source,
            "logical_category": stabilization.get("logical_category", "explanatory_narrative"),
            "duplicate_status": stabilization.get("duplicate_status", "canonical_or_unique"),
            "paragraph_range": paragraph_range,
            "overlap_from_previous": chunk.overlap_from_previous,
            "chunk_index": chunk.chunk_index,
            "token_estimate": chunk.token_estimate,
            "char_count": len(chunk.text),
            "stabilization": {
                "chunking_readiness_before": stabilization.get("chunking_readiness_before"),
                "chunking_readiness_after": stabilization.get("chunking_readiness_after"),
                "paragraph_restore_applied": stabilization.get("paragraph_restore_applied"),
                "tail_cleanup_applied": stabilization.get("tail_cleanup_applied"),
                "duplicate_similarity": stabilization.get("duplicate_similarity"),
            },
            "quality": {
                "semantic_continuity_score": semantic_continuity_score(chunk),
                "overlap_redundancy": overlap_redundancy(chunk),
                "oversized": chunk.token_estimate > HARD_MAX_TOKENS,
                "orphan_paragraphs": int(chunk.token_estimate < MIN_TOKENS and len(chunk.paragraphs) == 1),
            },
        },
    }


def analyze_source(source_path: Path, namespace: str, language: str) -> dict[str, Any]:
    metadata = load_metadata(source_path)
    excluded, reason = should_exclude(source_path, metadata)
    if excluded:
        return {
            "source_file": relative(source_path),
            "excluded": True,
            "exclusion_reason": reason,
            "chunks": [],
            "summary": {"chunk_count": 0},
        }

    text = source_path.read_text(encoding="utf-8", errors="ignore")
    paragraphs = build_paragraphs(text)
    chunks = [
        build_chunk_record(chunk, source_path, metadata, namespace=namespace, language=language)
        for chunk in plan_chunks(paragraphs)
    ]
    token_counts = [chunk["metadata"]["token_estimate"] for chunk in chunks]
    continuity = [chunk["metadata"]["quality"]["semantic_continuity_score"] for chunk in chunks]
    overlap = [chunk["metadata"]["quality"]["overlap_redundancy"] for chunk in chunks]
    summary = {
        "chunk_count": len(chunks),
        "tokens_total_estimate": sum(token_counts),
        "avg_chunk_tokens": round(sum(token_counts) / max(len(token_counts), 1), 1),
        "min_chunk_tokens": min(token_counts, default=0),
        "max_chunk_tokens": max(token_counts, default=0),
        "oversized_chunks": sum(1 for chunk in chunks if chunk["metadata"]["quality"]["oversized"]),
        "orphan_paragraphs": sum(chunk["metadata"]["quality"]["orphan_paragraphs"] for chunk in chunks),
        "overlap_redundancy_avg": round(sum(overlap) / max(len(overlap), 1), 3),
        "semantic_continuity_avg": round(sum(continuity) / max(len(continuity), 1), 3),
    }
    return {
        "source_file": relative(source_path),
        "excluded": False,
        "exclusion_reason": "",
        "chunks": chunks,
        "summary": summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic chunk generation without embeddings.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Input folder, usually cleaned_corpus/good.")
    parser.add_argument("--dry-run", action="store_true", help="Plan chunks and write reports only.")
    parser.add_argument("--apply", action="store_true", help="Write chunk JSONL files and manifests.")
    parser.add_argument("--namespace", default=DEFAULT_NAMESPACE)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    args = parser.parse_args()

    if args.dry_run == args.apply:
        raise SystemExit("Choose exactly one mode: --dry-run or --apply.")

    input_dir = Path(args.input)
    if not input_dir.is_absolute():
        input_dir = ROOT / input_dir
    if not input_dir.exists():
        raise SystemExit(f"Input folder not found: {input_dir}")

    analyses = [analyze_source(path, namespace=args.namespace, language=args.language) for path in sorted(input_dir.glob("*.cleaned.txt"))]
    included = [item for item in analyses if not item["excluded"]]
    excluded = [item for item in analyses if item["excluded"]]
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if args.apply else "dry-run",
        "pipeline_version": PIPELINE_VERSION,
        "chunk_version": CHUNK_VERSION,
        "namespace": args.namespace,
        "language": args.language,
        "input_dir": relative(input_dir),
        "files_seen": len(analyses),
        "files_included": len(included),
        "files_excluded": len(excluded),
        "files_excluded_duplicate": sum(1 for item in excluded if item["exclusion_reason"] == "duplicate_candidate"),
        "chunk_count": sum(item["summary"]["chunk_count"] for item in included),
        "avg_chunk_size": round(
            sum(item["summary"]["avg_chunk_tokens"] for item in included) / max(len(included), 1),
            1,
        ),
        "semantic_continuity_avg": round(
            sum(item["summary"]["semantic_continuity_avg"] for item in included) / max(len(included), 1),
            3,
        ),
        "overlap_redundancy_avg": round(
            sum(item["summary"]["overlap_redundancy_avg"] for item in included) / max(len(included), 1),
            3,
        ),
        "orphan_paragraph_count": sum(item["summary"]["orphan_paragraphs"] for item in included),
        "oversized_chunk_count": sum(item["summary"]["oversized_chunks"] for item in included),
        "files": [
            {
                "source_file": item["source_file"],
                "excluded": item["excluded"],
                "exclusion_reason": item["exclusion_reason"],
                **item["summary"],
            }
            for item in analyses
        ],
    }

    CHUNK_REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    report_name = "chunk_apply_report" if args.apply else "chunk_dry_run_report"
    (CHUNK_REPORTS_ROOT / f"{report_name}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with (CHUNK_REPORTS_ROOT / f"{report_name}.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fields = [
            "source_file",
            "excluded",
            "exclusion_reason",
            "chunk_count",
            "tokens_total_estimate",
            "avg_chunk_tokens",
            "min_chunk_tokens",
            "max_chunk_tokens",
            "oversized_chunks",
            "orphan_paragraphs",
            "overlap_redundancy_avg",
            "semantic_continuity_avg",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report["files"])

    if args.apply:
        CHUNKS_ROOT.mkdir(parents=True, exist_ok=True)
        CHUNK_METADATA_ROOT.mkdir(parents=True, exist_ok=True)
        for item in included:
            source = Path(item["source_file"])
            stem = source.name[: -len(".cleaned.txt")]
            chunks_file = CHUNKS_ROOT / f"{stem}.chunks.jsonl"
            metadata_file = CHUNK_METADATA_ROOT / f"{stem}.chunk_metadata.json"
            with chunks_file.open("w", encoding="utf-8") as handle:
                for chunk in item["chunks"]:
                    handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")
            metadata_file.write_text(
                json.dumps(
                    {
                        "source_file": item["source_file"],
                        "chunks_file": relative(chunks_file),
                        **item["summary"],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
        CORPUS_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        CORPUS_MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Chunker {report['mode']} complete.")
    print(f"Files included: {report['files_included']}")
    print(f"Files excluded: {report['files_excluded']}")
    print(f"Chunks planned: {report['chunk_count']}")


if __name__ == "__main__":
    main()
