#!/usr/bin/env python3
"""Generate local embedding JSONL files from semantic chunks.

This script does not use a vector database, retrieval, reranking, or prompting.
Dry-run performs validation and sizing only. Apply calls the OpenAI embeddings
API and writes partial-safe JSONL outputs under embeddings/good/.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "chunks" / "good"
OUTPUT_ROOT = ROOT / "embeddings" / "good"
REPORT_ROOT = ROOT / "embedding_reports"
APPLY_JSON = REPORT_ROOT / "embedding_apply_report.json"
APPLY_CSV = REPORT_ROOT / "embedding_apply_report.csv"
DRY_RUN_JSON = REPORT_ROOT / "embedding_dry_run_report.json"
DRY_RUN_CSV = REPORT_ROOT / "embedding_dry_run_report.csv"

DEFAULT_MODEL = "text-embedding-3-small"
DEFAULT_DIM = 1536
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def iter_chunk_files(input_dir: Path) -> list[Path]:
    return sorted(input_dir.glob("*.chunks.jsonl"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL in {path}:{line_number}: {exc}") from exc
    return records


def output_path_for(chunk_file: Path) -> Path:
    name = chunk_file.name.replace(".chunks.jsonl", ".embeddings.jsonl")
    return OUTPUT_ROOT / name


def existing_embedded_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    ids: set[str] = set()
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            chunk_id = record.get("chunk_id")
            if chunk_id:
                ids.add(chunk_id)
    return ids


def validate_chunk(record: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if not record.get("chunk_id"):
        warnings.append("missing_chunk_id")
    if not record.get("text"):
        warnings.append("missing_text")
    if not isinstance(record.get("metadata"), dict):
        warnings.append("missing_metadata")
    metadata = record.get("metadata") or {}
    for key in ["source_file", "canonical_source", "paragraph_range", "chunk_index", "token_estimate"]:
        if key not in metadata:
            warnings.append(f"metadata_missing_{key}")
    return warnings


def build_embedding_record(chunk: dict[str, Any], embedding: list[float], model: str, dim: int) -> dict[str, Any]:
    # Preserve chunk metadata verbatim.
    return {
        "chunk_id": chunk["chunk_id"],
        "embedding_model": model,
        "embedding_dim": dim,
        "embedding": embedding,
        "metadata": chunk["metadata"],
    }


def openai_embedding_request(text: str, api_key: str, model: str, timeout: int) -> list[float]:
    payload = json.dumps({"model": model, "input": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        OPENAI_EMBEDDINGS_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - explicit OpenAI API endpoint
        body = json.loads(response.read().decode("utf-8"))
    return body["data"][0]["embedding"]


def get_embedding_with_retry(
    text: str,
    api_key: str,
    model: str,
    retries: int,
    timeout: int,
    base_delay: float,
) -> list[float]:
    attempt = 0
    while True:
        try:
            return openai_embedding_request(text, api_key=api_key, model=model, timeout=timeout)
        except urllib.error.HTTPError as exc:
            status = exc.code
            if status not in RETRYABLE_STATUS or attempt >= retries:
                detail = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"OpenAI embeddings HTTP {status}: {detail[:500]}") from exc
            retry_after = exc.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else base_delay * (2**attempt) + random.uniform(0, 0.25)
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt >= retries:
                raise RuntimeError(f"OpenAI embeddings request failed after retries: {exc}") from exc
            delay = base_delay * (2**attempt) + random.uniform(0, 0.25)
        attempt += 1
        print(f"Retrying embedding request in {delay:.2f}s (attempt {attempt}/{retries})")
        time.sleep(delay)


def analyze_files(chunk_files: list[Path]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    file_reports: list[dict[str, Any]] = []
    total_chunks = 0
    total_tokens = 0
    warnings: list[str] = []

    for chunk_file in chunk_files:
        records = read_jsonl(chunk_file)
        chunk_warnings = []
        for record in records:
            record_warnings = validate_chunk(record)
            if record_warnings:
                chunk_warnings.append({"chunk_id": record.get("chunk_id", ""), "warnings": record_warnings})
            total_tokens += int((record.get("metadata") or {}).get("token_estimate") or 0)
        total_chunks += len(records)
        if chunk_warnings:
            warnings.append(f"{relative(chunk_file)}: {len(chunk_warnings)} invalid chunk records")
        file_reports.append(
            {
                "chunk_file": relative(chunk_file),
                "output_file": relative(output_path_for(chunk_file)),
                "chunks": len(records),
                "estimated_tokens": sum(int((record.get("metadata") or {}).get("token_estimate") or 0) for record in records),
                "warnings": chunk_warnings,
            }
        )

    summary = {
        "chunk_files": len(chunk_files),
        "chunks_total": total_chunks,
        "estimated_tokens_total": total_tokens,
        "warnings": warnings,
    }
    return file_reports, summary


def write_reports(mode: str, file_reports: list[dict[str, Any]], summary: dict[str, Any], model: str, dim: int) -> None:
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "embedding_model": model,
        "embedding_dim": dim,
        **summary,
        "files": file_reports,
    }
    json_path = APPLY_JSON if mode == "apply" else DRY_RUN_JSON
    csv_path = APPLY_CSV if mode == "apply" else DRY_RUN_CSV
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = [
        "chunk_file",
        "output_file",
        "chunks",
        "estimated_tokens",
        "embedded",
        "skipped_existing",
        "errors",
    ]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in file_reports:
            writer.writerow({field: item.get(field, "") for field in fields})


def apply_embeddings(
    chunk_files: list[Path],
    api_key: str,
    model: str,
    dim: int,
    retries: int,
    timeout: int,
    base_delay: float,
    sleep_between: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    file_reports: list[dict[str, Any]] = []
    total_embedded = 0
    total_skipped = 0
    total_errors = 0

    for file_index, chunk_file in enumerate(chunk_files, start=1):
        records = read_jsonl(chunk_file)
        out_path = output_path_for(chunk_file)
        done = existing_embedded_ids(out_path)
        embedded = 0
        skipped = 0
        errors: list[str] = []
        print(f"[{file_index}/{len(chunk_files)}] {relative(chunk_file)} chunks={len(records)} existing={len(done)}")

        with out_path.open("a", encoding="utf-8") as handle:
            for chunk_index, chunk in enumerate(records, start=1):
                chunk_id = chunk.get("chunk_id")
                if chunk_id in done:
                    skipped += 1
                    continue
                warnings = validate_chunk(chunk)
                if warnings:
                    errors.append(f"{chunk_id or '<missing>'}: {','.join(warnings)}")
                    total_errors += 1
                    continue
                try:
                    embedding = get_embedding_with_retry(
                        chunk["text"],
                        api_key=api_key,
                        model=model,
                        retries=retries,
                        timeout=timeout,
                        base_delay=base_delay,
                    )
                    if len(embedding) != dim:
                        errors.append(f"{chunk_id}: embedding_dim_mismatch:{len(embedding)}")
                        total_errors += 1
                        continue
                    record = build_embedding_record(chunk, embedding, model=model, dim=dim)
                    handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                    handle.flush()
                    done.add(chunk_id)
                    embedded += 1
                    total_embedded += 1
                    if embedded % 25 == 0:
                        print(f"  embedded {embedded} new chunks ({chunk_index}/{len(records)})")
                    if sleep_between:
                        time.sleep(sleep_between)
                except Exception as exc:  # noqa: BLE001 - keep partial output and report
                    errors.append(f"{chunk_id}: {exc}")
                    total_errors += 1
                    print(f"  ERROR {chunk_id}: {exc}")
                    break

        total_skipped += skipped
        file_reports.append(
            {
                "chunk_file": relative(chunk_file),
                "output_file": relative(out_path),
                "chunks": len(records),
                "estimated_tokens": sum(int((record.get("metadata") or {}).get("token_estimate") or 0) for record in records),
                "embedded": embedded,
                "skipped_existing": skipped,
                "errors": errors,
            }
        )

    summary = {
        "chunk_files": len(chunk_files),
        "chunks_total": sum(item["chunks"] for item in file_reports),
        "embedded_total": total_embedded,
        "skipped_existing_total": total_skipped,
        "errors_total": total_errors,
        "partial_save_safe": True,
        "vector_db_used": False,
    }
    return file_reports, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate embedding JSONL files from chunk JSONL files.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Input chunk folder, usually chunks/good.")
    parser.add_argument("--dry-run", action="store_true", help="Validate chunks and write dry-run report only.")
    parser.add_argument("--apply", action="store_true", help="Call OpenAI embeddings API and write embeddings JSONL.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--embedding-dim", type=int, default=DEFAULT_DIM)
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--base-delay", type=float, default=1.0)
    parser.add_argument("--sleep-between", type=float, default=0.0)
    args = parser.parse_args()

    if args.dry_run == args.apply:
        raise SystemExit("Choose exactly one mode: --dry-run or --apply.")

    input_dir = Path(args.input)
    if not input_dir.is_absolute():
        input_dir = ROOT / input_dir
    if not input_dir.exists():
        raise SystemExit(f"Input folder not found: {input_dir}")

    chunk_files = iter_chunk_files(input_dir)
    if args.dry_run:
        file_reports, summary = analyze_files(chunk_files)
        write_reports("dry-run", file_reports, summary, model=args.model, dim=args.embedding_dim)
        print("Embedding dry-run complete. No API calls were made.")
        print(f"Chunk files: {summary['chunk_files']}")
        print(f"Chunks total: {summary['chunks_total']}")
        print(f"Estimated tokens: {summary['estimated_tokens_total']}")
        print(f"Report JSON: {DRY_RUN_JSON}")
        print(f"Report CSV: {DRY_RUN_CSV}")
        return

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required for --apply.")

    file_reports, summary = apply_embeddings(
        chunk_files,
        api_key=api_key,
        model=args.model,
        dim=args.embedding_dim,
        retries=args.retries,
        timeout=args.timeout,
        base_delay=args.base_delay,
        sleep_between=args.sleep_between,
    )
    write_reports("apply", file_reports, summary, model=args.model, dim=args.embedding_dim)
    print("Embedding apply complete. Vector DB was not used.")
    print(f"Embedded new chunks: {summary['embedded_total']}")
    print(f"Skipped existing chunks: {summary['skipped_existing_total']}")
    print(f"Errors: {summary['errors_total']}")
    print(f"Report JSON: {APPLY_JSON}")
    print(f"Report CSV: {APPLY_CSV}")


if __name__ == "__main__":
    main()
