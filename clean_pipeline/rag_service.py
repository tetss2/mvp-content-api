#!/usr/bin/env python3
"""Reusable local-first RAG service over the FAISS index.

This module keeps the current pipeline local-only:
query -> OpenAI embedding -> local FAISS retrieval -> context assembly ->
grounded OpenAI answer. It does not integrate with Telegram or any cloud vector
database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "vector_index" / "faiss.index"
DOCSTORE_PATH = ROOT / "vector_index" / "docstore.jsonl"
INDEX_MANIFEST_PATH = ROOT / "vector_index" / "index_manifest.json"
RAG_REPORTS = ROOT / "rag_reports"
RAG_QUERY_REPORT = RAG_REPORTS / "rag_query_report.json"
RETRIEVED_CONTEXT = RAG_REPORTS / "retrieved_context.json"
FINAL_PROMPT = RAG_REPORTS / "final_prompt.txt"
RETRIEVAL_LOG = RAG_REPORTS / "retrieval_log.jsonl"

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


def openai_json_request(
    url: str,
    payload: dict[str, Any],
    api_key: str,
    retries: int = 5,
    timeout: int = 90,
) -> dict[str, Any]:
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
            detail = exc.read().decode("utf-8", errors="ignore")
            if exc.code not in RETRYABLE_STATUS or attempt >= retries:
                raise RuntimeError(f"OpenAI HTTP {exc.code}: {detail[:800]}") from exc
            retry_after = exc.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else min(20.0, 1.0 * (2**attempt))
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt >= retries:
                raise RuntimeError(f"OpenAI request failed after retries: {exc}") from exc
            delay = min(20.0, 1.0 * (2**attempt))
        attempt += 1
        print(f"OpenAI retry in {delay:.1f}s (attempt {attempt}/{retries})", file=sys.stderr)
        time.sleep(delay)


class RagService:
    """Reusable service facade for local FAISS retrieval and grounded answers."""

    def __init__(
        self,
        index_path: Path = INDEX_PATH,
        docstore_path: Path = DOCSTORE_PATH,
        manifest_path: Path = INDEX_MANIFEST_PATH,
        embedding_model: str = EMBEDDING_MODEL,
        chat_model: str = CHAT_MODEL,
        context_limit_chars: int = DEFAULT_CONTEXT_CHARS,
        api_key: str | None = None,
    ) -> None:
        self.index_path = index_path
        self.docstore_path = docstore_path
        self.manifest_path = manifest_path
        self.embedding_model = embedding_model
        self.chat_model = chat_model
        self.context_limit_chars = context_limit_chars
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.faiss = None
        self.np = None
        self.index = None
        self.docstore: list[dict[str, Any]] = []
        self.manifest: dict[str, Any] = {}

    def load(self) -> "RagService":
        if not self.index_path.exists() or not self.docstore_path.exists():
            raise SystemExit("Missing vector_index/faiss.index or docstore.jsonl. Build index first.")
        self.faiss, self.np = require_vector_deps()
        self.index = self.faiss.read_index(relative(self.index_path))
        self.docstore = read_jsonl(self.docstore_path)
        if self.manifest_path.exists():
            self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        return self

    def retrieve(self, query: str, top_k: int = DEFAULT_TOP_K) -> list[dict[str, Any]]:
        self._ensure_loaded()
        if not self.api_key:
            raise SystemExit("OPENAI_API_KEY is required for query embedding.")
        started = time.time()
        query_embedding = self._embed_query(query)
        results = self._search(query_embedding, top_k)
        self._log_retrieval(query=query, top_k=top_k, results=results, elapsed=time.time() - started)
        return results

    def answer(self, query: str, top_k: int = DEFAULT_TOP_K) -> dict[str, Any]:
        self._ensure_loaded()
        if not self.api_key:
            raise SystemExit("OPENAI_API_KEY is required for query embedding and response generation.")
        started = time.time()
        retrieved = self.retrieve(query, top_k=top_k)
        context, used_context = self._assemble_context(retrieved)
        answer_text = self._generate_answer(query, context)
        confidence = self._score_confidence(retrieved)
        sources = self._normalize_sources(retrieved)
        response = {
            "answer": answer_text,
            "sources": sources,
            "retrieved_chunks": retrieved,
            "confidence": confidence["label"],
            "metadata": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "query": query,
                "top_k": top_k,
                "retrieved_count": len(retrieved),
                "context_chunk_count": len(used_context),
                "embedding_model": self.embedding_model,
                "chat_model": self.chat_model,
                "confidence_score": confidence["score"],
                "confidence_reasons": confidence["reasons"],
                "context_chars": len(context),
                "elapsed_seconds": round(time.time() - started, 3),
                "index": relative(self.index_path),
                "docstore": relative(self.docstore_path),
                "manifest": self.manifest,
            },
        }
        self._write_reports(query, top_k, retrieved, used_context, context, response)
        return response

    def _ensure_loaded(self) -> None:
        if self.index is None or not self.docstore:
            self.load()

    def _embed_query(self, query: str) -> list[float]:
        response = openai_json_request(
            OPENAI_EMBEDDINGS_URL,
            {"model": self.embedding_model, "input": query},
            api_key=self.api_key or "",
        )
        embedding = response["data"][0]["embedding"]
        if len(embedding) != EXPECTED_DIM:
            raise RuntimeError(f"Query embedding dim mismatch: {len(embedding)} != {EXPECTED_DIM}")
        return embedding

    def _search(self, query_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        if self.faiss is None or self.np is None or self.index is None:
            raise RuntimeError("RagService is not loaded.")
        vector = self.np.array([query_embedding], dtype="float32")
        self.faiss.normalize_L2(vector)
        overfetch = max(top_k * 3, top_k)
        scores, ids = self.index.search(vector, overfetch)

        seen_chunk_ids: set[str] = set()
        seen_text_hashes: set[str] = set()
        results: list[dict[str, Any]] = []
        for score, vector_id in zip(scores[0].tolist(), ids[0].tolist()):
            if vector_id < 0 or vector_id >= len(self.docstore):
                continue
            row = self.docstore[vector_id]
            chunk_id = row.get("chunk_id")
            text = row.get("text", "")
            text_hash = hashlib.sha1(" ".join(text.split()).encode("utf-8")).hexdigest()
            if not chunk_id or chunk_id in seen_chunk_ids or text_hash in seen_text_hashes:
                continue
            seen_chunk_ids.add(chunk_id)
            seen_text_hashes.add(text_hash)
            metadata = row.get("metadata", {})
            results.append(
                {
                    "score": float(score),
                    "vector_id": vector_id,
                    "chunk_id": chunk_id,
                    "text": text,
                    "metadata": metadata,
                    "source": self._source_label(metadata),
                }
            )
            if len(results) >= top_k:
                break
        return results

    def _assemble_context(self, results: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
        blocks: list[str] = []
        used: list[dict[str, Any]] = []
        current_len = 0
        for index, item in enumerate(results, start=1):
            metadata = item.get("metadata", {})
            paragraph_range = metadata.get("paragraph_range")
            header = (
                f"[{index}] score={item['score']:.4f} source={item.get('source') or self._source_label(metadata)} "
                f"paragraphs={paragraph_range} chunk_id={item['chunk_id']}"
            )
            block = f"{header}\n{item.get('text', '').strip()}"
            if current_len + len(block) > self.context_limit_chars and blocks:
                break
            blocks.append(block)
            used.append(item)
            current_len += len(block)
        return "\n\n---\n\n".join(blocks), used

    def _build_prompt(self, query: str, context: str) -> tuple[str, str]:
        system = (
            "Ты отвечаешь как аккуратный RAG-ассистент для базы знаний психолога/сексолога. "
            "Отвечай только на основании RETRIEVED_CONTEXT. "
            "Не добавляй факты, которых нет в контексте. "
            "Если контекст слабый или не содержит ответ, прямо скажи: "
            "\"В найденном контексте недостаточно оснований для уверенного ответа\". "
            "Пиши по-русски, ясно, бережно и без выдуманных ссылок."
        )
        user = f"USER_QUERY:\n{query}\n\nRETRIEVED_CONTEXT:\n{context}"
        return system, user

    def _generate_answer(self, query: str, context: str) -> str:
        system, user = self._build_prompt(query, context)
        response = openai_json_request(
            OPENAI_CHAT_COMPLETIONS_URL,
            {
                "model": self.chat_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.2,
            },
            api_key=self.api_key or "",
        )
        return response["choices"][0]["message"]["content"]

    def _score_confidence(self, results: list[dict[str, Any]]) -> dict[str, Any]:
        if not results:
            return {"label": "low", "score": 0.0, "reasons": ["no retrieved chunks"]}
        scores = [float(item.get("score", 0.0)) for item in results]
        best = max(scores)
        avg_top3 = sum(scores[:3]) / min(len(scores), 3)
        source_count = len({item.get("source") for item in results if item.get("source")})
        numeric = (best * 0.55) + (avg_top3 * 0.35) + (min(len(results), 5) / 5 * 0.10)
        if best >= 0.45 and avg_top3 >= 0.38 and len(results) >= 3:
            label = "high"
        elif best >= 0.34 and avg_top3 >= 0.28:
            label = "medium"
        else:
            label = "low"
        return {
            "label": label,
            "score": round(float(numeric), 4),
            "reasons": [
                f"best_score={best:.4f}",
                f"avg_top3={avg_top3:.4f}",
                f"retrieved_chunks={len(results)}",
                f"unique_sources={source_count}",
            ],
        }

    def _normalize_sources(self, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sources: dict[str, dict[str, Any]] = {}
        for item in results:
            metadata = item.get("metadata", {})
            label = self._source_label(metadata)
            if label not in sources:
                sources[label] = {
                    "source": label,
                    "source_file": metadata.get("source_file"),
                    "canonical_source": metadata.get("canonical_source"),
                    "chunks": [],
                    "best_score": float(item.get("score", 0.0)),
                }
            sources[label]["best_score"] = max(sources[label]["best_score"], float(item.get("score", 0.0)))
            sources[label]["chunks"].append(
                {
                    "chunk_id": item.get("chunk_id"),
                    "score": item.get("score"),
                    "paragraph_range": metadata.get("paragraph_range"),
                    "section_title": metadata.get("section_title") or metadata.get("heading"),
                }
            )
        return sorted(sources.values(), key=lambda source: source["best_score"], reverse=True)

    def _source_label(self, metadata: dict[str, Any]) -> str:
        return (
            metadata.get("canonical_source")
            or metadata.get("source_file")
            or metadata.get("document_id")
            or metadata.get("file_name")
            or "unknown"
        )

    def _log_retrieval(self, query: str, top_k: int, results: list[dict[str, Any]], elapsed: float) -> None:
        RAG_REPORTS.mkdir(parents=True, exist_ok=True)
        row = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "query": query,
            "top_k": top_k,
            "result_count": len(results),
            "elapsed_seconds": round(elapsed, 3),
            "scores": [round(float(item.get("score", 0.0)), 4) for item in results],
            "chunk_ids": [item.get("chunk_id") for item in results],
            "sources": [item.get("source") for item in results],
        }
        with RETRIEVAL_LOG.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    def _write_reports(
        self,
        query: str,
        top_k: int,
        results: list[dict[str, Any]],
        used_context: list[dict[str, Any]],
        context: str,
        response: dict[str, Any],
    ) -> None:
        RAG_REPORTS.mkdir(parents=True, exist_ok=True)
        system, user = self._build_prompt(query, context)
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
                    "generated_at": response["metadata"]["generated_at"],
                    "query": query,
                    "top_k": top_k,
                    "embedding_model": self.embedding_model,
                    "chat_model": self.chat_model,
                    "retrieved_count": len(results),
                    "context_chunk_count": len(used_context),
                    "retrieved_sources": response["sources"],
                    "confidence": response["confidence"],
                    "confidence_score": response["metadata"]["confidence_score"],
                    "answer": response["answer"],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Reusable local FAISS RAG service CLI.")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", type=int, default=DEFAULT_TOP_K)
    parser.add_argument("--context-limit-chars", type=int, default=DEFAULT_CONTEXT_CHARS)
    args = parser.parse_args()

    service = RagService(context_limit_chars=args.context_limit_chars).load()
    response = service.answer(args.query, top_k=args.top_k)
    print(json.dumps(response, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
