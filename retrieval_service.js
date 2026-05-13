import { retrieve as retrieveProductionKb } from "./knowledge_retrieval.js";

const DEFAULT_TOP_K = Number(process.env.KB_TOP_K || process.env.KB_RETRIEVAL_TOP_K || 5);
const DEFAULT_TIMEOUT_MS = Number(process.env.KB_RETRIEVAL_TIMEOUT_MS || 8000);
const DEFAULT_MIN_SCORE = Number(process.env.KB_RETRIEVAL_MIN_SCORE || 0.05);
const DEFAULT_MAX_CONTEXT_TOKENS = Number(process.env.KB_MAX_CONTEXT_TOKENS || 2500);
const DEFAULT_MAX_CHUNKS_PER_SOURCE = 2;
const DEFAULT_DEDUP_COSINE_THRESHOLD = 0.92;
const DEFAULT_DEDUP_TEXT_OVERLAP_THRESHOLD = 0.82;
const DEFAULT_DEDUP_CANDIDATE_MULTIPLIER = 4;
const DEFAULT_RERANK_CANDIDATE_MULTIPLIER = 3;
const DEFAULT_RERANK_SEMANTIC_WEIGHT = 0.72;
const DEFAULT_RERANK_KEYWORD_WEIGHT = 0.2;
const DEFAULT_RERANK_TITLE_WEIGHT = 0.08;
const DEFAULT_RERANK_QUALITY_WEIGHT = 0.18;
const DEBUG = process.env.KB_RETRIEVAL_DEBUG === "1" || process.env.KB_RETRIEVAL_DEBUG === "true";

function isEnabled() {
  return process.env.ENABLE_KB_RETRIEVAL === "true";
}

