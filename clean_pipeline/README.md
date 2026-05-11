# Semantic Cleaning Pipeline

This local pipeline prepares `sorted_sources/good/` for a future RAG corpus. It does not call OpenAI, does not create embeddings, and does not ingest anything.

## Current Mode

Review with dry-run first:

```bash
python clean_pipeline/semantic_cleaner.py --input sorted_sources/good --dry-run
```

After review, write the cleaned corpus:

```bash
python clean_pipeline/semantic_cleaner.py --input sorted_sources/good --apply
```

## Architecture

```text
clean_pipeline/
  semantic_cleaner.py   # CLI entrypoint and report aggregation
  io_utils.py           # txt/md/docx readers and JSON writer
  text_normalizer.py    # OCR artifact, page marker, header/footer cleanup
  section_detector.py   # paragraph and block construction
  cleaning_rules.py     # local regex/rule definitions
  block_classifier.py   # conservative semantic block classifier
  stabilizer.py         # pre-embedding stabilization dry-run
  chunker.py            # semantic chunk generation without embeddings
  embedder.py           # embedding JSONL generation without vector DB
  retriever.py          # local FAISS index build/query without cloud vector DB
  rag_chat.py           # local RAG chat over FAISS, no Telegram integration

cleaned_corpus/         # future apply output; not written by dry-run
rejected_blocks/        # future apply output; not written by dry-run
reports/
  cleaning_dry_run.json
  cleaning_dry_run.csv
  cleaning_apply.json
  cleaning_apply.csv
  stabilization_report.json
  stabilization_report.csv
```

## Cleaning Strategy

Stage A is mechanical and conservative:

- normalize whitespace and line endings;
- remove page markers;
- detect repeated short headers/footers;
- repair obvious OCR line breaks;
- identify duplicate short paragraphs.

Stage B is semantic and block-aware:

- split into paragraph groups instead of deleting isolated words;
- classify blocks locally using keyword density, list density, bibliography patterns, OCR noise score, and theory/narrative score;
- reject only high-confidence structural or non-corpus blocks;
- keep low-confidence blocks as `review_unclear`;
- rescue blocks with strong explanatory/theory signals.

## Block Labels

Kept labels:

- `keep_theory`
- `keep_clinical`
- `keep_narrative`
- `review_unclear`

Rejected labels:

- `reject_toc`
- `reject_bibliography`
- `reject_test`
- `reject_questionnaire`
- `reject_exercise`
- `reject_scoring_key`
- `reject_ocr_noise`
- `reject_duplicate_paragraph`

## Metadata Schema

Future per-file metadata will follow this shape:

```json
{
  "original_path": "string",
  "cleaned_path": "string",
  "rejected_blocks_path": "string",
  "chars_before": 0,
  "chars_after": 0,
  "removed_sections_count": 0,
  "kept_blocks_count": 0,
  "rejected_blocks_count": 0,
  "cleaning_confidence": 0.0,
  "warnings": [],
  "categories_removed": {}
}
```

## Report Schema

`reports/cleaning_dry_run.json` contains:

- run metadata;
- aggregate chars before/after;
- aggregate removed block counts;
- removed category histogram;
- kept category histogram;
- examples of removed blocks;
- examples of kept theory/narrative blocks;
- per-file planned output paths;
- per-file warnings.

Dry-run does not write anything to `cleaned_corpus/` or `rejected_blocks/`. Apply writes:

- `cleaned_corpus/good/*.cleaned.txt`
- `cleaned_corpus/good/*.metadata.json`
- `rejected_blocks/good/*.rejected.jsonl`

## Stabilization Before Embeddings

Run the stabilization pass after semantic cleaning:

```bash
python clean_pipeline/stabilizer.py --input cleaned_corpus/good --dry-run
python clean_pipeline/stabilizer.py --input cleaned_corpus/good --apply
```

Apply creates a backup under `cleaned_corpus/_backups/` and writes a rollback-oriented manifest in `reports/`. The stabilizer handles:

