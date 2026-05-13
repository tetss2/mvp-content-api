const GENERATION_INTENT_STRATEGIES = {
  educational_post: ["educational", "therapeutic_case", "faq"],
  storytelling: ["storytelling", "therapeutic_case", "educational"],
  faq_answer: ["faq", "educational"],
  sales_post: ["sales", "educational", "storytelling"],
  short_hook: ["short_hook", "storytelling", "sales"],
  therapeutic_case: ["therapeutic_case", "educational", "storytelling"],
};

const DEFAULT_ASSEMBLY_OPTIONS = {
  max_context_items: 6,
  max_total_chars: 12000,
  max_items_per_content_kind: 2,
  max_items_per_source_type: 3,
};

function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCandidate(candidate = {}) {
  const retrievalMetadata = candidate.retrieval_metadata && typeof candidate.retrieval_metadata === "object"
    ? candidate.retrieval_metadata
    : {};
  const nestedMetadata = candidate.metadata && typeof candidate.metadata === "object"
    ? candidate.metadata
    : {};
  const metadata = {
    ...nestedMetadata,
    ...retrievalMetadata,
  };

  const content = candidate.content || candidate.text || candidate.chunk_text || candidate.excerpt || "";
  const retrievalTrace = candidate.retrieval_trace && typeof candidate.retrieval_trace === "object"
    ? candidate.retrieval_trace
    : {};

  return {
    ...candidate,
    content,
    retrieval_metadata: {
      source_type: metadata.source_type || "unknown",
      confidence_level: metadata.confidence_level || "low",
      expert_signal_score: Number(metadata.expert_signal_score || 0),
      content_kind: metadata.content_kind || "unknown",
      is_generation_safe: metadata.is_generation_safe !== false,
      warnings: asArray(metadata.warnings),
      source_path: metadata.source_path || metadata.cleaned_path || metadata.cleaned_file || metadata.source_file || candidate.source_path || null,
      title: metadata.title || candidate.title || metadata.source_file || candidate.id || null,
      content_sha256: metadata.content_sha256 || candidate.content_sha256 || null,
      char_count: Number(metadata.char_count || candidate.char_count || content.length || 0),
    },
    retrieval_trace: retrievalTrace,
  };
}

function getFinalScore(candidate) {
  return Number(
    candidate.retrieval_trace?.final_score
    ?? candidate.final_score
    ?? candidate.score
    ?? candidate.base_score
    ?? 0,
  );
}

function getContentLength(candidate) {
  if (candidate.content) return candidate.content.length;
  return Number(candidate.retrieval_metadata?.char_count || candidate.char_count || 0);
}

function getIntentMatches(generationIntent) {
  return GENERATION_INTENT_STRATEGIES[generationIntent] || [];
}

function isIntentMatch(candidate, preferredKinds) {
  return preferredKinds.includes(candidate.retrieval_metadata.content_kind);
}

function actionableWarnings(candidate) {
  return candidate.retrieval_metadata.warnings.filter(
    (warning) => warning !== "existing_prepared_file_referenced_without_copy",
  );
}

function compareCandidates(a, b, preferredKinds) {
  const scoreDiff = getFinalScore(b) - getFinalScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  const safeDiff = Number(b.retrieval_metadata.is_generation_safe) - Number(a.retrieval_metadata.is_generation_safe);
  if (safeDiff !== 0) return safeDiff;

  const intentDiff = Number(isIntentMatch(b, preferredKinds)) - Number(isIntentMatch(a, preferredKinds));
  if (intentDiff !== 0) return intentDiff;

  return (a.original_rank || 0) - (b.original_rank || 0);
}

