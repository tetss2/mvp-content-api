import { promises as fs } from "fs";
import path from "path";

const INPUT_FOLDERS = [
  "author_voice/raw_samples",
  "knowledge_sources/website_vercel",
  "knowledge_sources/b17_articles",
  "knowledge_sources/telegram_channel",
];
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".text"]);

function parseArgs(argv) {
  const args = { expert: "dinara" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--expert") args.expert = argv[++i] || args.expert;
  }
  return args;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listTextFiles(dir) {
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTextFiles(fullPath));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function splitParagraphs(text) {
  return text.split(/\n\s*\n/g).map((item) => item.trim()).filter(Boolean);
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function words(text) {
  return text.toLowerCase().match(/[а-яёa-z0-9-]+/giu) || [];
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;
}

function topItems(items, limit = 12) {
  const counts = new Map();
  for (const item of items.filter(Boolean)) counts.set(item, (counts.get(item) || 0) + 1);
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

function emojiList(text) {
  return text.match(/[\p{Extended_Pictographic}\uFE0F]/gu) || [];
}

function containsAny(sentence, patterns) {
  return patterns.some((pattern) => pattern.test(sentence));
}

function buildEmptyProfile(expert, sourceSummaries) {
  return {
    expert,
    generated_at: new Date().toISOString(),
    status: "empty_sources",
    source_files: [],
    source_folders: sourceSummaries,
    tone: "Недостаточно данных: добавьте .txt или .md файлы в raw_samples или source folders.",
    common_phrases: [],
    paragraph_rhythm: {
      average_sentences: 0,
      average_words: 0,
      note: "Недостаточно данных.",
    },
    emoji_usage: { total: 0, per_1000_words: 0, common: [] },
    taboo_patterns: [],
    cta_style: [],
    sentence_length: { average_words: 0, short_sentences_percent: 0, long_sentences_percent: 0 },
    reader_addressing_style: "Недостаточно данных.",
    topics_and_recurring_motifs: [],
    warnings: ["No text files found for author voice intake."],
  };
}

function analyze(expert, sourceSummaries, files) {
  const joined = files.map((file) => file.content).join("\n\n");
  const paragraphs = splitParagraphs(joined);
  const sentences = splitSentences(joined);
  const tokenList = words(joined).filter((word) => word.length > 2);
  const emojis = emojiList(joined);
  const questions = sentences.filter((sentence) => sentence.endsWith("?")).length;
  const exclamations = sentences.filter((sentence) => sentence.endsWith("!")).length;
  const ctaSentences = sentences.filter((sentence) => containsAny(sentence, [
    /напишите|поделитесь|сохраните|приходите|запишитесь|задайте|попробуйте|давайте/iu,
    /оставьте|расскажите|обратите внимание/iu,
  ])).slice(0, 16);
  const tabooSentences = sentences.filter((sentence) => containsAny(sentence, [
    /гарантирован|навсегда|точно вылеч|диагноз|норма для всех/iu,
    /стыдно|должна|обязана|терпи|сама виновата/iu,
  ])).slice(0, 16);
  const motifTokens = tokenList.filter((word) => word.length >= 5);
  const openings = paragraphs.map((paragraph) => splitSentences(paragraph)[0]).filter(Boolean);
  const closings = paragraphs.map((paragraph) => {
    const paragraphSentences = splitSentences(paragraph);
    return paragraphSentences[paragraphSentences.length - 1];
  }).filter(Boolean);

  const secondPersonInformal = /\b(ты|тебе|тебя|твой|твоя|можешь|чувствуешь)\b/iu.test(joined);
  const secondPersonFormal = /\b(вы|вас|вам|ваш|ваша|можете|чувствуете)\b/iu.test(joined);

  return {
    expert,
    generated_at: new Date().toISOString(),
    status: "ok",
    source_files: files.map((file) => ({
      path: file.relativePath,
      chars: file.content.length,
    })),
    source_folders: sourceSummaries,
    tone: questions > sentences.length * 0.18
      ? "Диалоговый, мягко исследующий, с частыми вопросами к читателю."
      : "Спокойный, объясняющий, поддерживающий, без давления на читателя.",
    common_phrases: topItems([...ngrams(tokenList, 2), ...ngrams(tokenList, 3)], 20),
    common_openings: topItems(openings.map((sentence) => sentence.slice(0, 160)), 10),
    common_closings: topItems(closings.map((sentence) => sentence.slice(0, 160)), 10),
    paragraph_rhythm: {
      average_sentences: average(paragraphs.map((paragraph) => splitSentences(paragraph).length)),
      average_words: average(paragraphs.map((paragraph) => words(paragraph).length)),
      blank_lines_between_paragraphs: /\n\s*\n/u.test(joined),
    },
    emoji_usage: {
      total: emojis.length,
      per_1000_words: tokenList.length ? Number((emojis.length / tokenList.length * 1000).toFixed(1)) : 0,
      common: topItems(emojis, 12),
    },
    taboo_patterns: tabooSentences.length ? tabooSentences : [
      "Не давать гарантий результата.",
      "Не ставить диагнозы без очной консультации.",
      "Не стыдить за желания, отсутствие желания, телесные реакции или границы.",
      "Не писать жесткими нормами там, где нужна бережная вариативность.",
    ],
    cta_style: ctaSentences.length ? ctaSentences : [
      "Мягкий CTA через наблюдение, сохранение, вопрос к себе или приглашение на консультацию.",
    ],
    sentence_length: {
      average_words: average(sentences.map((sentence) => words(sentence).length)),
      short_sentences_percent: sentences.length
        ? Number((sentences.filter((sentence) => words(sentence).length <= 8).length / sentences.length * 100).toFixed(1))
        : 0,
      long_sentences_percent: sentences.length
        ? Number((sentences.filter((sentence) => words(sentence).length >= 24).length / sentences.length * 100).toFixed(1))
        : 0,
    },
    reader_addressing_style: secondPersonInformal && secondPersonFormal
      ? "Смешанное обращение на ты и на вы."
      : secondPersonInformal
        ? "Преимущественно на ты."
        : secondPersonFormal
          ? "Преимущественно на вы."
          : "Нейтральное обращение без явного ты/вы.",
    topics_and_recurring_motifs: topItems(motifTokens, 24),
    punctuation_habits: {
      questions,
      exclamations,
      question_percent: sentences.length ? Number((questions / sentences.length * 100).toFixed(1)) : 0,
      exclamation_percent: sentences.length ? Number((exclamations / sentences.length * 100).toFixed(1)) : 0,
    },
    warnings: [],
  };
}

function list(items, fallback = "- Недостаточно данных.") {
  return items?.length ? items.map((item) => {
    if (typeof item === "string") return `- ${item}`;
    return `- ${item.value}${item.count ? ` (${item.count})` : ""}`;
  }).join("\n") : fallback;
}

function renderMarkdown(profile) {
  return `# Voice profile: ${profile.expert}

Generated: ${profile.generated_at}
Status: ${profile.status}

## Tone

${profile.tone}

## Common Phrases

${list(profile.common_phrases)}

## Paragraph Rhythm

- Average sentences: ${profile.paragraph_rhythm.average_sentences}
- Average words: ${profile.paragraph_rhythm.average_words}
- Blank lines between paragraphs: ${profile.paragraph_rhythm.blank_lines_between_paragraphs ? "yes" : "no"}

## Emoji Usage

- Total: ${profile.emoji_usage.total}
- Per 1000 words: ${profile.emoji_usage.per_1000_words}
- Common: ${profile.emoji_usage.common?.map((item) => `${item.value} (${item.count})`).join(", ") || "none"}

## Taboo Patterns

${list(profile.taboo_patterns)}

## CTA Style

${list(profile.cta_style)}

## Sentence Length

- Average words: ${profile.sentence_length.average_words}
- Short sentences: ${profile.sentence_length.short_sentences_percent}%
- Long sentences: ${profile.sentence_length.long_sentences_percent}%

## Reader Addressing Style

${profile.reader_addressing_style}

## Topics And Recurring Motifs

${list(profile.topics_and_recurring_motifs)}

## Source Files

${profile.source_files?.length ? profile.source_files.map((file) => `- ${file.path} (${file.chars} chars)`).join("\n") : "- none"}

## Warnings

${profile.warnings?.length ? profile.warnings.map((warning) => `- ${warning}`).join("\n") : "- none"}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const expertDir = path.join(root, "expert_profiles", args.expert);
  const files = [];
  const sourceSummaries = [];

  for (const relativeFolder of INPUT_FOLDERS) {
    const folderPath = path.join(expertDir, relativeFolder);
    const folderExists = await exists(folderPath);
    const textFiles = await listTextFiles(folderPath);
    sourceSummaries.push({
      folder: relativeFolder,
      exists: folderExists,
      text_file_count: textFiles.length,
      empty: textFiles.length === 0,
    });

    for (const filePath of textFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      if (!content.trim()) continue;
      files.push({
        relativePath: path.relative(expertDir, filePath).replace(/\\/g, "/"),
        content,
      });
    }
  }

  const profile = files.length
    ? analyze(args.expert, sourceSummaries, files)
    : buildEmptyProfile(args.expert, sourceSummaries);

  const voiceDir = path.join(expertDir, "author_voice");
  await fs.mkdir(voiceDir, { recursive: true });
  const jsonPath = path.join(voiceDir, "voice_profile.json");
  const mdPath = path.join(voiceDir, "voice_profile.md");
  await fs.writeFile(jsonPath, JSON.stringify(profile, null, 2), "utf-8");
  await fs.writeFile(mdPath, renderMarkdown(profile), "utf-8");

  console.log(`Voice profile Markdown: ${mdPath}`);
  console.log(`Voice profile JSON: ${jsonPath}`);
  console.log(`Source folders: ${sourceSummaries.map((source) => `${source.folder}=${source.empty ? "empty" : "non-empty"}`).join(", ")}`);
  if (profile.warnings.length) console.log(`Warnings: ${profile.warnings.join("; ")}`);
}

main().catch((err) => {
  console.error(`Expert author voice intake failed: ${err.message}`);
  process.exit(1);
});
