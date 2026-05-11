#!/usr/bin/env python3
"""JSON bridge for calling local RagService from Node.js.

MVP contract:
Node.js child_process -> this script -> RagService -> compact JSON on stdout.
No Telegram behavior is changed by this file.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

try:
    from .rag_service import DEFAULT_TOP_K, RagService
except ImportError:
    from rag_service import DEFAULT_TOP_K, RagService


def compact_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for source in sources:
        compact.append(
            {
                "source": source.get("source"),
                "source_file": source.get("source_file"),
                "canonical_source": source.get("canonical_source"),
                "best_score": source.get("best_score"),
                "chunks": [
                    {
                        "chunk_id": chunk.get("chunk_id"),
                        "score": chunk.get("score"),
                        "paragraph_range": chunk.get("paragraph_range"),
                        "section_title": chunk.get("section_title"),
                    }
                    for chunk in source.get("chunks", [])
                ],
            }
        )
    return compact


def bridge_response(query: str, top_k: int) -> dict[str, Any]:
    result = RagService().load().answer(query, top_k=top_k)
    metadata = dict(result.get("metadata", {}))
    manifest = metadata.get("manifest") or {}
    metadata["manifest"] = {
        "vectors": manifest.get("vectors"),
        "index_type": manifest.get("index_type"),
        "similarity": manifest.get("similarity"),
        "embedding_dim": manifest.get("embedding_dim"),
        "faiss_index": manifest.get("faiss_index"),
        "docstore": manifest.get("docstore"),
    }
    return {
        "ok": True,
        "answer": result.get("answer", ""),
        "sources": compact_sources(result.get("sources", [])),
        "confidence": result.get("confidence"),
        "metadata": metadata,
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Compact JSON bridge to local RagService.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    try:
        result = bridge_response(args.query, top_k=args.top_k)
        print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    except SystemExit as exc:
        message = str(exc) or "RagService exited with an error."
        print(json.dumps({"ok": False, "error": message}, ensure_ascii=False, indent=2 if args.pretty else None))
        raise SystemExit(1) from exc
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2 if args.pretty else None))
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
