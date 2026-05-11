#!/usr/bin/env python3
"""Local FAISS retrieval pipeline for generated embeddings.

This script builds and queries a local FAISS index only. It does not connect to
cloud vector databases, Telegram, rerankers, or prompting pipelines.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "embeddings" / "good"
INDEX_DIR = ROOT / "vector_index"
FAISS_INDEX_PATH = INDEX_DIR / "faiss.index"
DOCSTORE_PATH = INDEX_DIR / "docstore.jsonl"
INDEX_MANIFEST_PATH = INDEX_DIR / "index_manifest.json"
REPORT_DIR = ROOT / "retrieval_reports"
INDEX_BUILD_REPORT = REPORT_DIR / "index_build_report.json"
TEST_QUERY_REPORT = REPORT_DIR / "test_query_report.json"
CHUNKS_DIR = ROOT / "chunks" / "good"

EXPECTED_DIM = 1536
DEFAULT_QUERY_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def require_vector_deps():
    try:
        import faiss  # type: ignore
        import numpy as np  # type: ignore
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing local FAISS dependencies. Install locally with: "
            "python -m pip install faiss-cpu numpy"
        ) from exc
    return faiss, np


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL in {path}:{line_number}: {exc}") from exc
    return rows


def load_chunk_text_map(chunks_dir: Path = CHUNKS_DIR) -> dict[str, str]:
    text_by_id: dict[str, str] = {}
    if not chunks_dir.exists():
        return text_by_id
    for chunk_file in sorted(chunks_dir.glob("*.chunks.jsonl")):
        for row in read_jsonl(chunk_file):
            chunk_id = row.get("chunk_id")
            text = row.get("text")
            if chunk_id and text:
                text_by_id[chunk_id] = text
    return text_by_id


def load_embedding_records(input_dir: Path) -> tuple[list[dict[str, Any]], list[str]]:
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    text_by_id = load_chunk_text_map()
    embedding_files = sorted(input_dir.glob("*.embeddings.jsonl"))
    for embedding_file in embedding_files:
        for row in read_jsonl(embedding_file):
            chunk_id = row.get("chunk_id")
            embedding = row.get("embedding")
            metadata = row.get("metadata")
            dim = row.get("embedding_dim")
            if not chunk_id or not isinstance(embedding, list) or not isinstance(metadata, dict):
                warnings.append(f"{relative(embedding_file)}: skipped invalid embedding row")
                continue
            if dim != EXPECTED_DIM or len(embedding) != EXPECTED_DIM:
                raise ValueError(
                    f"Embedding dim mismatch for {chunk_id}: row_dim={dim}, vector_len={len(embedding)}, expected={EXPECTED_DIM}"
                )
            text = row.get("text") or text_by_id.get(chunk_id)
            if not text:
                warnings.append(f"{chunk_id}: missing chunk text; docstore text will be empty")
                text = ""
            records.append(
                {
                    "chunk_id": chunk_id,
                    "text": text,
                    "metadata": metadata,
                    "embedding": embedding,
                    "embedding_model": row.get("embedding_model"),
                    "embedding_dim": dim,
                    "source_embedding_file": relative(embedding_file),
                }
            )
    return records, warnings


def build_index(input_dir: Path) -> dict[str, Any]:
    faiss, np = require_vector_deps()
    records, warnings = load_embedding_records(input_dir)
    if not records:
        raise SystemExit(f"No embedding records found in {input_dir}")

    vectors = np.array([record["embedding"] for record in records], dtype="float32")
    faiss.normalize_L2(vectors)
    index = faiss.IndexFlatIP(EXPECTED_DIM)
    index.add(vectors)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    # FAISS on Windows can fail on absolute paths containing non-ASCII user
    # directories. Use an ASCII-only repo-relative path for native IO.
    faiss.write_index(index, relative(FAISS_INDEX_PATH))
    with DOCSTORE_PATH.open("w", encoding="utf-8") as handle:
        for vector_id, record in enumerate(records):
            handle.write(
                json.dumps(
                    {
                        "vector_id": vector_id,
                        "chunk_id": record["chunk_id"],
                        "text": record["text"],
                        "metadata": record["metadata"],
                        "embedding_model": record["embedding_model"],
                        "embedding_dim": record["embedding_dim"],
                        "source_embedding_file": record["source_embedding_file"],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "index_type": "faiss.IndexFlatIP",
        "similarity": "cosine_similarity_via_l2_normalized_inner_product",
        "embedding_dim": EXPECTED_DIM,
        "vectors": len(records),
        "faiss_index": relative(FAISS_INDEX_PATH),
        "docstore": relative(DOCSTORE_PATH),
        "input_dir": relative(input_dir),
        "warnings": warnings,
    }
    INDEX_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_BUILD_REPORT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def embed_query(text: str, api_key: str, model: str) -> list[float]:
    payload = json.dumps({"model": model, "input": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        OPENAI_EMBEDDINGS_URL,
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - explicit OpenAI API endpoint
        body = json.loads(response.read().decode("utf-8"))
    embedding = body["data"][0]["embedding"]
    if len(embedding) != EXPECTED_DIM:
        raise RuntimeError(f"Query embedding dim mismatch: {len(embedding)} != {EXPECTED_DIM}")
    return embedding


def query_index(query: str, top_k: int, model: str) -> dict[str, Any]:
    faiss, np = require_vector_deps()
    if not FAISS_INDEX_PATH.exists() or not DOCSTORE_PATH.exists():
        raise SystemExit("Missing FAISS index/docstore. Run --build-index first.")
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required for text --query embedding.")

    index = faiss.read_index(relative(FAISS_INDEX_PATH))
    docstore = read_jsonl(DOCSTORE_PATH)
    query_vector = np.array([embed_query(query, api_key=api_key, model=model)], dtype="float32")
    faiss.normalize_L2(query_vector)
    scores, ids = index.search(query_vector, top_k)
    results: list[dict[str, Any]] = []
    for score, vector_id in zip(scores[0].tolist(), ids[0].tolist()):
        if vector_id < 0 or vector_id >= len(docstore):
            continue
        row = docstore[vector_id]
        results.append(
            {
                "score": float(score),
                "vector_id": vector_id,
                "chunk_id": row["chunk_id"],
                "text": row["text"],
                "metadata": row["metadata"],
            }
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "top_k": top_k,
        "query_embedding_model": model,
        "results": results,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    TEST_QUERY_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Build/query local FAISS index from embedding JSONL files.")
    parser.add_argument("--build-index", action="store_true", help="Build local FAISS index from embeddings.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Input embeddings folder.")
    parser.add_argument("--query", help="Text query to embed and search in local FAISS index.")
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--query-model", default=DEFAULT_QUERY_MODEL)
    args = parser.parse_args()

    if args.build_index == bool(args.query):
        raise SystemExit("Choose exactly one mode: --build-index or --query.")

    if args.build_index:
        input_dir = Path(args.input)
        if not input_dir.is_absolute():
            input_dir = ROOT / input_dir
        start = time.time()
        manifest = build_index(input_dir)
        print("FAISS index build complete.")
        print(f"Vectors: {manifest['vectors']}")
        print(f"Index: {FAISS_INDEX_PATH}")
        print(f"Docstore: {DOCSTORE_PATH}")
        print(f"Report: {INDEX_BUILD_REPORT}")
        print(f"Elapsed: {time.time() - start:.2f}s")
        return

    report = query_index(args.query or "", top_k=args.top_k, model=args.query_model)
    print(f"Query complete. Results: {len(report['results'])}")
    print(f"Report: {TEST_QUERY_REPORT}")
    for item in report["results"]:
        preview = " ".join(item["text"].split())[:180]
        print(f"{item['score']:.4f} {item['chunk_id']} {preview}")


if __name__ == "__main__":
    main()
