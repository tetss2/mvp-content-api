const SOURCE_TYPE_SCORE_ADJUSTMENTS = {
  approved_high_confidence: 1.0,
  approved_dataset: 0.85,
  b17_article: 0.95,
  website_vercel: 0.9,
  telegram_channel: 0.75,
  approved_medium_confidence: 0.78,
  raw_sample: 0.45,
  questionnaire: -1.0,
  unknown: 0,
};

const CONFIDENCE_SCORE_ADJUSTMENTS = {
  high: 0.25,
  medium: 0.1,
  low: -0.35,
};

const SAFETY_PENALTY = -2.0;
const WARNING_PENALTY = -0.12;

const GENERATION_INTENTS = [
  "educational_post",
  "storytelling",
  "faq_answer",
  "sales_post",
  "short_hook",
  "therapeutic_case",
];

const CONTENT_KIND_INTENT_BOOSTS = {
  educational_post: {
    educational: 0.2,
    therapeutic_case: 0.15,
    faq: 0.05,
  },
  storytelling: {
    storytelling: 0.25,
    therapeutic_case: 0.12,
  },
  faq_answer: {
    faq: 0.25,
    educational: 0.08,
  },
  sales_post: {
    sales: 0.25,
    short_hook: 0.08,
  },
  short_hook: {
    short_hook: 0.25,
    sales: 0.08,
    storytelling: 0.05,
  },
  therapeutic_case: {
    therapeutic_case: 0.25,
    educational: 0.12,
    storytelling: 0.08,
  },
};

function roundScore(value) {
  return Number(Number(value || 0).toFixed(4));
}

function numberOrDefault(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMetadata(item = {}) {
  const nested = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const metadata = { ...nested, ...item };
  delete metadata.metadata;

  return {
    source_type: metadata.source_type || "unknown",
    confidence_level: metadata.confidence_level || "low",
    expert_signal_score: numberOrDefault(metadata.expert_signal_score, 0),
    content_kind: metadata.content_kind || "unknown",
    is_generation_safe: metadata.is_generation_safe !== false,
    warnings: Array.isArray(metadata.warnings) ? metadata.warnings : [],
    source_path: metadata.source_path || metadata.cleaned_path || metadata.cleaned_file || metadata.source_file || metadata.id || null,
    title: metadata.title || metadata.source_file || metadata.id || null,
  };
}

function getBaseScore(item = {}) {
  return numberOrDefault(
    item.base_score ?? item.score ?? item.similarity ?? item.vector_score ?? item.distance_score,
    0,
  );
}

function sourceTypeAdjustment(sourceType) {
  return SOURCE_TYPE_SCORE_ADJUSTMENTS[sourceType] ?? SOURCE_TYPE_SCORE_ADJUSTMENTS.unknown;
}

function confidenceAdjustment(confidenceLevel) {
  return CONFIDENCE_SCORE_ADJUSTMENTS[confidenceLevel] ?? CONFIDENCE_SCORE_ADJUSTMENTS.low;
}

function expertSignalAdjustment(expertSignalScore) {
  const normalized = Math.max(0, Math.min(1, numberOrDefault(expertSignalScore, 0)));
  return roundScore((normalized - 0.5) * 0.5);
}

function contentKindAdjustment(contentKind, generationIntent) {
  if (!generationIntent) return 0;
  const boosts = CONTENT_KIND_INTENT_BOOSTS[generationIntent] || {};
  return boosts[contentKind] || 0;
}

function scoreRetrievalItem(item, options = {}) {
  const metadata = normalizeMetadata(item);
  const baseScore = getBaseScore(item);
  const generationIntent = options.generation_intent || options.generationIntent || null;
  const boosts = [];
  const penalties = [];
  let finalScore = baseScore;

  const sourceAdjustment = sourceTypeAdjustment(metadata.source_type);
  finalScore += sourceAdjustment;
  if (sourceAdjustment >= 0) boosts.push(`${metadata.source_type}:+${sourceAdjustment}`);
  else penalties.push(`${metadata.source_type}:${sourceAdjustment}`);

  const confidenceBoost = confidenceAdjustment(metadata.confidence_level);
  finalScore += confidenceBoost;
  const confidenceLabel = `confidence_${metadata.confidence_level}`;
  if (confidenceBoost >= 0) boosts.push(`${confidenceLabel}:+${confidenceBoost}`);
  else penalties.push(`${confidenceLabel}:${confidenceBoost}`);

  const expertSignalBoost = expertSignalAdjustment(metadata.expert_signal_score);
  finalScore += expertSignalBoost;
  const expertSignalLabel = `expert_signal_${metadata.expert_signal_score}`;
  if (expertSignalBoost >= 0) boosts.push(`${expertSignalLabel}:+${expertSignalBoost}`);
  else penalties.push(`${expertSignalLabel}:${expertSignalBoost}`);

  const intentBoost = contentKindAdjustment(metadata.content_kind, generationIntent);
  if (intentBoost > 0) {
    finalScore += intentBoost;
    boosts.push(`${metadata.content_kind}_match:+${intentBoost}`);
  }

  if (!metadata.is_generation_safe) {
    finalScore += SAFETY_PENALTY;
    penalties.push(`generation_unsafe:${SAFETY_PENALTY}`);
  }

  for (const warning of metadata.warnings) {
    if (warning === "existing_prepared_file_referenced_without_copy") continue;
    finalScore += WARNING_PENALTY;
    penalties.push(`warning_${warning}:${WARNING_PENALTY}`);
  }

  return {
    ...item,
    retrieval_metadata: metadata,
    retrieval_trace: {
      base_score: roundScore(baseScore),
      final_score: roundScore(finalScore),
      boosts,
      penalties,
      generation_safe: metadata.is_generation_safe,
      generation_intent: generationIntent,
      content_kind: metadata.content_kind,
      source_type: metadata.source_type,
      confidence_level: metadata.confidence_level,
    },
  };
}

function rerankRetrievalItems(items, options = {}) {
  return [...items]
    .map((item, originalIndex) => ({
      ...scoreRetrievalItem(item, options),
      original_rank: originalIndex + 1,
    }))
    .sort((a, b) => (
      b.retrieval_trace.final_score - a.retrieval_trace.final_score
      || b.retrieval_trace.base_score - a.retrieval_trace.base_score
      || a.original_rank - b.original_rank
    ))
    .map((item, index) => ({
      ...item,
      reranked_position: index + 1,
    }));
}

export {
  SOURCE_TYPE_SCORE_ADJUSTMENTS,
  CONFIDENCE_SCORE_ADJUSTMENTS,
  SAFETY_PENALTY,
  WARNING_PENALTY,
  GENERATION_INTENTS,
  CONTENT_KIND_INTENT_BOOSTS,
  normalizeMetadata,
  scoreRetrievalItem,
  rerankRetrievalItems,
};
