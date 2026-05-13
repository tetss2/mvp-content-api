import "dotenv/config";

import { mkdir, writeFile } from "fs/promises";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { estimateKbTokens, retrieveGroundingContext } from "../retrieval_service.js";
import { buildSexologistPrompt } from "../sexologist_prompt.js";

process.env.ENABLE_KB_RETRIEVAL = "true";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPORTS_DIR = join(ROOT, "knowledge_indexes", "sexologist", "reports");
const ANSWER_MODEL = process.env.KB_EVAL_ANSWER_MODEL || "gpt-4o-mini";
const JUDGE_MODEL = process.env.KB_EVAL_JUDGE_MODEL || "gpt-4o-mini";
const DEFAULT_TOP_K = Number(process.env.KB_TOP_K || process.env.KB_RETRIEVAL_TOP_K || 5);
const DEFAULT_MAX_CONTEXT_TOKENS = Number(process.env.KB_MAX_CONTEXT_TOKENS || 2500);
const DEFAULT_LENGTH_MODE = "normal";
const DEFAULT_STYLE_KEY = "auto";

const EVALUATION_QUESTIONS = [
  { topic: "libido", question: "Почему у женщины может пропасть либидо в длительных отношениях, и что с этим делать бережно?" },
  { topic: "anxiety", question: "Как тревога влияет на сексуальное желание и возбуждение?" },
  { topic: "orgasm", question: "Почему оргазм может не получаться даже при любви к партнеру?" },
  { topic: "relationships", question: "Как близость и конфликты в паре связаны с сексуальным желанием?" },
  { topic: "male sexuality", question: "Что важно объяснить мужчине, который переживает из-за нестабильной эрекции?" },
  { topic: "female sexuality", question: "Как говорить о женской сексуальности без стыда и давления на норму?" },
  { topic: "shame", question: "Откуда берется стыд за свои желания и как с ним обходиться?" },
  { topic: "sexual communication", question: "Как начать разговор с партнером о сексе, желаниях и границах?" },
  { topic: "trauma", question: "Как сексуальная травма может проявляться в отношениях и интимности?" },
  { topic: "attachment", question: "Как тревожная или избегающая привязанность влияет на сексуальность в паре?" },
];

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function repoRelative(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function parseArgs(argv) {
  const args = {
    judge: false,
    limit: null,
    topK: DEFAULT_TOP_K,
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    lengthMode: DEFAULT_LENGTH_MODE,
    styleKey: DEFAULT_STYLE_KEY,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--judge") args.judge = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--top-k" || arg === "--topK") args.topK = Number(argv[++i]);
    else if (arg === "--max-context-tokens") args.maxContextTokens = Number(argv[++i]);
    else if (arg === "--length") args.lengthMode = argv[++i] || args.lengthMode;
    else if (arg === "--style") args.styleKey = argv[++i] || args.styleKey;
  }

  if (!Number.isInteger(args.topK) || args.topK <= 0) throw new Error("--top-k must be a positive integer.");
  if (!Number.isInteger(args.maxContextTokens) || args.maxContextTokens <= 0) {
    throw new Error("--max-context-tokens must be a positive integer.");
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }

  return args;
}

function lengthInstruction(lengthMode) {
  return {
    short: "Напиши короткий пост: строго 2 абзаца, до 600 символов. Без нумерованных списков. С одной жирной фразой (*жирный*).",
    normal: "Напиши пост: 3-4 коротких абзаца, до 1200 символов. Без нумерованных списков. С одной жирной фразой (*жирный*).",
    long: "Напиши развернутый пост: 4-6 коротких абзацев, до 1800 символов. Без нумерованных списков. С одной жирной фразой (*жирный*).",
  }[lengthMode] || "Напиши пост: 3-4 коротких абзаца. Без нумерованных списков. С одной жирной фразой (*жирный*).";
}

function maxTokensFor(lengthMode) {
  return { short: 280, normal: 560, long: 800 }[lengthMode] || 560;
}

function fallbackContext(question) {
  return [
    `Тема запроса: "${question}".`,
    "Retrieval disabled for this variant. Answer from general professional sexology and psychology knowledge only.",
    "Do not invent studies, statistics, named protocols, or source-specific claims.",
  ].join("\n");
}

function buildMessages({ question, context, lengthMode, styleKey }) {
  return [
    { role: "system", content: buildSexologistPrompt(styleKey) },
    {
      role: "user",
      content: `Тема: "${question}"\n\nКонтекст:\n${context}\n\n${lengthInstruction(lengthMode)}`,
    },
  ];
}