function makeSelectedItem(candidate, selectionRank, selectedBecause) {
  const metadata = candidate.retrieval_metadata;
  return {
    id: candidate.id || metadata.content_sha256 || metadata.source_path || `selected-${selectionRank}`,
    title: metadata.title,
    source_path: metadata.source_path,
    source_type: metadata.source_type,
    content_kind: metadata.content_kind,
    confidence_level: metadata.confidence_level,
    expert_signal_score: metadata.expert_signal_score,
    is_generation_safe: metadata.is_generation_safe,
    warnings: metadata.warnings,
    content_sha256: metadata.content_sha256,
    content: candidate.content,
    char_count: getContentLength(candidate),
    retrieval_trace: candidate.retrieval_trace,
    selected_because: selectedBecause,
    selection_rank: selectionRank,
  };
}

function makeSuppressedItem(candidate, suppressedBecause) {
  const metadata = candidate.retrieval_metadata;
  return {
    id: candidate.id || metadata.content_sha256 || metadata.source_path || "suppressed-item",
    title: metadata.title,
    source_path: metadata.source_path,
    source_type: metadata.source_type,
    content_kind: metadata.content_kind,
    confidence_level: metadata.confidence_level,
    is_generation_safe: metadata.is_generation_safe,
    warnings: metadata.warnings,
    content_sha256: metadata.content_sha256,
    char_count: getContentLength(candidate),
    retrieval_trace: candidate.retrieval_trace,
    suppressed_because: suppressedBecause,
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function addWarning(warnings, warning) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function buildContextSummary({ selectedItems, suppressedItems, candidates, maxContextItems, maxTotalChars }) {
  const warnings = [];
  const selectedKinds = new Set(selectedItems.map((item) => item.content_kind));
  const selectedSourceTypes = new Set(selectedItems.map((item) => item.source_type));
  const safeCandidateCount = candidates.filter((item) => item.retrieval_metadata.is_generation_safe).length;
  const totalSelectedChars = selectedItems.reduce((sum, item) => sum + item.char_count, 0);

  if (selectedItems.length >= 2 && selectedKinds.size < 2) addWarning(warnings, "low_context_diversity");
  if (selectedItems.length >= 2 && selectedSourceTypes.size < 2) addWarning(warnings, "only_one_source_type");
  if (safeCandidateCount < Math.min(maxContextItems, 3)) addWarning(warnings, "too_few_safe_candidates");
  if (suppressedItems.some((item) => item.suppressed_because.includes("context_budget_exceeded"))) {
    addWarning(warnings, "max_context_budget_reached");
  }
  if (suppressedItems.some((item) => item.suppressed_because.includes("duplicate_content_hash"))) {
    addWarning(warnings, "duplicate_suppressed");
  }

  return {
    selected_count: selectedItems.length,
    suppressed_count: suppressedItems.length,
    candidate_count: candidates.length,
    total_selected_chars: totalSelectedChars,
    max_context_items: maxContextItems,
    max_total_chars: maxTotalChars,
    content_kind_counts: countBy(selectedItems, "content_kind"),
    source_type_counts: countBy(selectedItems, "source_type"),
    safe_candidate_count: safeCandidateCount,
    warnings,
  };
}

function assembleContextPack(input = {}) {
  const expertId = input.expert_id || "unknown";
  const generationIntent = input.generation_intent || "educational_post";
  const preferredKinds = getIntentMatches(generationIntent);
  const maxContextItems = Number(input.max_context_items || DEFAULT_ASSEMBLY_OPTIONS.max_context_items);
  const maxTotalChars = Number(input.max_total_chars || DEFAULT_ASSEMBLY_OPTIONS.max_total_chars);
  const maxItemsPerContentKind = Number(input.max_items_per_content_kind || DEFAULT_ASSEMBLY_OPTIONS.max_items_per_content_kind);
  const maxItemsPerSourceType = Number(input.max_items_per_source_type || DEFAULT_ASSEMBLY_OPTIONS.max_items_per_source_type);

  const candidates = asArray(input.candidates)
    .map((candidate, index) => ({
      ...normalizeCandidate(candidate),
      original_rank: candidate.original_rank || candidate.reranked_position || index + 1,
    }))
    .sort((a, b) => compareCandidates(a, b, preferredKinds));

  const selectedItems = [];
  const suppressedItems = [];
  const assemblyTrace = [];
  const seenHashes = new Set();
  const contentKindCounts = new Map();
  const sourceTypeCounts = new Map();
  let totalChars = 0;

  for (const candidate of candidates) {
    const metadata = candidate.retrieval_metadata;
    const contentKind = metadata.content_kind;
    const sourceType = metadata.source_type;
    const contentLength = getContentLength(candidate);
    const finalScore = getFinalScore(candidate);
    const hash = metadata.content_sha256;
    const suppressedBecause = [];

    if (!metadata.is_generation_safe) suppressedBecause.push("generation_unsafe");
    if (sourceType === "questionnaire" || contentKind === "questionnaire") suppressedBecause.push("questionnaire_context");
    if (actionableWarnings(candidate).length > 0) suppressedBecause.push("noisy_warnings");
    if (finalScore <= 0) suppressedBecause.push("low_final_score");
    if (hash && seenHashes.has(hash)) suppressedBecause.push("duplicate_content_hash");
    if ((contentKindCounts.get(contentKind) || 0) >= maxItemsPerContentKind) suppressedBecause.push("content_kind_limit");
    if ((sourceTypeCounts.get(sourceType) || 0) >= maxItemsPerSourceType) suppressedBecause.push("source_type_limit");
    if (selectedItems.length >= maxContextItems) suppressedBecause.push("max_context_items_reached");
    if (totalChars + contentLength > maxTotalChars) suppressedBecause.push("context_budget_exceeded");

    if (suppressedBecause.length > 0) {
      const suppressed = makeSuppressedItem(candidate, suppressedBecause);
      suppressedItems.push(suppressed);
      assemblyTrace.push({
        id: suppressed.id,
        action: "suppressed",
        final_score: round(getFinalScore(candidate)),
        reasons: suppressedBecause,
        retrieval_trace: candidate.retrieval_trace,
      });
      continue;
    }

    const selectedBecause = [];
    if (getFinalScore(candidate) > 0) selectedBecause.push("high_final_score");
    if (isIntentMatch(candidate, preferredKinds)) selectedBecause.push("intent_content_match");
    if (metadata.is_generation_safe) selectedBecause.push("generation_safe");
    if (!sourceTypeCounts.has(sourceType) || sourceTypeCounts.size < 2) selectedBecause.push("source_diversity");
    if (!contentKindCounts.has(contentKind) || contentKindCounts.size < 2) selectedBecause.push("content_kind_diversity");

    selectedItems.push(makeSelectedItem(candidate, selectedItems.length + 1, selectedBecause));
    if (hash) seenHashes.add(hash);
    contentKindCounts.set(contentKind, (contentKindCounts.get(contentKind) || 0) + 1);
    sourceTypeCounts.set(sourceType, (sourceTypeCounts.get(sourceType) || 0) + 1);
    totalChars += contentLength;

    assemblyTrace.push({
      id: candidate.id || hash || metadata.source_path,
      action: "selected",
      selection_rank: selectedItems.length,
      final_score: round(getFinalScore(candidate)),
      reasons: selectedBecause,
      retrieval_trace: candidate.retrieval_trace,
    });
  }

  const contextSummary = buildContextSummary({
    selectedItems,
    suppressedItems,
    candidates,
    maxContextItems,
    maxTotalChars,
  });

  return {
    expert_id: expertId,
    generation_intent: generationIntent,
    selected_items: selectedItems,
    suppressed_items: suppressedItems,
    context_summary: contextSummary,
    assembly_trace: assemblyTrace,
  };
}

export {
  DEFAULT_ASSEMBLY_OPTIONS,
  GENERATION_INTENT_STRATEGIES,
  assembleContextPack,
  normalizeCandidate,
};
