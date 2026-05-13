import { promises as fs } from "fs";
import path from "path";

function parseArgs(argv) {
  const args = { author: "dinara" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--author") args.author = argv[++i] || args.author;
  }
  return args;
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function words(text) {
  return (text.toLowerCase().match(/[а-яёa-z0-9-]+/giu) || []).filter((word) => word.length > 2);
}

function topItems(items, limit = 12) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
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

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;
}

function emojiList(text) {
  return text.match(/[\p{Extended_Pictographic}\uFE0F]/gu) || [];
}

function emptyProfile(author, sourceDir) {
  return {
    author,
    generated_at: new Date().toISOString(),
    source_files: [],
    status: "empty_source_folder",
    instructions: [
      `Положите тексты автора в ${sourceDir}`,
      "Подойдут .txt и .md файлы: посты с сайта, Telegram-канала, рассылок, заметок.",
      "После добавления файлов запустите npm run author:analyze:dinara",
    ],
  };
}

function analyze(author, sourceDir, files) {
  const joined = files.map((file) => file.content).join("\n\n");
  const paragraphs = splitParagraphs(joined);
  const sentences = splitSentences(joined);
  const tokenList = words(joined);
  const openings = paragraphs.map((paragraph) => splitSentences(paragraph)[0]).filter(Boolean);
  const closings = paragraphs.map((paragraph) => {
    const paragraphSentences = splitSentences(paragraph);
    return paragraphSentences[paragraphSentences.length - 1];
  }).filter(Boolean);
  const emojis = emojiList(joined);
  const questions = sentences.filter((sentence) => sentence.endsWith("?")).length;
  const complexMarkers = sentences.filter((sentence) => /это как|представьте|например|то есть|важно понимать|если проще/iu.test(sentence));

  return {
    author,
    generated_at: new Date().toISOString(),
    source_files: files.map((file) => file.name),
    status: "ok",
    typical_tone: questions > sentences.length * 0.2
      ? "диалоговый, с частыми вопросами к читателю"
      : "спокойный, объясняющий, поддерживающий",
    sentence_length: {
      average_words: average(sentences.map((sentence) => words(sentence).length)),
      short_sentences_percent: sentences.length
        ? Number((sentences.filter((sentence) => words(sentence).length <= 8).length / sentences.length * 100).toFixed(1))
        : 0,
    },
    paragraph_length: {
      average_sentences: average(paragraphs.map((paragraph) => splitSentences(paragraph).length)),
      average_words: average(paragraphs.map((paragraph) => words(paragraph).length)),
    },
    common_opening_patterns: topItems(openings.map((sentence) => sentence.slice(0, 140)), 8),
    common_closing_patterns: topItems(closings.map((sentence) => sentence.slice(0, 140)), 8),
    common_phrases: topItems([
      ...ngrams(tokenList, 2),
      ...ngrams(tokenList, 3),
    ], 18),
    emoji_usage: {
      total: emojis.length,
      per_1000_words: tokenList.length ? Number((emojis.length / tokenList.length * 1000).toFixed(1)) : 0,
      common: topItems(emojis, 12),
    },
    how_author_explains_complex_things: complexMarkers.slice(0, 8),
    words_phrases_to_avoid: [
      "обещания гарантированного результата",
      "жёсткая норма вместо бережного объяснения",
      "диагнозы без очной консультации",
      "стыдящие формулировки",
    ],
    audience_address_style: /ты|тебе|твой/iu.test(joined) ? "на ты" : "нейтральное или смешанное обращение",
    formatting_habits: {
      uses_blank_lines: /\n\s*\n/u.test(joined),
      uses_markdown_bold: /\*[^*]+\*/u.test(joined),
      uses_lists: /^\s*[-*•]/mu.test(joined),
    },
    examples_of_author_like_phrasing: sentences.slice(0, 10),
  };
}