async function generateAnswer(openai, { question, context, lengthMode, styleKey }) {
  const messages = buildMessages({ question, context, lengthMode, styleKey });
  const completion = await openai.chat.completions.create({
    model: ANSWER_MODEL,
    messages,
    temperature: 0.72,
    max_tokens: maxTokensFor(lengthMode),
  });

  const answer = completion.choices[0]?.message?.content?.trim() || "";
  return {
    answer,
    prompt_token_estimate: estimateKbTokens(messages.map((message) => message.content).join("\n\n")),
    completion_tokens: completion.usage?.completion_tokens ?? null,
    prompt_tokens: completion.usage?.prompt_tokens ?? null,
    total_tokens: completion.usage?.total_tokens ?? null,
  };
}

function normalizeForDuplicateDetection(text = "") {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function detectDuplicateChunks(chunks = []) {
  const byChunkId = new Map();
  const byText = new Map();

  for (const chunk of chunks) {
    const chunkId = chunk.chunk_id || null;
    if (chunkId) byChunkId.set(chunkId, [...(byChunkId.get(chunkId) || []), chunk.rank ?? null]);

    const normalized = normalizeForDuplicateDetection(chunk.text).slice(0, 800);
    if (normalized) byText.set(normalized, [...(byText.get(normalized) || []), chunk.chunk_id || chunk.rank || null]);
  }

  const duplicateChunkIds = [...byChunkId.entries()]
    .filter(([, ranks]) => ranks.length > 1)
    .map(([chunk_id, ranks]) => ({ chunk_id, occurrences: ranks.length, ranks }));
  const duplicateTexts = [...byText.entries()]
    .filter(([, identifiers]) => identifiers.length > 1)
    .map(([, identifiers]) => ({ occurrences: identifiers.length, identifiers }));

  return {
    has_duplicates: duplicateChunkIds.length > 0 || duplicateTexts.length > 0,
    duplicate_chunk_ids: duplicateChunkIds,
    duplicate_text_groups: duplicateTexts,
  };
}

function answerLength(answer = "") {
  const trimmed = answer.trim();
  return {
    chars: trimmed.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).filter(Boolean).length : 0,
  };
}

function sourceLabel(chunk) {
  const source = chunk.source || {};
  return source.source_file || source.cleaned_file || source.source_id || chunk.chunk_id || "unknown";
}

function retrievedSourceDetails(retrieval) {
  return (retrieval?.chunks || []).map((chunk) => ({
    rank: chunk.rank ?? null,
    score: Number.isFinite(chunk.score) ? chunk.score : null,
    rerank: chunk.rerank || null,
    chunk_id: chunk.chunk_id || null,
    source: sourceLabel(chunk),
    vector_id: chunk.vector_id ?? null,
  }));
}

