#!/usr/bin/env python3
"""Local RAG chat over the FAISS index.

Human-readable CLI wrapper around RagService. This script keeps Telegram out of
the loop and uses the reusable local-first service layer for retrieval and
answer generation.
"""

from __future__ import annotations

import argparse
from typing import Any

try:
    from .rag_service import DEFAULT_CONTEXT_CHARS, DEFAULT_TOP_K, RAG_QUERY_REPORT, RETRIEVED_CONTEXT, FINAL_PROMPT, RagService
except ImportError:
    from rag_service import DEFAULT_CONTEXT_CHARS, DEFAULT_TOP_K, RAG_QUERY_REPORT, RETRIEVED_CONTEXT, FINAL_PROMPT, RagService


def embed_query(query: str, api_key: str | None = None) -> list[float]:
    return RagService(api_key=api_key).load()._embed_query(query)


def search_faiss(query_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
    return RagService().load()._search(query_embedding, top_k)


def assemble_context(
    results: list[dict[str, Any]],
    context_limit_chars: int = DEFAULT_CONTEXT_CHARS,
) -> tuple[str, list[dict[str, Any]]]:
    return RagService(context_limit_chars=context_limit_chars).load()._assemble_context(results)


def generate_answer(query: str, context: str, api_key: str | None = None) -> str:
    return RagService(api_key=api_key).load()._generate_answer(query, context)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local FAISS RAG chat without Telegram integration.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--context-limit-chars", type=int, default=DEFAULT_CONTEXT_CHARS)
    args = parser.parse_args()

    response = RagService(context_limit_chars=args.context_limit_chars).load().answer(args.query, top_k=args.top_k)

    print("Retrieved chunks:")
    for index, item in enumerate(response["retrieved_chunks"], start=1):
        print(f"{index}. score={item['score']:.4f} source={item.get('source')} chunk_id={item['chunk_id']}")
    print(f"\nConfidence: {response['confidence']}")
    print("\nAnswer:\n")
    print(response["answer"])
    print(f"\nReports: {RAG_QUERY_REPORT}, {RETRIEVED_CONTEXT}, {FINAL_PROMPT}")


if __name__ == "__main__":
    main()