function renderMarkdown(profile, sourceDir) {
  if (profile.status === "empty_source_folder") {
    return `# Профиль голоса автора: ${profile.author}

Сгенерировано: ${profile.generated_at}

Источник текстов пока пуст.

## Что сделать

- Положите тексты автора в \`${sourceDir}\`
- Подойдут \`.txt\` и \`.md\`: посты с сайта, Telegram-канала, рассылок, заметок
- После добавления файлов запустите \`npm run author:analyze:dinara\`

## Что будет проанализировано

- typical tone
- sentence length
- paragraph length
- common opening patterns
- common closing patterns
- common phrases
- emoji usage
- how author explains complex things
- words/phrases to avoid
- audience address style
- formatting habits
- examples of author-like phrasing
`;
  }

  const list = (items, key = "value") => items?.length
    ? items.map((item) => `- ${item[key]}${item.count ? ` (${item.count})` : ""}`).join("\n")
    : "- Недостаточно данных";

  return `# Профиль голоса автора: ${profile.author}

Сгенерировано: ${profile.generated_at}

Файлы-источники: ${profile.source_files.join(", ")}

## Typical Tone

${profile.typical_tone}

## Sentence Length

- Средняя длина: ${profile.sentence_length.average_words} слов
- Короткие предложения: ${profile.sentence_length.short_sentences_percent}%

## Paragraph Length

- Среднее число предложений: ${profile.paragraph_length.average_sentences}
- Среднее число слов: ${profile.paragraph_length.average_words}

## Common Opening Patterns

${list(profile.common_opening_patterns)}

## Common Closing Patterns

${list(profile.common_closing_patterns)}

## Common Phrases

${list(profile.common_phrases)}

## Emoji Usage

- Всего: ${profile.emoji_usage.total}
- На 1000 слов: ${profile.emoji_usage.per_1000_words}
- Частые: ${profile.emoji_usage.common.map((item) => `${item.value} (${item.count})`).join(", ") || "нет"}

## How Author Explains Complex Things

${profile.how_author_explains_complex_things.length ? profile.how_author_explains_complex_things.map((item) => `- ${item}`).join("\n") : "- Недостаточно данных"}

## Words/Phrases To Avoid

${profile.words_phrases_to_avoid.map((item) => `- ${item}`).join("\n")}

## Audience Address Style

${profile.audience_address_style}

## Formatting Habits

- Пустые строки между абзацами: ${profile.formatting_habits.uses_blank_lines ? "да" : "нет"}
- Markdown bold: ${profile.formatting_habits.uses_markdown_bold ? "да" : "нет"}
- Списки: ${profile.formatting_habits.uses_lists ? "да" : "нет"}

## Examples Of Author-Like Phrasing

${profile.examples_of_author_like_phrasing.map((item) => `- ${item}`).join("\n")}
`;
}

async function readSourceFiles(sourceDir) {
  await fs.mkdir(sourceDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(txt|md)$/i.test(entry.name) || entry.name.toLowerCase() === "readme.md") continue;
    const filePath = path.join(sourceDir, entry.name);
    const content = await fs.readFile(filePath, "utf-8");
    if (content.trim()) files.push({ name: entry.name, content });
  }
  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const authorDir = path.join(process.cwd(), "author_profiles", args.author);
  const sourceDir = path.join(authorDir, "voice_sources");
  await fs.mkdir(sourceDir, { recursive: true });

  const files = await readSourceFiles(sourceDir);
  const profile = files.length ? analyze(args.author, sourceDir, files) : emptyProfile(args.author, sourceDir);

  const jsonPath = path.join(authorDir, "voice_profile.json");
  const mdPath = path.join(authorDir, "voice_profile.md");
  await fs.writeFile(jsonPath, JSON.stringify(profile, null, 2), "utf-8");
  await fs.writeFile(mdPath, renderMarkdown(profile, sourceDir), "utf-8");

  console.log(`Author voice profile written: ${mdPath}`);
  console.log(`Author voice JSON written: ${jsonPath}`);
  if (profile.status === "empty_source_folder") {
    console.log("Warning: voice source folder is empty; profile contains setup instructions.");
  }
}

main().catch((err) => {
  console.error(`Author voice analysis failed: ${err.message}`);
  process.exit(1);
});
