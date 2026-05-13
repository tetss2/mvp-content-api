import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const DEFAULT_EXPERT = "dinara";
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".text"]);

const GENERIC_AI_PHRASES = [
  "Важно понимать",
  "Следует отметить",
  "В современном мире",
  "Данная тема",
  "Подводя итог",
  "Необходимо подчеркнуть",
  "Таким образом",
  "В заключение",
  "Важно отметить",
  "Стоит отметить",
  "В данной статье",
  "Существует множество факторов",
  "Это является важным аспектом",
  "Рассмотрим подробнее",
];

const TONE_MARKERS = {
  warmth: ["береж", "тепл", "мягк", "поддерж", "забот", "нежн", "сочув"],
  empathy: ["понима", "чувству", "больно", "страшно", "стыд", "вина", "одинок"],
  directness: ["важно", "нужно", "стоит", "можно", "пора", "выбира"],
  softness: ["может", "иногда", "как будто", "попроб", "возможно", "бережно", "мягко"],
  authority: ["психолог", "сексолог", "специалист", "терап", "практик", "исслед", "механизм"],
  educational_tone: ["например", "это значит", "потому", "контекст", "фактор", "система", "объяс"],
  therapeutic_tone: ["тело", "границ", "контакт", "безопас", "стыд", "близост", "желани", "травм"],
  conversational_energy: ["вы", "ты", "давайте", "посмотрите", "замечали", "знаете", "?"],
  clinical_style: ["диагноз", "симптом", "патолог", "нарушен", "коррекц", "клиничес"],
};

const CTA_MARKERS = {
  soft: ["сохран", "подум", "понаблюд", "заметь", "вернитесь", "можно начать"],
  direct: ["запиш", "приход", "остав", "напиш", "жду", "ссылка"],
  therapeutic: ["обратитесь", "специалист", "консультац", "поддержк", "разобрать"],
  engagement: ["поделитесь", "напишите", "узнаете", "откликается", "комментар"],
};

