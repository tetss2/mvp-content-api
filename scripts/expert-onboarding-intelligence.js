const SOURCE_TYPES = [
  "website_vercel",
  "b17_article",
  "telegram_channel",
  "raw_sample",
  "questionnaire",
  "approved_dataset",
  "approved_high_confidence",
  "approved_medium_confidence",
  "unknown",
];

const CONFIDENCE_LEVELS = ["high", "medium", "low"];

const CONTENT_KINDS = [
  "educational",
  "storytelling",
  "therapeutic_case",
  "sales",
  "faq",
  "short_hook",
  "questionnaire",
  "unknown",
];

const SUGGESTED_RETRIEVAL_WEIGHTS = {
  approved_high_confidence: 1.0,
  b17_article: 0.95,
  website_vercel: 0.9,
  approved_dataset: 0.85,
  approved_medium_confidence: 0.78,
  telegram_channel: 0.75,
  raw_sample: 0.45,
  questionnaire: 0.1,
  unknown: 0.25,
};

function clampScore(score) {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function normalizeForSignals(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function sourceTypeFromFolder(sourceFolder = {}, sourcePath = "") {
  const key = normalizeForSignals(sourceFolder.key);
  const folderPath = normalizeForSignals(sourceFolder.relativePath);
  const fullPath = normalizeForSignals(sourcePath);
  const probe = `${key} ${folderPath} ${fullPath}`;

  if (/approved high confidence|approved_high_confidence|current kb high|current_kb_high/.test(probe)) {
    return "approved_high_confidence";
  }
  if (/approved medium confidence|approved_medium_confidence|current kb medium|current_kb_medium/.test(probe)) {
    return "approved_medium_confidence";
  }
  if (/knowledge intake.*approved|current kb approved|current_kb_approved/.test(probe)) {
    return "approved_dataset";
  }
  if (/b17|b 17/.test(probe)) return "b17_article";
  if (/telegram|tg channel/.test(probe)) return "telegram_channel";
  if (/raw sample|raw_samples|author voice/.test(probe)) return "raw_sample";
  if (/website vercel|website_vercel|vercel/.test(probe)) return "website_vercel";
  if (/questionnaire|questionnaires|анкета|опросник|шкала|(?:^|\s)тест(?:\s|$)/.test(probe)) return "questionnaire";
  if (SOURCE_TYPES.includes(sourceFolder.sourceType) && sourceFolder.sourceType !== "unknown") {
    return sourceFolder.sourceType;
  }
  return "unknown";
}

function detectContentKind(sourcePath, text, wordCount) {
  const name = normalizeForSignals(sourcePath);
  const sample = normalizeForSignals(text.slice(0, 12000));
  const probe = `${name}\n${sample}`;

  const blankLineCount = (text.match(/_{4,}|\.{4,}/g) || []).length;
  if (countMatches(probe, [
    /анкета|опросник|шкала|(?:^|\s)тест(?:\s|$)|обслед/,
    /ф\.?\s*и\.?\s*о\.?|дата рождения|возраст/,
    /выберите|отметьте|оцените|балл|вариант ответа/,
  ]) >= 2 && blankLineCount >= 3) return "questionnaire";

  if (/вопрос[:\s]|ответ[:\s]|частые вопросы|faq|\bq[:\s]|\ba[:\s]/.test(probe)) return "faq";
  if (/записаться|консультац|стоимость|курс|вебинар|мест осталось|скидк|оплат/.test(probe)) return "sales";
  if (/случай из практики|клиентк|клиент приш|на сессии|в терапии|терапевтическ/.test(probe)) return "therapeutic_case";
  if (/история|однажды|я помню|в моей практике|расскажу|когда я/.test(probe)) return "storytelling";
  if (wordCount < 140 || /хук|hook|reels|сторис|коротк/.test(probe)) return "short_hook";
  if (/исследован|причин|симптом|механизм|важно понимать|норма|развитие|дисфункц|сексуальн|отношени/.test(probe)) {
    return "educational";
  }
  return "unknown";
}

function detectNoise(sourcePath, text, wordCount, contentHashSeen) {
  const name = normalizeForSignals(sourcePath);
  const normalizedText = normalizeForSignals(text);
  const warnings = [];

  const questionnaireSignals = countMatches(`${name}\n${normalizedText.slice(0, 16000)}`, [
    /анкета|опросник|шкала|(?:^|\s)тест(?:\s|$)|обслед/,
    /ф\.?\s*и\.?\s*о\.?|дата рождения|семейное положение/,
    /выберите|отметьте|подчеркните|оцените|заполните/,
    /балл|вариант ответа|никогда|редко|часто|всегда/,
  ]);
  const blankLineCount = (text.match(/_{4,}|\.{4,}/g) || []).length;
  if (questionnaireSignals >= 2 && blankLineCount >= 3) warnings.push("probable_questionnaire");

  if (wordCount < 120 || text.trim().length < 800) warnings.push("low_signal");

  const adminProbe = normalizedText.slice(0, 4000);
  if (/информированное согласие|договор оказания|обработк.{0,24}персональн.{0,24}данн|политика конфиденциальности|реквизиты|администратор|служебн/.test(adminProbe)) {
    warnings.push("admin_content");
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeForSignals(line).trim())
    .filter((line) => line.length > 24);
  if (lines.length >= 8) {
    const unique = new Set(lines);
    const repeatedRatio = 1 - unique.size / lines.length;
    if (repeatedRatio >= 0.35) warnings.push("duplicate_boilerplate");
  }

  if (contentHashSeen) warnings.push("duplicate_boilerplate");

  return [...new Set(warnings)];
}

function confidenceForSource(sourceType, warnings, contentKind) {
  const unsafePenalty = warnings.includes("probable_questionnaire") || warnings.includes("admin_content") ? 0.3 : 0;
  const lowSignalPenalty = warnings.includes("low_signal") ? 0.15 : 0;
  const duplicatePenalty = warnings.includes("duplicate_boilerplate") ? 0.1 : 0;
  const questionnairePenalty = contentKind === "questionnaire" ? 0.25 : 0;
  const penalty = unsafePenalty + lowSignalPenalty + duplicatePenalty + questionnairePenalty;

  const base = {
    approved_high_confidence: 0.96,
    b17_article: 0.95,
    website_vercel: 0.9,
    approved_dataset: 0.86,
    approved_medium_confidence: 0.72,
    telegram_channel: 0.72,
    raw_sample: 0.5,
    questionnaire: 0.18,
    unknown: 0.28,
  }[sourceType] ?? 0.28;

  const expertSignalScore = clampScore(base - penalty);
  let confidenceLevel = "low";
  if (expertSignalScore >= 0.8) confidenceLevel = "high";
  else if (expertSignalScore >= 0.5) confidenceLevel = "medium";

  return { confidence_level: confidenceLevel, expert_signal_score: expertSignalScore };
}

function classifySource({ sourceFolder, sourcePath, text, wordCount, duplicateContent = false }) {
  const initialType = sourceTypeFromFolder(sourceFolder, sourcePath);
  const contentKind = detectContentKind(sourcePath, text, wordCount);
  const noiseWarnings = detectNoise(sourcePath, text, wordCount, duplicateContent);
  const sourceType = contentKind === "questionnaire" || noiseWarnings.includes("probable_questionnaire")
    ? "questionnaire"
    : initialType;
  const confidence = confidenceForSource(sourceType, noiseWarnings, contentKind);
  const isGenerationSafe = !noiseWarnings.some((warning) => [
    "probable_questionnaire",
    "low_signal",
    "duplicate_boilerplate",
    "admin_content",
  ].includes(warning));

  return {
    source_type: sourceType,
    confidence_level: confidence.confidence_level,
    expert_signal_score: confidence.expert_signal_score,
    content_kind: contentKind,
    is_generation_safe: isGenerationSafe,
    warnings: noiseWarnings,
    classification: {
      source_type_rule: sourceType === initialType ? "path_and_folder_heuristics" : "questionnaire_signal_override",
      initial_source_type: initialType,
      suggested_retrieval_weight: SUGGESTED_RETRIEVAL_WEIGHTS[sourceType] ?? SUGGESTED_RETRIEVAL_WEIGHTS.unknown,
    },
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key] ?? "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function taxonomySummary(files) {
  const safeCount = files.filter((file) => file.is_generation_safe).length;
  const unsafeCount = files.length - safeCount;
  return {
    source_type_distribution: countBy(files, "source_type"),
    confidence_distribution: countBy(files, "confidence_level"),
    content_kind_distribution: countBy(files, "content_kind"),
    generation_safety: {
      safe: safeCount,
      unsafe: unsafeCount,
    },
    low_signal_files: files.filter((file) => file.warnings?.includes("low_signal")).map((file) => file.source_path),
    probable_questionnaire_files: files.filter((file) => file.warnings?.includes("probable_questionnaire")).map((file) => file.source_path),
    duplicate_boilerplate_files: files.filter((file) => file.warnings?.includes("duplicate_boilerplate")).map((file) => file.source_path),
    admin_content_files: files.filter((file) => file.warnings?.includes("admin_content")).map((file) => file.source_path),
  };
}

function renderTaxonomySummaryMarkdown({ expert, generatedAt, files, taxonomy }) {
  const list = (items) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
  const distribution = (counts) => Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `- ${key}: ${count}`)
    .join("\n") || "- none";
  const grouped = (key) => {
    const groups = {};
    for (const file of files) {
      const value = file[key] || "unknown";
      if (!groups[value]) groups[value] = [];
      groups[value].push(file.source_path);
    }
    return Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, paths]) => `### ${value}\n\n${list(paths)}`)
      .join("\n\n") || "- none";
  };
  const weights = Object.entries(SUGGESTED_RETRIEVAL_WEIGHTS)
    .map(([sourceType, weight]) => `| ${sourceType} | ${weight.toFixed(2)} |`)
    .join("\n");

  return `# ${expert} Onboarding Taxonomy Summary

Generated: ${generatedAt}

This report is local-only metadata guidance. It does not mutate production indexes, FAISS files, prompts, or live bot behavior.

## Source Type Distribution

${distribution(taxonomy.source_type_distribution)}

## Confidence Distribution

${distribution(taxonomy.confidence_distribution)}

## Content Kind Distribution

${distribution(taxonomy.content_kind_distribution)}

## Generation Safety

- Safe: ${taxonomy.generation_safety.safe}
- Unsafe or noisy candidates: ${taxonomy.generation_safety.unsafe}

## Files By Source Type

${grouped("source_type")}

## Files By Confidence

${grouped("confidence_level")}

## Files By Content Kind

${grouped("content_kind")}

## Unsafe Or Noisy Candidates

### Low Signal

${list(taxonomy.low_signal_files)}

### Probable Questionnaires

${list(taxonomy.probable_questionnaire_files)}

### Duplicate Boilerplate

${list(taxonomy.duplicate_boilerplate_files)}

### Administrative Content

${list(taxonomy.admin_content_files)}

## Suggested Retrieval Weighting Strategy

| source_type | suggested_weight |
| --- | ---: |
${weights}

Recommended future filtering: keep all files in storage, but default generation retrieval toward high-confidence educational, B17, website, and approved dataset sources. Down-rank raw samples and questionnaire/admin material unless the user explicitly asks for intake, assessment, or style analysis.
`;
}

export {
  SOURCE_TYPES,
  CONFIDENCE_LEVELS,
  CONTENT_KINDS,
  SUGGESTED_RETRIEVAL_WEIGHTS,
  classifySource,
  taxonomySummary,
  renderTaxonomySummaryMarkdown,
};
