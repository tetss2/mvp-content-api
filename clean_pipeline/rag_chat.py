#!/usr/bin/env python3
"""Local RAG chat over the FAISS index.

Flow:
query -> query embedding -> FAISS retrieval -> context assembly -> OpenAI
response generation. This script does not integrate with Telegram and does not
write to any vector database.
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
INDEX_PATH = ROOT / "vector_index" / "faiss.index"
DOCSTORE_PATH = ROOT / "vector_index" / "docstore.jsonl"
RAG_REPORTS = ROOT / "rag_reports"
RAG_QUERY_REPORT = RAG_REPORTS / "rag_query_report.json"
RETRIEVED_CONTEXT = RAG_REPORTS / "retrieved_context.json"
FINAL_PROMPT = RAG_REPORTS / "final_prompt.txt"

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4.1-mini"
EXPECTED_DIM = 1536
DEFAULT_TOP_K = 8
DEFAULT_CONTEXT_CHARS = 18_000

OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


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
        raise SystemExit("Missing local FAISS dependencies. Install with: python -m pip install faiss-cpu numpy") from exc
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


def openai_json_request(url: str, payload: dict[str, Any], api_key: str, retries: int = 5, timeout: int = 90) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    attempt = 0
    while True:
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - explicit OpenAI API URL
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRYABLE_STATUS or attempt >= retries:
                detail = exc.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"OpenAI HTTP {exc.code}: {detail[:800]}") from exc
            retry_after = exc.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else min(20.0, 1.0 * (2**attempt))
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt >= retries:
                raise RuntimeError(f"OpenAI request failed after retries: {exc}") from exc
            delay = min(20.0, 1.0 * (2**attempt))
        attempt += 1
        print(f"OpenAI retry in {delay:.1f}s (attempt {attempt}/{retries})")
        time.sleep(delay)


def embed_query(query: str, api_key: str) -> list[float]:
    response = openai_json_request(
        OPENAI_EMBEDDINGS_URL,
        {"model": EMBEDDING_MODEL, "input": query},
        api_key=api_key,
    )
    embedding = response["data"][0]["embedding"]
    if len(embedding) != EXPECTED_DIM:
        raise RuntimeError(f"Query embedding dim mismatch: {len(embedding)} != {EXPECTED_DIM}")
    return embedding


def search_faiss(query_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
    faiss, np = require_vector_deps()
    if not INDEX_PATH.exists() or not DOCSTORE_PATH.exists():
        raise SystemExit("Missing vector_index/faiss.index or docstore.jsonl. Build index first.")
    index = faiss.read_index(relative(INDEX_PATH))
    docstore = read_jsonl(DOCSTORE_PATH)
    vector = np.array([query_embedding], dtype="float32")
    faiss.normalize_L2(vector)
    scores, ids = index.search(vector, max(top_k * 2, top_k))

    seen: set[str] = set()
    results: list[dict[str, Any]] = []
    for score, vector_id in zip(scores[0].tolist(), ids[0].tolist()):
        if vector_id < 0 or vector_id >= len(docstore):
            continue
        row = docstore[vector_id]
        chunk_id = row.get("chunk_id")
        if not chunk_id or chunk_id in seen:
            continue
        seen.add(chunk_id)
        results.append(
            {
                "score": float(score),
                "vector_id": vector_id,
                "chunk_id": chunk_id,
                "text": row.get("text", ""),
                "metadata": row.get("metadata", {}),
            }
        )
        if len(results) >= top_k:
            break
    return results


def assemble_context(results: list[dict[str, Any]], context_limit_chars: int) -> tuple[str, list[dict[str, Any]]]:
    blocks: list[str] = []
    used: list[dict[str, Any]] = []
    current_len = 0
    for index, item in enumerate(results, start=1):
        metadata = item["metadata"]
        source = metadata.get("canonical_source") or metadata.get("source_file") or "unknown"
        paragraph_range = metadata.get("paragraph_range")
        header = f"[{index}] score={item['score']:.4f} source={source} paragraphs={paragraph_range} chunk_id={item['chunk_id']}"
        block = f"{header}\n{item['text'].strip()}"
        if current_len + len(block) > context_limit_chars and blocks:
            break
        blocks.append(block)
        used.append(item)
        current_len += len(block)
    return "\n\n---\n\n".join(blocks), used


def build_prompt(query: str, context: str) -> tuple[str, str]:
    system = (
        "Ты отвечаешь как аккуратный RAG-ассистент для базы знаний психолога/сексолога. "
        "Отвечай только на основании RETRIEVED_CONTEXT. "
        "Не добавляй факты, которых нет в контексте. "
        "Если контекст слабый или не содержит ответа, прямо скажи: "
        "\"В найденном контексте недостаточно оснований для уверенного ответа\". "
        "Пиши по-русски, ясно, бережно и без выдуманных ссылок."
    )
    user = f"USER_QUERY:\n{query}\n\nRETRIEVED_CONTEXT:\n{context}"
    return system, user


def generate_answer(query: str, context: str, api_key: str) -> str:
    system, user = build_prompt(query, context)
    response = openai_json_request(
        OPENAI_CHAT_COMPLETIONS_URL,
        {
            "model": CHAT_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        },
        api_key=api_key,
    )
    return response["choices"][0]["message"]["content"]


def write_reports(query: str, top_k: int, results: list[dict[str, Any]], used_context: list[dict[str, Any]], context: str, answer: str) -> None:
    RAG_REPORTS.mkdir(parents=True, exist_ok=True)
    system, user = build_prompt(query, context)
    FINAL_PROMPT.write_text(f"SYSTEM:\n{system}\n\nUSER:\n{user}", encoding="utf-8")
    RETRIEVED_CONTEXT.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "query": query,
                "top_k": top_k,
                "retrieved": used_context,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    RAG_QUERY_REPORT.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "query": query,
                "top_k": top_k,
                "embedding_model": EMBEDDING_MODEL,
                "chat_model": CHAT_MODEL,
                "retrieved_count": len(used_context),
                "retrieved_sources": [
                    {
                        "score": item["score"],
                        "chunk_id": item["chunk_id"],
                        "source_file": item["metadata"].get("source_file"),
                        "canonical_source": item["metadata"].get("canonical_source"),
                        "paragraph_range": item["metadata"].get("paragraph_range"),
                    }
                    for item in used_context
                ],
                "answer": answer,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Local FAISS RAG chat without Telegram integration.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--context-limit-chars", type=int, default=DEFAULT_CONTEXT_CHARS)
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required for query embedding and response generation.")

    query_embedding = embed_query(args.query, api_key)
    results = search_faiss(query_embedding, args.top_k)
    context, used_context = assemble_context(results, args.context_limit_chars)
    answer = generate_answer(args.query, context, api_key)
    write_reports(args.query, args.top_k, results, used_context, context, answer)

    print("Retrieved chunks:")
    for index, item in enumerate(used_context, start=1):
        source = item["metadata"].get("canonical_source") or item["metadata"].get("source_file")
        print(f"{index}. score={item['score']:.4f} source={source} chunk_id={item['chunk_id']}")
    print("\nAnswer:\n")
    print(answer)
    print(f"\nReports: {RAG_QUERY_REPORT}, {RETRIEVED_CONTEXT}, {FINAL_PROMPT}")


if __name__ == "__main__":
    main()