function preview(text = "", maxChars = 380) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, maxChars).trim()}...`;
}

function judgeSystemPrompt() {
  return [
    "You are an evaluation judge for Russian sexology/psychology social media answers.",
    "Compare two answers to the same question: A without retrieval and B with retrieval.",
    "Score each answer from 1 to 5 on factual_grounding, specificity, empathy, hallucination_risk, and practical_usefulness.",
    "For hallucination_risk, 5 means low risk and 1 means high risk.",
    "Return strict JSON with keys answer_without_retrieval, answer_with_retrieval, comparative_summary, winner.",
  ].join(" ");
}

async function judgeAnswers(openai, item) {
  const userPayload = {
    question: item.question,
    retrieved_sources: item.retrieved_sources,
    retrieved_scores: item.retrieved_scores,
    retrieval_context_preview: preview(item.retrieval_context),
    answer_without_retrieval: item.answer_without_retrieval,
    answer_with_retrieval: item.answer_with_retrieval,
  };

  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: judgeSystemPrompt() },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
    max_tokens: 700,
  });

  const content = completion.choices[0]?.message?.content || "{}";
  try {
    return {
      scores: JSON.parse(content),
      usage: completion.usage || null,
    };
  } catch (err) {
    return {
      scores: null,
      parse_error: err.message,
      raw_response: content,
      usage: completion.usage || null,
    };
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

function printSideBySide(item) {
  console.log("");
  console.log(`Question: ${item.question}`);
  console.log(`Sources: ${item.retrieved_sources.length ? item.retrieved_sources.join(", ") : "none"}`);
  if (item.retrieval_diversity) {
    console.log("[retrieval-diversity]");
    console.log(`unique_sources=${item.retrieval_diversity.unique_sources}`);
    console.log(`duplicate_chunks_removed=${item.retrieval_diversity.duplicate_chunks_removed}`);
    console.log(`final_chunk_count=${item.retrieval_diversity.final_chunk_count}`);
    console.log(`source_distribution=${JSON.stringify(item.retrieval_diversity.source_distribution)}`);
    console.log(`before_dedup_unique_sources=${item.retrieval_diversity.before_dedup.unique_sources}`);
    console.log(`after_dedup_unique_sources=${item.retrieval_diversity.after_dedup.unique_sources}`);
  }
  if (item.retrieval_rerank) {
    console.log("[retrieval-rerank]");
    console.log(`average_semantic_score=${item.retrieval_rerank.average_semantic_score}`);
    console.log(`average_quality_score=${item.retrieval_rerank.average_quality_score}`);
    console.log(`source_diversity=${item.retrieval_rerank.source_diversity}`);
    console.log(`overlap_reduction=${item.retrieval_rerank.overlap_reduction}`);
    console.log(`final_chunk_relevance=${item.retrieval_rerank.final_chunk_relevance}`);
  }
  console.log("WITHOUT retrieval:");
  console.log(preview(item.answer_without_retrieval, 700));
  console.log("WITH retrieval:");
  console.log(preview(item.answer_with_retrieval, 700));
}

function summarizeRerank(results) {
  const metrics = results
    .map((item) => item.retrieval_rerank)
    .filter(Boolean);
  const average = (values) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : 0;

  return {
    evaluated_queries: metrics.length,
    average_semantic_score: average(metrics.map((metric) => metric.average_semantic_score)),
    average_quality_score: average(metrics.map((metric) => metric.average_quality_score)),
    source_diversity: average(metrics.map((metric) => metric.source_diversity)),
    overlap_reduction: average(metrics.map((metric) => metric.overlap_reduction)),
    final_chunk_relevance: average(metrics.map((metric) => metric.final_chunk_relevance)),
    penalized_chunks_total: metrics.reduce((sum, metric) => sum + (metric.penalized_chunks?.length || 0), 0),
    boosted_chunks_total: metrics.reduce((sum, metric) => sum + (metric.boosted_chunks?.length || 0), 0),
  };
}

function summarizeDiversity(results) {
  const metrics = results
    .map((item) => item.retrieval_diversity)
    .filter(Boolean);
  const average = (values) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : 0;

  return {
    evaluated_queries: metrics.length,
    before_dedup: {
      avg_unique_sources: average(metrics.map((metric) => metric.before_dedup.unique_sources)),
      avg_chunk_count: average(metrics.map((metric) => metric.before_dedup.chunk_count)),
    },
    after_dedup: {
      avg_unique_sources: average(metrics.map((metric) => metric.after_dedup.unique_sources)),
      avg_chunk_count: average(metrics.map((metric) => metric.after_dedup.chunk_count)),
    },
    duplicate_chunks_removed_total: metrics.reduce((sum, metric) => sum + metric.duplicate_chunks_removed, 0),
  };
}

async function evaluateQuestion(openai, questionConfig, args) {
  const retrieval = await retrieveGroundingContext(questionConfig.question, "sexologist", {
    topK: args.topK,
    maxContextTokens: args.maxContextTokens,
  });
  const retrievalContext = retrieval?.context || "";

  const withoutRetrieval = await generateAnswer(openai, {
    question: questionConfig.question,
    context: fallbackContext(questionConfig.question),
    lengthMode: args.lengthMode,
    styleKey: args.styleKey,
  });

  const withRetrieval = await generateAnswer(openai, {
    question: questionConfig.question,
    context: retrievalContext || fallbackContext(questionConfig.question),
    lengthMode: args.lengthMode,
    styleKey: args.styleKey,
  });

  const retrievedSources = retrievedSourceDetails(retrieval);
  const item = {
    topic: questionConfig.topic,
    question: questionConfig.question,
    retrieval_used: {
      answer_without_retrieval: false,
      answer_with_retrieval: Boolean(retrievalContext),
    },
    retrieved_sources: retrievedSources.map((source) => source.source),
    retrieved_scores: retrievedSources.map((source) => source.score),
    retrieved_source_details: retrievedSources,
    retrieval_diversity: retrieval?.diversityMetrics || null,
    retrieval_rerank: retrieval?.rerankMetrics || null,
    retrieval_context: retrievalContext,
    answer_without_retrieval: withoutRetrieval.answer,
    answer_with_retrieval: withRetrieval.answer,
    token_estimates: {
      retrieval_context_tokens: retrieval?.estimatedTokens || estimateKbTokens(retrievalContext),
      without_retrieval_prompt_tokens: withoutRetrieval.prompt_token_estimate,
      with_retrieval_prompt_tokens: withRetrieval.prompt_token_estimate,
      api_usage: {
        without_retrieval: {
          prompt_tokens: withoutRetrieval.prompt_tokens,
          completion_tokens: withoutRetrieval.completion_tokens,
          total_tokens: withoutRetrieval.total_tokens,
        },
        with_retrieval: {
          prompt_tokens: withRetrieval.prompt_tokens,
          completion_tokens: withRetrieval.completion_tokens,
          total_tokens: withRetrieval.total_tokens,
        },
      },
    },
    heuristics: {
      answer_length: {
        without_retrieval: answerLength(withoutRetrieval.answer),
        with_retrieval: answerLength(withRetrieval.answer),
      },
      source_count: retrievedSources.length,
      retrieval_context_size: {
        chars: retrievalContext.length,
        estimated_tokens: retrieval?.estimatedTokens || estimateKbTokens(retrievalContext),
      },
      retrieval_quality: {
        average_semantic_score: retrieval?.rerankMetrics?.average_semantic_score ?? null,
        average_quality_score: retrieval?.rerankMetrics?.average_quality_score ?? null,
        source_diversity: retrieval?.rerankMetrics?.source_diversity ?? null,
        overlap_reduction: retrieval?.rerankMetrics?.overlap_reduction ?? null,
        final_chunk_relevance: retrieval?.rerankMetrics?.final_chunk_relevance ?? null,
      },
      duplicate_chunk_detection: detectDuplicateChunks(retrieval?.chunks || []),
    },
    production_version: retrieval?.productionVersion || null,
    manifest_info: retrieval?.manifestInfo || null,
  };

  if (args.judge) {
    item.judge = await judgeAnswers(openai, item);
  }

  return item;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for retrieval quality evaluation.");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const questions = args.limit ? EVALUATION_QUESTIONS.slice(0, args.limit) : EVALUATION_QUESTIONS;
  const reportPath = join(REPORTS_DIR, `retrieval_quality_${timestampId()}.json`);
  const results = [];

  console.log("Sexologist retrieval quality evaluation");
  console.log(`Questions: ${questions.length}`);
  console.log(`Judge mode: ${args.judge ? "on" : "off"}`);
  console.log(`Report target: ${repoRelative(reportPath)}`);

  for (let index = 0; index < questions.length; index += 1) {
    const questionConfig = questions[index];
    console.log("");
    console.log(`[${index + 1}/${questions.length}] ${questionConfig.topic}: ${questionConfig.question}`);
    const item = await evaluateQuestion(openai, questionConfig, args);
    results.push(item);
    printSideBySide(item);
  }

  const report = {
    type: "sexologist_retrieval_quality_evaluation",
    generated_at: nowIso(),
    safety: {
      local_only: true,
      production_indexes_modified: false,
      railway_deployed: false,
      writes: [repoRelative(reportPath)],
    },
    config: {
      answer_model: ANSWER_MODEL,
      judge_model: args.judge ? JUDGE_MODEL : null,
      judge_enabled: args.judge,
      top_k: args.topK,
      max_context_tokens: args.maxContextTokens,
      length_mode: args.lengthMode,
      style_key: args.styleKey,
      retrieval_feature_flag_for_script: process.env.ENABLE_KB_RETRIEVAL,
    },
    questions: results,
    diversity_summary: summarizeDiversity(results),
    rerank_summary: summarizeRerank(results),
  };

  await writeJson(reportPath, report);
  console.log("");
  console.log("[retrieval-diversity-summary]");
  console.log(`before_dedup_avg_unique_sources=${report.diversity_summary.before_dedup.avg_unique_sources}`);
  console.log(`after_dedup_avg_unique_sources=${report.diversity_summary.after_dedup.avg_unique_sources}`);
  console.log(`duplicate_chunks_removed_total=${report.diversity_summary.duplicate_chunks_removed_total}`);
  console.log("[retrieval-rerank-summary]");
  console.log(`average_semantic_score=${report.rerank_summary.average_semantic_score}`);
  console.log(`average_quality_score=${report.rerank_summary.average_quality_score}`);
  console.log(`source_diversity=${report.rerank_summary.source_diversity}`);
  console.log(`overlap_reduction=${report.rerank_summary.overlap_reduction}`);
  console.log(`final_chunk_relevance=${report.rerank_summary.final_chunk_relevance}`);
  console.log(`penalized_chunks_total=${report.rerank_summary.penalized_chunks_total}`);
  console.log(`boosted_chunks_total=${report.rerank_summary.boosted_chunks_total}`);
  console.log(`Saved report: ${repoRelative(reportPath)}`);
}

main().catch((err) => {
  console.error(`Sexologist retrieval quality evaluation failed: ${err.message}`);
  process.exit(1);
});