const CP1251_EXTRA = new Map([
  ["Ђ", 0x80], ["Ѓ", 0x81], ["‚", 0x82], ["ѓ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86], ["‡", 0x87],
  ["€", 0x88], ["‰", 0x89], ["Љ", 0x8a], ["‹", 0x8b], ["Њ", 0x8c], ["Ќ", 0x8d], ["Ћ", 0x8e], ["Џ", 0x8f],
  ["ђ", 0x90], ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97],
  ["™", 0x99], ["љ", 0x9a], ["›", 0x9b], ["њ", 0x9c], ["ќ", 0x9d], ["ћ", 0x9e], ["џ", 0x9f],
  [" ", 0xa0], ["Ў", 0xa1], ["ў", 0xa2], ["Ј", 0xa3], ["¤", 0xa4], ["Ґ", 0xa5], ["¦", 0xa6], ["§", 0xa7],
  ["Ё", 0xa8], ["©", 0xa9], ["Є", 0xaa], ["«", 0xab], ["¬", 0xac], ["®", 0xae], ["Ї", 0xaf],
  ["°", 0xb0], ["±", 0xb1], ["І", 0xb2], ["і", 0xb3], ["ґ", 0xb4], ["µ", 0xb5], ["¶", 0xb6], ["·", 0xb7],
  ["ё", 0xb8], ["№", 0xb9], ["є", 0xba], ["»", 0xbb], ["ј", 0xbc], ["Ѕ", 0xbd], ["ѕ", 0xbe], ["ї", 0xbf],
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function clamp(value) {
  return round(Math.max(0, Math.min(1, value)));
}

function cp1251ByteForChar(char) {
  const code = char.charCodeAt(0);
  if (code >= 0x0410 && code <= 0x044f) return code - 0x0410 + 0xc0;
  if (CP1251_EXTRA.has(char)) return CP1251_EXTRA.get(char);
  if (code <= 0x7f) return code;
  return null;
}

function repairMojibake(text) {
  const raw = String(text || "");
  const suspicious = (raw.match(/[РС][\u0080-\u00ffА-Яа-яЁёЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ]{1,2}/g) || []).length;
  if (suspicious < 3) return raw;
  const bytes = [];
  for (const char of raw) {
    const byte = cp1251ByteForChar(char);
    if (byte === null) return raw;
    bytes.push(byte);
  }
  const repaired = Buffer.from(bytes).toString("utf8");
  const repairedCyrillic = (repaired.match(/[а-яё]/giu) || []).length;
  const rawCyrillic = (raw.match(/[а-яё]/giu) || []).length;
  return repairedCyrillic >= rawCyrillic ? repaired : raw;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function splitParagraphs(text) {
  return String(text || "").split(/\n\s*\n/g).map((item) => item.trim()).filter(Boolean);
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function words(text) {
  return String(text || "").toLowerCase().match(/[\p{L}\p{N}-]+/gu) || [];
}

function emojiList(text) {
  return String(text || "").match(/[\p{Extended_Pictographic}\uFE0F]/gu) || [];
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function countIncludes(text, markers) {
  const lower = String(text || "").toLowerCase();
  return markers.reduce((count, marker) => count + (lower.includes(marker.toLowerCase()) ? 1 : 0), 0);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topItems(items, limit = 20) {
  const counts = new Map();
  for (const item of items.filter(Boolean)) {
    const value = String(item).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function ngrams(tokens, size) {
  const result = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    result.push(tokens.slice(i, i + size).join(" "));
  }
  return result;
}

function profileDir(root = ROOT, expertId = DEFAULT_EXPERT) {
  return path.join(root, "expert_profiles", expertId, "voice");
}

function reportsDir(root = ROOT, expertId = DEFAULT_EXPERT) {
  return path.join(root, "expert_profiles", expertId, "reports", "voice");
}

async function loadAuthorVoiceSources({ root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const sourceDirs = [
    path.join(root, "expert_profiles", expertId, "author_voice"),
    path.join(root, "author_profiles", expertId),
    path.join(root, "expert_profiles", expertId, "knowledge_sources", "cleaned"),
  ];
  const files = [];
  for (const dir of sourceDirs) {
    const discovered = (await walkFiles(dir)).filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
    for (const file of discovered) {
      files.push({
        path: file,
        relative_path: path.relative(root, file).replace(/\\/g, "/"),
        content: repairMojibake(await fs.readFile(file, "utf8")),
      });
    }
  }
  return files;
}

async function loadGeneratedOutputs({ root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const runDir = path.join(root, "expert_profiles", expertId, "reports", "generation_runs");
  const files = (await walkFiles(runDir)).filter((file) => path.basename(file) === "generated_output.md");
  const outputs = [];
  for (const file of files) {
    outputs.push({
      path: file,
      relative_path: path.relative(root, file).replace(/\\/g, "/"),
      content: repairMojibake(await fs.readFile(file, "utf8")),
    });
  }
  return outputs;
}

function sourceCorpus(sources) {
  return sources.map((source) => source.content).join("\n\n");
}

function toneScore(text, markers) {
  const tokenCount = Math.max(1, words(text).length);
  const markerHits = markers.reduce((sum, marker) => {
    const re = new RegExp(escapeRegExp(marker), "giu");
    return sum + (String(text).match(re) || []).length;
  }, 0);
  return clamp(markerHits / tokenCount * 65);
}

function buildToneProfile(text, sourceCount) {
  return {
    generated_at: new Date().toISOString(),
    source_count: sourceCount,
    warmth: toneScore(text, TONE_MARKERS.warmth),
    empathy: toneScore(text, TONE_MARKERS.empathy),
    directness: toneScore(text, TONE_MARKERS.directness),
    softness: toneScore(text, TONE_MARKERS.softness),
    authority: toneScore(text, TONE_MARKERS.authority),
    educational_tone: toneScore(text, TONE_MARKERS.educational_tone),
    therapeutic_tone: toneScore(text, TONE_MARKERS.therapeutic_tone),
    conversational_energy: toneScore(text, TONE_MARKERS.conversational_energy),
    clinical_style: toneScore(text, TONE_MARKERS.clinical_style),
  };
}

function buildSentenceRhythm(text) {
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const sentenceWords = sentences.map((sentence) => words(sentence).length);
  const questions = sentences.filter((sentence) => sentence.endsWith("?")).length;
  const exclamations = sentences.filter((sentence) => sentence.endsWith("!")).length;
  const hooks = paragraphs
    .map((paragraph) => splitSentences(paragraph)[0])
    .filter(Boolean)
    .filter((sentence) => words(sentence).length <= 12 || sentence.endsWith("?"));
  const contrastCount = countIncludes(text, ["но", "однако", "не потому", "а потому", "с одной стороны", "с другой"]);
  const transitions = topItems(sentences
    .map((sentence) => words(sentence).slice(0, 3).join(" "))
    .filter((item) => item.split(" ").length >= 2), 12);

  return {
    average_sentence_words: round(average(sentenceWords)),
    short_sentence_percent: sentences.length ? round(sentenceWords.filter((count) => count <= 8).length / sentences.length) : 0,
    long_sentence_percent: sentences.length ? round(sentenceWords.filter((count) => count >= 24).length / sentences.length) : 0,
    average_paragraph_sentences: round(average(paragraphs.map((paragraph) => splitSentences(paragraph).length))),
    average_paragraph_words: round(average(paragraphs.map((paragraph) => words(paragraph).length))),
    punctuation_style: {
      question_frequency: sentences.length ? round(questions / sentences.length) : 0,
      exclamation_frequency: sentences.length ? round(exclamations / sentences.length) : 0,
      ellipsis_frequency: sentences.length ? round((text.match(/…|\.\.\./g) || []).length / sentences.length) : 0,
      emoji_per_1000_words: words(text).length ? round(emojiList(text).length / words(text).length * 1000) : 0,
    },
    hook_frequency: paragraphs.length ? round(hooks.length / paragraphs.length) : 0,
    contrast_structure_frequency: words(text).length ? round(contrastCount / words(text).length * 100) : 0,
    cadence_patterns: [
      "short emotional opener",
      "medium explanation",
      "soft conversational transition",
      "warm CTA ending",
    ],
    common_transitions: transitions,
  };
}

function classifyPhrase(value) {
  const lower = value.toLowerCase();
  if (CTA_MARKERS.soft.some((marker) => lower.includes(marker)) || CTA_MARKERS.direct.some((marker) => lower.includes(marker))) return "cta";
  if (TONE_MARKERS.empathy.some((marker) => lower.includes(marker)) || TONE_MARKERS.warmth.some((marker) => lower.includes(marker))) return "emotional";
  if (TONE_MARKERS.educational_tone.some((marker) => lower.includes(marker))) return "educational";
  if (TONE_MARKERS.therapeutic_tone.some((marker) => lower.includes(marker))) return "therapeutic";
  if (TONE_MARKERS.authority.some((marker) => lower.includes(marker))) return "expert_terminology";
  return "general";
}

function buildVocabularyProfile(text) {
  const tokenList = words(text).filter((word) => word.length > 3);
  const phrases = topItems([...ngrams(tokenList, 2), ...ngrams(tokenList, 3)], 80);
  const classified = {
    high_confidence_expert_phrases: [],
    emotional_phrases: [],
    educational_phrases: [],
    therapeutic_wording: [],
    expert_terminology: [],
    soft_cta_patterns: [],
    audience_addressing_style: [],
    overused_phrases: phrases.filter((item) => item.count >= 4).slice(0, 20),
    generic_ai_phrasing_found: GENERIC_AI_PHRASES
      .filter((phrase) => text.toLowerCase().includes(phrase.toLowerCase()))
      .map((phrase) => ({ value: phrase, count: 1 })),
  };

  for (const phrase of phrases) {
    const kind = classifyPhrase(phrase.value);
    if (kind === "emotional") classified.emotional_phrases.push(phrase);
    if (kind === "educational") classified.educational_phrases.push(phrase);
    if (kind === "therapeutic") classified.therapeutic_wording.push(phrase);
    if (kind === "expert_terminology") classified.expert_terminology.push(phrase);
    if (kind === "cta") classified.soft_cta_patterns.push(phrase);
    if (phrase.count >= 2 && kind !== "general") classified.high_confidence_expert_phrases.push({ ...phrase, kind });
  }

  const lower = text.toLowerCase();
  if (/\bвы\b|\bвам\b|\bвас\b|\bваш/iu.test(lower)) classified.audience_addressing_style.push("formal_you");
  if (/\bты\b|\bтебе\b|\bтебя\b|\bтвой/iu.test(lower)) classified.audience_addressing_style.push("informal_you");
  if (/\bмы\b|\bдавайте\b/iu.test(lower)) classified.audience_addressing_style.push("shared_we");

  return classified;
}

function buildCtaStyleProfile(text) {
  const sentences = splitSentences(text);
  const ctaSentences = sentences.filter((sentence) => Object.values(CTA_MARKERS).some((markers) => countIncludes(sentence, markers) > 0));
  const styles = Object.fromEntries(Object.entries(CTA_MARKERS).map(([style, markers]) => [
    style,
    clamp(ctaSentences.length ? ctaSentences.filter((sentence) => countIncludes(sentence, markers) > 0).length / ctaSentences.length : 0),
  ]));
  const aggressiveRisk = countIncludes(text, ["срочно", "только сегодня", "успей", "иначе", "последний шанс"]);
  const lowWarmthRisk = ctaSentences.filter((sentence) => countIncludes(sentence, TONE_MARKERS.warmth) === 0 && countIncludes(sentence, TONE_MARKERS.softness) === 0).length;

  return {
    cta_sentence_count: ctaSentences.length,
    soft_cta_style: styles.soft,
    direct_cta_style: styles.direct,
    therapeutic_cta_style: styles.therapeutic,
    engagement_cta_style: styles.engagement,
    instagram_cta_behavior: topItems(ctaSentences.filter((sentence) => countIncludes(sentence, ["сохран", "комментар", "поделитесь"]) > 0), 10),
    telegram_conversational_cta_behavior: topItems(ctaSentences.filter((sentence) => countIncludes(sentence, ["напишите", "расскажите", "откликается"]) > 0), 10),
    aggressive_cta_risk: aggressiveRisk > 0 ? "medium" : "low",
    low_warmth_cta_risk: lowWarmthRisk > Math.max(1, ctaSentences.length / 2) ? "medium" : "low",
    weak_engagement_cta_risk: styles.engagement < 0.2 ? "medium" : "low",
    examples: ctaSentences.slice(0, 16),
  };
}

function buildStorytellingProfile(text) {
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const anecdoteSentences = sentences.filter((sentence) => countIncludes(sentence, ["однажды", "клиент", "женщина", "история", "пример", "приходит", "говорит"]) > 0);
  const emotionalHooks = paragraphs
    .map((paragraph) => splitSentences(paragraph)[0])
    .filter((sentence) => countIncludes(sentence, [...TONE_MARKERS.empathy, ...TONE_MARKERS.warmth]) > 0 || sentence?.endsWith("?"));
  const curiosityLoops = sentences.filter((sentence) => countIncludes(sentence, ["почему", "что происходит", "знаете", "дело не в", "на самом деле"]) > 0);
  const reframes = sentences.filter((sentence) => countIncludes(sentence, ["не значит", "это не", "скорее", "на самом деле", "может быть не"]) > 0);

  return {
    anecdote_usage_score: paragraphs.length ? clamp(anecdoteSentences.length / paragraphs.length) : 0,
    emotional_hook_score: paragraphs.length ? clamp(emotionalHooks.length / paragraphs.length) : 0,
    therapeutic_framing_score: toneScore(text, TONE_MARKERS.therapeutic_tone),
    educational_framing_score: toneScore(text, TONE_MARKERS.educational_tone),
    curiosity_loop_score: sentences.length ? clamp(curiosityLoops.length / sentences.length * 4) : 0,
    vulnerability_pattern_score: toneScore(text, ["стыд", "страш", "больно", "не так", "уязв", "одинок"]),
    audience_mirroring_score: toneScore(text, ["вы можете", "вам кажется", "если вы", "знакомо", "откликается"]),
    soft_reframing_score: sentences.length ? clamp(reframes.length / sentences.length * 5) : 0,
    detected_patterns: [
      "situation -> inner conflict -> insight -> expert meaning -> soft CTA",
      "reader pain mirror -> normalization -> expert reframe -> gentle next step",
      "case setup -> pattern -> interpretation -> general lesson",
    ],
    examples: {
      emotional_hooks: emotionalHooks.slice(0, 8),
      curiosity_loops: curiosityLoops.slice(0, 8),
      soft_reframes: reframes.slice(0, 8),
    },
  };
}

function buildEmotionalProfile(toneProfile) {
  return {
    warmth: toneProfile.warmth,
    empathy: toneProfile.empathy,
    softness: toneProfile.softness,
    directness: toneProfile.directness,
    authority: toneProfile.authority,
    therapeutic_tone: toneProfile.therapeutic_tone,
    emotional_range: clamp((toneProfile.warmth + toneProfile.empathy + toneProfile.therapeutic_tone) / 3),
    emotional_safety: clamp((toneProfile.softness + toneProfile.warmth) / 2),
    clinical_distance: toneProfile.clinical_style,
  };
}

function buildConversationalPatterns(text) {
  const sentences = splitSentences(text);
  return {
    rhetorical_questions: topItems(sentences.filter((sentence) => sentence.endsWith("?")), 20),
    reader_addressing: {
      formal_you_score: toneScore(text, ["вы", "вам", "вас", "ваш"]),
      informal_you_score: toneScore(text, ["ты", "тебе", "тебя", "твой"]),
      shared_we_score: toneScore(text, ["мы", "давайте", "посмотрим"]),
    },
    conversational_bridges: topItems(sentences.filter((sentence) => countIncludes(sentence, ["и здесь", "но", "потому", "например", "если"]) > 0), 20),
    warmth_markers: topItems(sentences.filter((sentence) => countIncludes(sentence, TONE_MARKERS.warmth) > 0), 20),
  };
}

function buildForbiddenGenericAiPhrases(text) {
  const found = GENERIC_AI_PHRASES
    .filter((phrase) => text.toLowerCase().includes(phrase.toLowerCase()))
    .map((phrase) => ({ phrase, detected_in_sources: true }));
  const base = GENERIC_AI_PHRASES.map((phrase) => ({
    phrase,
    detected_in_sources: found.some((item) => item.phrase === phrase),
    suppression_reason: "generic_ai_or_robotic_transition",
  }));
  return {
    phrases: base,
    structural_patterns: [
      {
        pattern: "repetitive numbered over-structuring",
        suppression_reason: "low-human rhythm unless requested as hook list or checklist",
      },
      {
        pattern: "formulaic intro -> list -> conclusion",
        suppression_reason: "generic GPT article shape",
      },
      {
        pattern: "corporate neutral abstraction",
        suppression_reason: "weak conversational warmth",
      },
    ],
  };
}

function buildExpertPhrases(vocabularyProfile) {
  return {
    high_confidence: vocabularyProfile.high_confidence_expert_phrases.slice(0, 30),
    emotional: vocabularyProfile.emotional_phrases.slice(0, 20),
    educational: vocabularyProfile.educational_phrases.slice(0, 20),
    therapeutic: vocabularyProfile.therapeutic_wording.slice(0, 20),
    cta: vocabularyProfile.soft_cta_patterns.slice(0, 20),
  };
}

function buildAuthorVoiceProfile({ sources = [], expertId = DEFAULT_EXPERT } = {}) {
  const text = sourceCorpus(sources);
  const toneProfile = buildToneProfile(text, sources.length);
  const sentenceRhythm = buildSentenceRhythm(text);
  const vocabularyProfile = buildVocabularyProfile(text);
  const ctaStyleProfile = buildCtaStyleProfile(text);
  const storytellingProfile = buildStorytellingProfile(text);
  const emotionalProfile = buildEmotionalProfile(toneProfile);
  const conversationalPatterns = buildConversationalPatterns(text);
  const expertPhrases = buildExpertPhrases(vocabularyProfile);
  const forbiddenGenericAiPhrases = buildForbiddenGenericAiPhrases(text);

  return {
    expert_id: expertId,
    generated_at: new Date().toISOString(),
    source_files: sources.map((source) => ({
      path: source.relative_path,
      chars: source.content.length,
    })),
    tone_profile: toneProfile,
    sentence_rhythm: sentenceRhythm,
    vocabulary_profile: vocabularyProfile,
    cta_style_profile: ctaStyleProfile,
    storytelling_profile: storytellingProfile,
    emotional_profile: emotionalProfile,
    conversational_patterns: conversationalPatterns,
    expert_phrases: expertPhrases,
    forbidden_generic_ai_phrases: forbiddenGenericAiPhrases,
  };
}

function vectorSimilarity(a, b, keys) {
  const deltas = keys.map((key) => Math.abs(Number(a[key] || 0) - Number(b[key] || 0)));
  return clamp(1 - average(deltas));
}

function setOverlapScore(outputPhrases, profilePhrases) {
  const outputSet = new Set(outputPhrases.map((item) => item.value || item));
  const profileSet = new Set(profilePhrases.map((item) => item.value || item));
  if (!profileSet.size) return 0.5;
  let matches = 0;
  for (const phrase of outputSet) {
    if (profileSet.has(phrase)) matches += 1;
  }
  return clamp(matches / Math.min(profileSet.size, 20));
}

function scoreAuthorVoiceMatch(output, profile) {
  const outputText = String(output || "");
  const outputTone = buildToneProfile(outputText, 1);
  const outputRhythm = buildSentenceRhythm(outputText);
  const outputVocab = buildVocabularyProfile(outputText);
  const outputCta = buildCtaStyleProfile(outputText);
  const outputStory = buildStorytellingProfile(outputText);
  const profileTone = profile.tone_profile || {};
  const toneSimilarity = vectorSimilarity(outputTone, profileTone, [
    "warmth",
    "empathy",
    "directness",
    "softness",
    "authority",
    "educational_tone",
    "therapeutic_tone",
  ]);
  const emotionalSimilarity = vectorSimilarity(buildEmotionalProfile(outputTone), profile.emotional_profile || {}, [
    "warmth",
    "empathy",
    "softness",
    "directness",
    "authority",
    "therapeutic_tone",
  ]);
  const rhythmSimilarity = vectorSimilarity(outputRhythm, profile.sentence_rhythm || {}, [
    "average_sentence_words",
    "short_sentence_percent",
    "long_sentence_percent",
    "average_paragraph_sentences",
    "hook_frequency",
  ]);
  const vocabularySimilarity = setOverlapScore(
    outputVocab.high_confidence_expert_phrases,
    profile.expert_phrases?.high_confidence || [],
  );
  const ctaSimilarity = vectorSimilarity(outputCta, profile.cta_style_profile || {}, [
    "soft_cta_style",
    "direct_cta_style",
    "therapeutic_cta_style",
    "engagement_cta_style",
  ]);
  const storytellingSimilarity = vectorSimilarity(outputStory, profile.storytelling_profile || {}, [
    "anecdote_usage_score",
    "emotional_hook_score",
    "therapeutic_framing_score",
    "educational_framing_score",
    "soft_reframing_score",
  ]);
  const genericHits = (profile.forbidden_generic_ai_phrases?.phrases || [])
    .filter((item) => outputText.toLowerCase().includes(item.phrase.toLowerCase()))
    .map((item) => item.phrase);
  const genericAiRisk = genericHits.length >= 2 ? "high" : genericHits.length === 1 ? "medium" : "low";
  const overall = clamp((
    toneSimilarity
    + emotionalSimilarity
    + rhythmSimilarity
    + vocabularySimilarity
    + ctaSimilarity
    + storytellingSimilarity
    + (genericAiRisk === "low" ? 1 : genericAiRisk === "medium" ? 0.65 : 0.35)
  ) / 7);

  return {
    tone_similarity: toneSimilarity,
    vocabulary_similarity: vocabularySimilarity,
    rhythm_similarity: rhythmSimilarity,
    emotional_similarity: emotionalSimilarity,
    cta_similarity: ctaSimilarity,
    storytelling_similarity: storytellingSimilarity,
    generic_ai_risk: genericAiRisk,
    generic_ai_phrase_hits: genericHits,
    overall_voice_match_score: overall,
    recommendations: buildStyleAdaptationRecommendations({
      toneSimilarity,
      vocabularySimilarity,
      rhythmSimilarity,
      emotionalSimilarity,
      ctaSimilarity,
      storytellingSimilarity,
      genericAiRisk,
    }),
  };
}

function buildStyleAdaptationRecommendations(scores) {
  const recommendations = [];
  if (scores.emotionalSimilarity < 0.65) recommendations.push("increase warmth and emotional specificity");
  if (scores.rhythmSimilarity < 0.65) recommendations.push("improve emotional cadence and paragraph rhythm");
  if (scores.vocabularySimilarity < 0.45) recommendations.push("increase expert-authentic phrasing and reduce generic vocabulary");
  if (scores.ctaSimilarity < 0.65) recommendations.push("align CTA with softer therapeutic invitation style");
  if (scores.storytellingSimilarity < 0.65) recommendations.push("improve storytelling flow and soft reframing");
  if (scores.genericAiRisk !== "low") recommendations.push("reduce generic AI wording and formulaic transitions");
  if (!recommendations.length) recommendations.push("voice match is acceptable; keep monitoring with human review");
  return recommendations;
}

async function writeAuthorVoiceProfile(profile, { root = ROOT, expertId = DEFAULT_EXPERT } = {}) {
  const dir = profileDir(root, expertId);
  await fs.mkdir(dir, { recursive: true });
  const files = {
    tone_profile: path.join(dir, "tone_profile.json"),
    sentence_rhythm: path.join(dir, "sentence_rhythm.json"),
    vocabulary_profile: path.join(dir, "vocabulary_profile.json"),
    cta_style_profile: path.join(dir, "cta_style_profile.json"),
    storytelling_profile: path.join(dir, "storytelling_profile.json"),
    emotional_profile: path.join(dir, "emotional_profile.json"),
    conversational_patterns: path.join(dir, "conversational_patterns.json"),
    expert_phrases: path.join(dir, "expert_phrases.json"),
    forbidden_generic_ai_phrases: path.join(dir, "forbidden_generic_ai_phrases.json"),
  };
  await fs.writeFile(files.tone_profile, `${JSON.stringify(profile.tone_profile, null, 2)}\n`, "utf8");
  await fs.writeFile(files.sentence_rhythm, `${JSON.stringify(profile.sentence_rhythm, null, 2)}\n`, "utf8");
  await fs.writeFile(files.vocabulary_profile, `${JSON.stringify(profile.vocabulary_profile, null, 2)}\n`, "utf8");
  await fs.writeFile(files.cta_style_profile, `${JSON.stringify(profile.cta_style_profile, null, 2)}\n`, "utf8");
  await fs.writeFile(files.storytelling_profile, `${JSON.stringify(profile.storytelling_profile, null, 2)}\n`, "utf8");
  await fs.writeFile(files.emotional_profile, `${JSON.stringify(profile.emotional_profile, null, 2)}\n`, "utf8");
  await fs.writeFile(files.conversational_patterns, `${JSON.stringify(profile.conversational_patterns, null, 2)}\n`, "utf8");
  await fs.writeFile(files.expert_phrases, `${JSON.stringify(profile.expert_phrases, null, 2)}\n`, "utf8");
  await fs.writeFile(files.forbidden_generic_ai_phrases, `${JSON.stringify(profile.forbidden_generic_ai_phrases, null, 2)}\n`, "utf8");
  return files;
}

export {
  GENERIC_AI_PHRASES,
  buildAuthorVoiceProfile,
  buildStyleAdaptationRecommendations,
  loadAuthorVoiceSources,
  loadGeneratedOutputs,
  profileDir,
  reportsDir,
  scoreAuthorVoiceMatch,
  writeAuthorVoiceProfile,
};