- paragraph restoration for huge one-paragraph OCR files;
- duplicate candidate detection between `.ocr.raw.cleaned.txt` and `.cleaned.cleaned.txt`;
- conservative trailing TOC/bibliography/publisher cleanup;
- routing form/card documents to `cleaned_corpus/forms/`;
- marking duplicate candidates in metadata without deleting them.

It writes:

- `reports/stabilization_report.json`
- `reports/stabilization_report.csv`

## Semantic Chunking

Generate paragraph-aware chunks after stabilization:

```bash
python clean_pipeline/chunker.py --input cleaned_corpus/good --dry-run
python clean_pipeline/chunker.py --input cleaned_corpus/good --apply
```

The chunker excludes:

- files whose metadata has `stabilization.duplicate_status == "duplicate_candidate"`;
- `cleaned_corpus/forms/`.

Each chunk uses stable hashing:

```text
chunk_id = sha1(canonical_source + paragraph_range + normalized_text)
```

Required chunk fields:

- `chunk_id`
- `chunk_version = 1`
- `pipeline_version = "chunker_v1"`
- `text`
- `metadata.namespace`
- `metadata.language`
- `metadata.retrieval_weight`
- `metadata.source_file`
- `metadata.canonical_source`
- `metadata.logical_category`
- `metadata.duplicate_status`
- `metadata.paragraph_range`
- `metadata.chunk_index`
- `metadata.token_estimate`
- `metadata.stabilization`
- `metadata.quality`

Apply writes:

- `chunks/good/*.chunks.jsonl`
- `chunk_metadata/good/*.chunk_metadata.json`
- `chunk_metadata/corpus_chunk_manifest.json`
- `chunk_reports/chunk_apply_report.json`
- `chunk_reports/chunk_apply_report.csv`

## Embedding Generation Without Vector DB

Generate local embedding JSONL files from chunk JSONL files:

```bash
python clean_pipeline/embedder.py --input chunks/good --dry-run
python clean_pipeline/embedder.py --input chunks/good --apply
```

Default model:

```text
text-embedding-3-small
```

Dry-run validates chunks and writes `embedding_reports/embedding_dry_run_report.*` without API calls.

Apply writes:

- `embeddings/good/<source>.embeddings.jsonl`
- `embedding_reports/embedding_apply_report.json`
- `embedding_reports/embedding_apply_report.csv`

Each embedding row preserves chunk metadata exactly:

```json
{
  "chunk_id": "...",
  "embedding_model": "text-embedding-3-small",
  "embedding_dim": 1536,
  "embedding": [],
  "metadata": {}
}
```

This stage does not use a vector database, retrieval, reranking, prompting, or ingestion.

## Local FAISS Retrieval

Build a local FAISS index from embedding JSONL files:

```bash
python clean_pipeline/retriever.py --build-index --input embeddings/good
python clean_pipeline/retriever.py --query "страх одиночества" --top-k 8
```

Outputs:

- `vector_index/faiss.index`
- `vector_index/docstore.jsonl`
- `vector_index/index_manifest.json`
- `retrieval_reports/index_build_report.json`
- `retrieval_reports/test_query_report.json`

The index uses `faiss.IndexFlatIP` over L2-normalized vectors, which gives cosine similarity via inner product. It validates `embedding_dim = 1536` and preserves `chunk_id`, `text`, and `metadata` in the local docstore.

## Local RAG Chat

Run a grounded answer over the local FAISS index:

```bash
python clean_pipeline/rag_chat.py --query "страх одиночества"
```

Flow:

1. Embed user query with `text-embedding-3-small`.
2. Retrieve top-k chunks from local `vector_index/faiss.index`.
3. Deduplicate chunks by `chunk_id`.
4. Assemble context with source metadata and similarity scores.
5. Generate a grounded answer with `gpt-4.1-mini`.

Reports:

- `rag_reports/rag_query_report.json`
- `rag_reports/retrieved_context.json`
- `rag_reports/final_prompt.txt`

The response prompt requires grounding only in retrieved context and instructs the model to say when evidence is insufficient.