async function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Retrieval timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeText(text = "") {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function parseBooleanEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function parsePositiveIntEnv(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function parseNumberEnv(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function dedupeChunks(chunks) {
  const seen = new Set();
  const result = [];

  for (const chunk of chunks) {
    const key = chunk.chunk_id || normalizeText(chunk.text).slice(0, 500);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }

  return result;
}

function sourceLabel(chunk) {
  const source = chunk.source || {};
  return source.source_file || source.cleaned_file || source.source_id || chunk.chunk_id || "unknown";
}

function sourceDistribution(chunks = []) {
  const distribution = {};
  for (const chunk of chunks) {
    const source = sourceLabel(chunk);
    distribution[source] = (distribution[source] || 0) + 1;
  }
  return distribution;
}

function uniqueSourceCount(chunks = []) {
  return Object.keys(sourceDistribution(chunks)).length;
}

function normalizedTextTokens(text = "") {
  return normalizeText(text)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function uniqueTokens(text = "") {
  return new Set(normalizedTextTokens(text));
}

function tokenOverlapScore(queryTokens, text = "") {
  if (!queryTokens?.size) return 0;
  const textTokens = uniqueTokens(text);
  if (!textTokens.size) return 0;
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap += 1;
  }
  return overlap / queryTokens.size;
}

function textOverlapRatio(a = "", b = "") {
  const aTokens = uniqueTokens(a);
  const bTokens = uniqueTokens(b);
  const denominator = Math.min(aTokens.size, bTokens.size);
  if (!denominator) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / denominator;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = Number(a[index]);
    const bv = Number(b[index]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return null;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm <= 0 || bNorm <= 0) return null;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function buildDiversityMetrics({ beforeChunks, candidateChunks, afterChunks, removed, config }) {
  return {
    unique_sources: uniqueSourceCount(afterChunks),
    duplicate_chunks_removed: removed.length,
    final_chunk_count: afterChunks.length,
    source_distribution: sourceDistribution(afterChunks),
    before_dedup: {
      chunk_count: beforeChunks.length,
      unique_sources: uniqueSourceCount(beforeChunks),
      source_distribution: sourceDistribution(beforeChunks),
    },
    after_dedup: {
      chunk_count: afterChunks.length,
      unique_sources: uniqueSourceCount(afterChunks),
      source_distribution: sourceDistribution(afterChunks),
    },
    candidate_pool: {
      chunk_count: candidateChunks.length,
      unique_sources: uniqueSourceCount(candidateChunks),
      source_distribution: sourceDistribution(candidateChunks),
    },
    removed,
    config,
  };
}

function dedupeChunksForDiversity(chunks, options = {}) {
  const dedupEnabled = options.enabled !== false;
  const topK = options.topK || DEFAULT_TOP_K;
  const resultLimit = options.resultLimit || topK;
  const maxChunksPerSource = parsePositiveIntEnv("KB_MAX_CHUNKS_PER_SOURCE", DEFAULT_MAX_CHUNKS_PER_SOURCE);
  const cosineThreshold = parseNumberEnv("KB_DEDUP_COSINE_THRESHOLD", DEFAULT_DEDUP_COSINE_THRESHOLD);
  const textOverlapThreshold = parseNumberEnv("KB_DEDUP_TEXT_OVERLAP_THRESHOLD", DEFAULT_DEDUP_TEXT_OVERLAP_THRESHOLD);
  const config = {
    enabled: dedupEnabled,
    max_chunks_per_source: dedupEnabled ? maxChunksPerSource : null,
    cosine_threshold: dedupEnabled ? cosineThreshold : null,
    text_overlap_threshold: dedupEnabled ? textOverlapThreshold : null,
  };

  if (!dedupEnabled) {
    const beforeChunks = chunks.slice(0, topK);
    const legacyChunks = dedupeChunks(chunks).slice(0, resultLimit);
    return {
      chunks: legacyChunks,
      metrics: buildDiversityMetrics({
        beforeChunks,
        candidateChunks: chunks,
        afterChunks: legacyChunks,
        removed: chunks.slice(legacyChunks.length).map((chunk) => ({
          chunk_id: chunk.chunk_id || null,
          source: sourceLabel(chunk),
          reason: "outside_top_k_or_exact_duplicate",
        })),
        config,
      }),
    };
  }

  const accepted = [];
  const removed = [];
  const seenKeys = new Set();
  const perSourceCounts = new Map();

  for (const chunk of chunks) {
    const source = sourceLabel(chunk);
    const exactKey = chunk.chunk_id || normalizeText(chunk.text).slice(0, 500);
    if (exactKey && seenKeys.has(exactKey)) {
      removed.push({ chunk_id: chunk.chunk_id || null, source, reason: "exact_duplicate" });
      continue;
    }

    const sourceCount = perSourceCounts.get(source) || 0;
    if (sourceCount >= maxChunksPerSource) {
      removed.push({ chunk_id: chunk.chunk_id || null, source, reason: "source_limit" });
      continue;
    }

    let duplicateMatch = null;
    for (const selected of accepted) {
      const cosine = cosineSimilarity(chunk.embedding, selected.embedding);
      if (cosine !== null && cosine > cosineThreshold) {
        duplicateMatch = {
          reason: "semantic_similarity",
          matched_chunk_id: selected.chunk_id || null,
          matched_source: sourceLabel(selected),
          similarity: Number(cosine.toFixed(4)),
        };
        break;
      }

      const overlap = textOverlapRatio(chunk.text, selected.text);
      if (overlap > textOverlapThreshold) {
        duplicateMatch = {
          reason: "text_overlap",
          matched_chunk_id: selected.chunk_id || null,
          matched_source: sourceLabel(selected),
          overlap: Number(overlap.toFixed(4)),
        };
        break;
      }
    }

    if (duplicateMatch) {
      removed.push({ chunk_id: chunk.chunk_id || null, source, ...duplicateMatch });
      continue;
    }

    if (exactKey) seenKeys.add(exactKey);
    perSourceCounts.set(source, sourceCount + 1);
    accepted.push(chunk);
    if (accepted.length >= resultLimit) break;
  }

  return {
    chunks: accepted,
    metrics: buildDiversityMetrics({
      beforeChunks: chunks.slice(0, topK),
      candidateChunks: chunks,
      afterChunks: accepted,
      removed,
      config,
    }),
  };
}

function chunkTitleText(chunk) {
  const source = chunk.source || {};
  const metadata = chunk.metadata || {};
  return [
    source.source_file,
    source.cleaned_file,
    source.source_id,
    metadata.canonical_source,
    metadata.logical_category,
    metadata.source_type,
  ].filter(Boolean).join(" ");
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function countMatches(text, patterns) {
  return patterns.reduce((sum, pattern) => {
    const matches = text.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
}

function chunkQualityScore(text = "", options = {}) {
  const enabled = options.enabled !== false;
  const normalized = normalizeText(text);
  if (!enabled) {
    return {
      quality_score: 0,
      boosted: false,
      penalized: false,
      boost_reasons: [],
      penalty_reasons: [],
    };
  }

  const boostPatterns = {
    psychoeducation: [
      /это может быть связано/giu,
      /часто связано/giu,
      /может быть связано/giu,
      /связано с/giu,
      /исследования показывают/giu,
      /исследования/giu,
      /влияни[ея]/giu,
      /механизм/giu,
      /регуляци[яи]/giu,
      /нервн[а-я]+\s+систем/giu,
      /привязанност/giu,
      /динамик[аи]\s+отношен/giu,
      /коммуникаци[яи]/giu,
      /границ[аы]/giu,
      /партнер[а-я]*\s+важно/giu,
      /важно\s+обсудить/giu,
      /можно\s+обсудить/giu,
      /практик[ае]/giu,
    ],
  };
  const penaltyPatterns = {
    dialogue: [
      /он\s+сказал/giu,
      /она\s+сказала/giu,
      /я\s+сказал/giu,
      /я\s+сказала/giu,
      /говорит\s*:/giu,
      /сказал\s*:/giu,
      /сказала\s*:/giu,
      /["«][^"»]{0,120}["»]/gu,
    ],
    storytelling: [
      /представьте/giu,
      /смотри/giu,
      /давайте\s+посмотрим/giu,
      /однажды/giu,
      /истори[яю]/giu,
      /героин[яи]/giu,
      /сюжет/giu,
      /вспомните/giu,
    ],
    emotional_filler: [
      /прекрасн/giu,
      /волшебн/giu,
      /невероятн/giu,
      /удивительн/giu,
      /наслаждайтесь/giu,
      /откройте\s+для\s+себя/giu,
      /позвольте\s+себе/giu,
      /вы\s+достойны/giu,
      /любите\s+себя/giu,
    ],
    erotic_framing: [
      /страст/giu,
      /эротич/giu,
      /соблазн/giu,
      /возбуждающ/giu,
      /горяч/giu,
      /наслаждени[ея]\s+тел/giu,
      /пикантн/giu,
    ],
  };

  const punctuationBursts = (text.match(/[!?]{2,}/g) || []).length;
  const emojiMatches = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  const textTokens = normalizedTextTokens(text).length || 1;
  const emojiDensity = emojiMatches.length / textTokens;

  const boostCount = countMatches(normalized, boostPatterns.psychoeducation);
  const penaltyGroups = Object.entries(penaltyPatterns).map(([reason, patterns]) => ({
    reason,
    count: countMatches(normalized, patterns),
  }));
  if (punctuationBursts > 0) penaltyGroups.push({ reason: "excessive_punctuation", count: punctuationBursts });
  if (emojiDensity > 0.015) penaltyGroups.push({ reason: "excessive_emoji_density", count: Math.ceil(emojiDensity * 100) });

  const penaltyCount = penaltyGroups.reduce((sum, item) => sum + item.count, 0);
  const score = clamp01(0.5 + Math.min(0.35, boostCount * 0.055) - Math.min(0.45, penaltyCount * 0.05));

  return {
    quality_score: Number(score.toFixed(4)),
    boosted: boostCount > 0,
    penalized: penaltyCount > 0,
    boost_reasons: boostCount > 0 ? [{ reason: "psychoeducational_signal", count: boostCount }] : [],
    penalty_reasons: penaltyGroups.filter((item) => item.count > 0),
  };
}

function rerankChunks(query, chunks, options = {}) {
  const topK = options.topK || DEFAULT_TOP_K;
  const enabled = options.enabled !== false;
  const qualityEnabled = options.qualityEnabled !== false;
  const weights = {
    semantic: parseNumberEnv("KB_RERANK_SEMANTIC_WEIGHT", DEFAULT_RERANK_SEMANTIC_WEIGHT),
    keyword: parseNumberEnv("KB_RERANK_KEYWORD_WEIGHT", DEFAULT_RERANK_KEYWORD_WEIGHT),
    title: parseNumberEnv("KB_RERANK_TITLE_WEIGHT", DEFAULT_RERANK_TITLE_WEIGHT),
    quality: qualityEnabled ? parseNumberEnv("KB_RERANK_QUALITY_WEIGHT", DEFAULT_RERANK_QUALITY_WEIGHT) : 0,
  };
  const config = { enabled, quality_enabled: qualityEnabled, weights };
  const before = chunks.map((chunk) => chunk.chunk_id || null);

  if (!enabled) {
    const selected = chunks.slice(0, topK);
    return {
      chunks: selected,
      metrics: buildRerankMetrics({ before, scored: scoreChunks(query, chunks, weights), selected, config }),
    };
  }

  const scored = scoreChunks(query, chunks, weights)
    .sort((a, b) => b.rerank.final_score - a.rerank.final_score || a.rank - b.rank);
  const selected = [];
  const remaining = [...scored];
  const selectedSources = new Set();

  while (selected.length < topK && remaining.length) {
    const preferNewSource = selectedSources.size < Math.min(topK, uniqueSourceCount(scored));
    let selectedIndex = 0;
    if (preferNewSource) {
      const newSourceIndex = remaining.findIndex((chunk) => !selectedSources.has(sourceLabel(chunk)));
      if (newSourceIndex >= 0) selectedIndex = newSourceIndex;
    }
    const [next] = remaining.splice(selectedIndex, 1);
    selected.push(next);
    selectedSources.add(sourceLabel(next));
  }

  return {
    chunks: selected,
    metrics: buildRerankMetrics({ before, scored, selected, config }),
  };
}

function scoreChunks(query, chunks, weights) {
  const queryTokens = uniqueTokens(query);
  return chunks.map((chunk) => {
    const semanticScore = clamp01(Number(chunk.score));
    const keywordScore = tokenOverlapScore(queryTokens, chunk.text);
    const titleOverlap = tokenOverlapScore(queryTokens, chunkTitleText(chunk));
    const quality = chunkQualityScore(chunk.text, { enabled: weights.quality > 0 });
    const finalScore = (
      semanticScore * weights.semantic
      + keywordScore * weights.keyword
      + titleOverlap * weights.title
      + quality.quality_score * weights.quality
    );

    return {
      ...chunk,
      rerank: {
        semantic_score: Number(semanticScore.toFixed(4)),
        keyword_score: Number(keywordScore.toFixed(4)),
        title_overlap: Number(titleOverlap.toFixed(4)),
        chunk_quality_score: quality.quality_score,
        quality_boosted: quality.boosted,
        quality_penalized: quality.penalized,
        quality_boost_reasons: quality.boost_reasons,
        quality_penalty_reasons: quality.penalty_reasons,
        final_score: Number(finalScore.toFixed(4)),
      },
    };
  });
}

function average(values) {
  return values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : 0;
}

function averagePairwiseTextOverlap(chunks = []) {
  const overlaps = [];
  for (let i = 0; i < chunks.length; i += 1) {
    for (let j = i + 1; j < chunks.length; j += 1) {
      overlaps.push(textOverlapRatio(chunks[i].text, chunks[j].text));
    }
  }
  return average(overlaps);
}

function buildRerankMetrics({ before, scored, selected, config }) {
  const finalScores = selected.map((chunk) => ({
    chunk_id: chunk.chunk_id || null,
    source: sourceLabel(chunk),
    semantic_score: chunk.rerank?.semantic_score ?? null,
    keyword_score: chunk.rerank?.keyword_score ?? null,
    title_overlap: chunk.rerank?.title_overlap ?? null,
    chunk_quality_score: chunk.rerank?.chunk_quality_score ?? null,
    final_score: chunk.rerank?.final_score ?? null,
  }));
  const beforeChunks = scored.slice(0, selected.length);

  return {
    before_rerank: before,
    after_rerank: selected.map((chunk) => chunk.chunk_id || null),
    final_scores: finalScores,
    selected_sources: selected.map(sourceLabel),
    average_semantic_score: average(selected.map((chunk) => chunk.rerank?.semantic_score || 0)),
    source_diversity: uniqueSourceCount(selected),
    overlap_reduction: Number((averagePairwiseTextOverlap(beforeChunks) - averagePairwiseTextOverlap(selected)).toFixed(4)),
    final_chunk_relevance: average(selected.map((chunk) => chunk.rerank?.final_score || 0)),
    average_quality_score: average(selected.map((chunk) => chunk.rerank?.chunk_quality_score || 0)),
    penalized_chunks: scored
      .filter((chunk) => chunk.rerank?.quality_penalized)
      .map((chunk) => ({
        chunk_id: chunk.chunk_id || null,
        source: sourceLabel(chunk),
        quality_score: chunk.rerank.chunk_quality_score,
        penalty_reasons: chunk.rerank.quality_penalty_reasons,
      })),
    boosted_chunks: scored
      .filter((chunk) => chunk.rerank?.quality_boosted)
      .map((chunk) => ({
        chunk_id: chunk.chunk_id || null,
        source: sourceLabel(chunk),
        quality_score: chunk.rerank.chunk_quality_score,
        boost_reasons: chunk.rerank.quality_boost_reasons,
      })),
    quality_scores: scored.map((chunk) => ({
      chunk_id: chunk.chunk_id || null,
      source: sourceLabel(chunk),
      quality_score: chunk.rerank?.chunk_quality_score ?? null,
      selected: selected.some((selectedChunk) => selectedChunk.chunk_id === chunk.chunk_id),
    })),
    candidate_count: scored.length,
    config,
  };
}

export function estimateKbTokens(text = "") {
  return Math.ceil(String(text).length / 3.5);
}

function safeTokenSlice(text, maxTokens) {
  const value = String(text || "").trim();
  if (estimateKbTokens(value) <= maxTokens) return value;

  const maxChars = Math.max(0, Math.floor(maxTokens * 3.5));
  const sliced = value.slice(0, maxChars);
  const paragraphCut = sliced.lastIndexOf("\n\n");
  const sentenceCut = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
  const spaceCut = sliced.lastIndexOf(" ");
  const cutAt = paragraphCut > maxChars * 0.55
    ? paragraphCut
    : sentenceCut > maxChars * 0.55
      ? sentenceCut + 1
      : spaceCut > maxChars * 0.55
        ? spaceCut
        : maxChars;

  return `${sliced.slice(0, cutAt).trim()}...`;
}

export function buildKnowledgeBaseContext(chunks, maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS) {
  const blocks = [];
  let usedTokens = 0;
  const targetChunkCount = Math.max(1, Math.min(chunks.length, DEFAULT_TOP_K));
  const perChunkTokenLimit = Math.max(200, Math.floor(maxContextTokens / targetChunkCount));

  for (const chunk of chunks) {
    const source = sourceLabel(chunk);
    const header = [
      "[KNOWLEDGE BASE CONTEXT]",
      `Source: ${source}`,
      "Content:",
    ].join("\n");
    const headerTokens = estimateKbTokens(header);
    const separatorTokens = blocks.length > 0 ? 1 : 0;
    const remainingTokens = maxContextTokens - usedTokens - headerTokens - separatorTokens;
    if (remainingTokens <= 0) break;

    let textBudget = Math.max(0, Math.min(remainingTokens, perChunkTokenLimit - headerTokens - separatorTokens) - 4);
    let text = safeTokenSlice(chunk.text, textBudget);
    let block = [
      header,
      text,
    ].join("\n");
    let blockTokens = estimateKbTokens(block) + separatorTokens;

    while (blockTokens > maxContextTokens - usedTokens && textBudget > 20) {
      textBudget -= 20;
      text = safeTokenSlice(chunk.text, textBudget);
      block = [
        header,
        text,
      ].join("\n");
      blockTokens = estimateKbTokens(block) + separatorTokens;
    }

    if (usedTokens + blockTokens > maxContextTokens) break;
    blocks.push(block);
    usedTokens += blockTokens;
  }

  const context = blocks.join("\n\n");
  return {
    context,
    estimatedTokens: estimateKbTokens(context),
    sources: chunks.slice(0, blocks.length).map(sourceLabel),
    usedChunks: chunks.slice(0, blocks.length),
  };
}

function logDebug(payload) {
  if (!DEBUG) return;
  console.log("[retrieval]", JSON.stringify(payload));
}

function logRetrieval(payload) {
  console.log("[retrieval-context]");
  console.log(`query=${payload.query || ""}`);
  console.log(`retrieved_chunks=${payload.retrieved_chunks ?? 0}`);
  console.log(`estimated_tokens=${payload.estimated_tokens ?? 0}`);
  console.log(`sources=${(payload.sources || []).join(", ")}`);
}

function logRetrievalDiversity(metrics) {
  if (!metrics) return;
  console.log("[retrieval-diversity]");
  console.log(`unique_sources=${metrics.unique_sources}`);
  console.log(`duplicate_chunks_removed=${metrics.duplicate_chunks_removed}`);
  console.log(`final_chunk_count=${metrics.final_chunk_count}`);
  console.log(`source_distribution=${JSON.stringify(metrics.source_distribution)}`);
  console.log(`before_dedup_unique_sources=${metrics.before_dedup.unique_sources}`);
  console.log(`after_dedup_unique_sources=${metrics.after_dedup.unique_sources}`);
}

function logRetrievalRerank(metrics) {
  if (!metrics) return;
  console.log("[retrieval-rerank]");
  console.log(`before_rerank=${JSON.stringify(metrics.before_rerank)}`);
  console.log(`after_rerank=${JSON.stringify(metrics.after_rerank)}`);
  console.log(`final_scores=${JSON.stringify(metrics.final_scores)}`);
  console.log(`selected_sources=${JSON.stringify(metrics.selected_sources)}`);
}

function logRetrievalQuality(metrics) {
  if (!metrics) return;
  console.log("[retrieval-quality]");
  console.log(`penalized_chunks=${JSON.stringify(metrics.penalized_chunks)}`);
  console.log(`boosted_chunks=${JSON.stringify(metrics.boosted_chunks)}`);
  console.log(`quality_scores=${JSON.stringify(metrics.quality_scores)}`);
}

function errorPayload(err) {
  if (!err) return null;
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
    json: JSON.stringify(err, Object.getOwnPropertyNames(err)),
  };
}

export async function retrieveGroundingContext(query, scenario, options = {}) {
  if (!isEnabled()) {
    return null;
  }

  if (scenario !== "sexologist") {
    return null;
  }

  const kb = "sexologist";
  const topK = options.topK || DEFAULT_TOP_K;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const maxContextTokens = options.maxContextTokens || DEFAULT_MAX_CONTEXT_TOKENS;
  const dedupEnabled = options.dedupEnabled ?? parseBooleanEnv("KB_DEDUP_ENABLED", true);
  const rerankEnabled = options.rerankEnabled ?? parseBooleanEnv("KB_RERANK_ENABLED", true);
  const qualityFilterEnabled = options.qualityFilterEnabled ?? parseBooleanEnv("KB_QUALITY_FILTER_ENABLED", true);
  const candidateMultiplier = parsePositiveIntEnv("KB_DEDUP_CANDIDATE_MULTIPLIER", DEFAULT_DEDUP_CANDIDATE_MULTIPLIER);
  const rerankCandidateMultiplier = parsePositiveIntEnv("KB_RERANK_CANDIDATE_MULTIPLIER", DEFAULT_RERANK_CANDIDATE_MULTIPLIER);
  const retrievalTopK = dedupEnabled ? Math.max(topK, topK * candidateMultiplier) : topK;
  const postDedupLimit = rerankEnabled ? Math.max(topK, topK * rerankCandidateMultiplier) : topK;

  logDebug({
    event: "service_start",
    cwd: process.cwd(),
    node_env: process.env.NODE_ENV || null,
    scenario,
    kb_id: kb,
    topK,
    retrieval_top_k: retrievalTopK,
    dedup_enabled: dedupEnabled,
    rerank_enabled: rerankEnabled,
    quality_filter_enabled: qualityFilterEnabled,
    post_dedup_limit: postDedupLimit,
    timeout_ms: timeoutMs,
    min_score: minScore,
    max_context_tokens: maxContextTokens,
  });

  try {
    const retrieval = await withTimeout(retrieveProductionKb(kb, query, retrievalTopK, {
      includeVectors: dedupEnabled,
    }), timeoutMs);
    const filtered = (retrieval.results || [])
      .filter((chunk) => Number.isFinite(chunk.score) && chunk.score >= minScore);
    const { chunks, metrics: diversityMetrics } = dedupeChunksForDiversity(filtered, {
      enabled: dedupEnabled,
      topK,
      resultLimit: postDedupLimit,
    });
    const { chunks: rerankedChunks, metrics: rerankMetrics } = rerankChunks(query, chunks, {
      enabled: rerankEnabled,
      qualityEnabled: qualityFilterEnabled,
      topK,
    });
    const builtContext = buildKnowledgeBaseContext(rerankedChunks, maxContextTokens);
    const context = builtContext.context;
    const usedChunks = builtContext.usedChunks.map((chunk) => {
      const { embedding, ...rest } = chunk;
      return rest;
    });

    logDebug({
      event: "ok",
      kb,
      query,
      requested_top_k: topK,
      retrieval_top_k: retrievalTopK,
      raw_count: retrieval.result_count,
      used_count: usedChunks.length,
      min_score: minScore,
      context_chars: context.length,
      estimated_tokens: builtContext.estimatedTokens,
      production_version: retrieval.production_version,
      diversity_metrics: diversityMetrics,
      rerank_metrics: rerankMetrics,
    });

    logRetrieval({
      query,
      retrieved_chunks: usedChunks.length,
      estimated_tokens: builtContext.estimatedTokens,
      sources: builtContext.sources,
    });
    logRetrievalDiversity(diversityMetrics);
    logRetrievalRerank(rerankMetrics);
    logRetrievalQuality(rerankMetrics);

    if (!context) return null;

    return {
      context,
      chunks: usedChunks,
      estimatedTokens: builtContext.estimatedTokens,
      sources: builtContext.sources,
      productionVersion: retrieval.production_version,
      manifestInfo: retrieval.manifest_info,
      diversityMetrics,
      rerankMetrics,
    };
  } catch (err) {
    console.error("[retrieval] failed:", err.message);
    logDebug({
      event: "failed",
      scenario,
      kb_id: kb,
      query,
      error: errorPayload(err),
    });
    return null;
  }
}
