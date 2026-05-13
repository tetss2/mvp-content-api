import "dotenv/config";

process.env.ENABLE_KB_RETRIEVAL = process.env.ENABLE_KB_RETRIEVAL || "true";

import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import { retrieveGroundingContext, estimateKbTokens } from "../retrieval_service.js";
import { buildSexologistPrompt, normalizeSexologistStyleKey } from "../sexologist_prompt.js";
import { buildAuthorVoicePrompt, loadAuthorVoiceProfile, logAuthorVoiceStatus } from "../author_voice.js";
import { getLengthConfig } from "../generation_config.js";

const TOPICS = [
  "Не хочу секса в отношениях, это нормально?",
  "Почему у женщин может пропасть либидо в длительных отношениях?",
  "Как говорить с партнёром о сексе, желаниях и границах?",
  "Почему может быть стыд за свои желания?",
  "Как тревога влияет на сексуальное желание?",
  "Почему оргазм может не получаться даже при любви к партнёру?",
  "Что важно объяснить мужчине, который переживает из-за нестабильной эрекции?",
  "Как близость и конфликты в паре связаны с сексуальным желанием?",
  "Как сексуальная травма может проявляться в отношениях и интимности?",
  "Как говорить о женской сексуальности без стыда и давления на норму?",
];

const LENGTHS = ["short", "normal", "long"];
const STYLE = "auto";
const EXPERT_ID = "dinara";

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function listFilesIfExists(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listFilesIfExists(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

async function latestJsonReport(dir, suffix) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
      const filePath = path.join(dir, entry.name);
      const stat = await fs.stat(filePath);
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0]?.filePath || null;
  } catch {
    return null;
  }
}

async function loadExpertContext(expertId) {
  const expertDir = path.join(process.cwd(), "expert_profiles", expertId);
  const profilePath = path.join(expertDir, "profile.json");
  const voiceProfilePath = path.join(expertDir, "author_voice", "voice_profile.md");
  const voiceProfileJsonPath = path.join(expertDir, "author_voice", "voice_profile.json");
  const cleanedRoot = path.join(expertDir, "knowledge_sources", "cleaned");
  const metadataRoot = path.join(cleanedRoot, "_metadata");
  const onboardingDir = path.join(expertDir, "reports", "onboarding");
  const latestPrepareReportPath = await latestJsonReport(onboardingDir, "_source_prepare_report.json");
  const latestPrepareReport = latestPrepareReportPath ? await readJsonIfExists(latestPrepareReportPath, null) : null;
  const cleanedFiles = (await listFilesIfExists(cleanedRoot))
    .filter((filePath) => !filePath.includes(`${path.sep}_metadata${path.sep}`))
    .filter((filePath) => /\.(txt|md|markdown|text)$/i.test(filePath));
  const metadataFiles = (await listFilesIfExists(metadataRoot))
    .filter((filePath) => filePath.endsWith(".metadata.json"));
  const cleanedSourceSummary = [];

  for (const filePath of cleanedFiles) {
    const stat = await fs.stat(filePath);
    cleanedSourceSummary.push({
      path: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
      bytes: stat.size,
    });
  }

  return {
    expertDir,
    profilePath,
    voiceProfilePath,
    voiceProfileJsonPath,
    profile: await readJsonIfExists(profilePath, null),
    voice_profile_json: await readJsonIfExists(voiceProfileJsonPath, null),
    cleaned_sources: {
      root: cleanedRoot,
      file_count: cleanedSourceSummary.length,
      files: cleanedSourceSummary,
    },
    provenance: {
      latest_prepare_report_path: latestPrepareReportPath,
      prepared_source_count: latestPrepareReport?.total_files_prepared ?? cleanedSourceSummary.length,
      source_type_breakdown: latestPrepareReport?.source_type_breakdown || {},
      confidence_breakdown: latestPrepareReport?.confidence_breakdown || {},
      content_kind_breakdown: latestPrepareReport?.content_kind_breakdown || {},
      generation_safety_breakdown: latestPrepareReport?.generation_safety_breakdown || null,
      taxonomy_summary_report: latestPrepareReport?.taxonomy_summary_report || null,
      low_signal_files: latestPrepareReport?.low_signal_files || [],
      probable_questionnaire_files: latestPrepareReport?.probable_questionnaire_files || [],
      duplicate_boilerplate_files: latestPrepareReport?.duplicate_boilerplate_files || [],
      metadata_count: latestPrepareReport?.metadata_files_created ?? metadataFiles.length,
      duplicate_warning_count: latestPrepareReport?.duplicate_hashes_detected ?? 0,
      unsupported_skipped_count: latestPrepareReport?.unsupported_files_skipped ?? 0,
      warnings: latestPrepareReport?.warnings || [],
    },
  };
}

function fallbackContext(topic) {
  return `Тема запроса: "${topic}". Отвечай на основе общих знаний психолога-сексолога, строго в рамках профессиональной этики. Не выдумывай исследования и статистику.`;
}

function renderSources(result) {
  if (result.warning) return `⚠️ ${result.warning}`;
  if (!result.sources?.length) return "Источники не найдены";
  return result.sources.map((source) => `- ${source}`).join("\n");
}

function renderExpertContext(expertContext) {
  const profile = expertContext.profile;
  const cleaned = expertContext.cleaned_sources;
  const provenance = expertContext.provenance;
  const voiceStatus = expertContext.voice_profile_json?.status || "not loaded";
  const cleanedLines = cleaned.files.length
    ? cleaned.files.slice(0, 12).map((file) => `- ${file.path} (${file.bytes} bytes)`).join("\n")
    : "- no cleaned source files yet";
  const sourceTypeLines = Object.keys(provenance.source_type_breakdown).length
    ? Object.entries(provenance.source_type_breakdown).map(([type, count]) => `- ${type}: ${count}`).join("\n")
    : "- none";
  const confidenceLines = Object.keys(provenance.confidence_breakdown).length
    ? Object.entries(provenance.confidence_breakdown).map(([level, count]) => `- ${level}: ${count}`).join("\n")
    : "- none";
  const contentKindLines = Object.keys(provenance.content_kind_breakdown).length
    ? Object.entries(provenance.content_kind_breakdown).map(([kind, count]) => `- ${kind}: ${count}`).join("\n")
    : "- none";
  const safety = provenance.generation_safety_breakdown;

  return `## Expert Context

- Expert: ${profile?.display_name || "Dinara"} (${profile?.expert_id || EXPERT_ID})
- Roles: ${profile?.roles?.join(", ") || "not configured"}
- Current KB: ${profile?.current_kb_id || "not configured"}
- Current scenario: ${profile?.current_scenario || "not configured"}
- Voice profile: ${voiceStatus}
- Cleaned source files: ${cleaned.file_count}

### Cleaned Sources

${cleanedLines}

## Source Provenance Summary

- Prepared source count: ${provenance.prepared_source_count}
- Metadata count: ${provenance.metadata_count}
- Duplicate warning count: ${provenance.duplicate_warning_count}
- Unsupported skipped count: ${provenance.unsupported_skipped_count}
- Taxonomy summary: ${provenance.taxonomy_summary_report || "not generated"}
- Generation-safe files: ${safety ? safety.safe : "unknown"}
- Unsafe/noisy candidates: ${safety ? safety.unsafe : "unknown"}

### Source Type Breakdown

${sourceTypeLines}

### Confidence Breakdown

${confidenceLines}

### Content Kind Breakdown

${contentKindLines}
`;
}

function renderMarkdown(results, generatedAt, expertContext) {
  const toc = TOPICS.map((topic, index) => `${index + 1}. [${topic}](#topic-${index + 1})`).join("\n");
  const sections = TOPICS.map((topic, topicIndex) => {
    const topicResults = results.filter((result) => result.topic === topic);
    const answers = topicResults.map((result) => `### ${result.length_mode}

**Тема:** ${result.topic}

**Длина:** ${result.length_mode}

**Стиль:** ${result.style_mode}

**Источники из базы:**  
${renderSources(result)}

**Retrieved chunks:** ${result.retrieved_chunks_count}

**Estimated token count:** ${result.estimated_token_count}

**Ответ:**

---

${result.answer || "_Ответ не был сгенерирован._"}

---

**Что проверить:**

- Нравится / не нравится
- Что звучит не как я?
- Где надо поправить?
- Какие фразы убрать?
- Какие формулировки оставить?

**Место для комментария Динары:**

> 
`).join("\n\n");

    return `## Topic ${topicIndex + 1}
<a id="topic-${topicIndex + 1}"></a>

${answers}`;
  }).join("\n\n");

  return `# Batch report: sexologist content for Dinara

Generation date: ${generatedAt}

Этот файл можно открыть с телефона. Внутри 30 вариантов ответов: 10 тем × 3 длины. Формальной оценки не нужно: достаточно отметить, где текст звучит хорошо, а где не похож на Динару или слабоват по экспертности.

## Table of Contents

${toc}

${renderExpertContext(expertContext)}

${sections}
`;
}

async function generateAnswer(openai, topic, lengthMode, authorVoice) {
  const styleKey = normalizeSexologistStyleKey(STYLE);
  const lengthConfig = getLengthConfig("sexologist", lengthMode);
  let retrieval = null;
  let context = "";
  let warning = "";

  try {
    retrieval = await retrieveGroundingContext(topic, "sexologist");
    context = retrieval?.context || "";
  } catch (err) {
    warning = `Retrieval failed: ${err.message}`;
  }

  if (!context) {
    warning = warning || "Retrieval unavailable; used generic professional fallback.";
    context = fallbackContext(topic);
  }

  const systemPrompt = [
    buildSexologistPrompt(styleKey),
    buildAuthorVoicePrompt(authorVoice),
  ].filter(Boolean).join("\n\n");
  const userPrompt = [
    `Тема: "${topic}"`,
    "",
    "Контекст:",
    context,
    "",
    lengthConfig.instruction,
    "С одной жирной фразой (*жирный*).",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.82,
    max_tokens: lengthConfig.maxTokens,
  });

  const answer = completion.choices[0]?.message?.content || "";
  return {
    topic,
    role: "sexologist",
    length_mode: lengthMode,
    style_mode: styleKey,
    sources: retrieval?.sources || [],
    retrieved_chunks_count: retrieval?.chunks?.length || 0,
    estimated_token_count: estimateKbTokens([systemPrompt, userPrompt, answer].join("\n\n")),
    answer_preview: answer.slice(0, 600),
    answer,
    production_version: retrieval?.productionVersion || null,
    warning,
    author_voice: {
      enabled: authorVoice.enabled,
      author: authorVoice.author,
      profile_loaded: authorVoice.profileLoaded,
      profile_path: authorVoice.profilePath,
    },
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate the batch report.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile();
  const expertContext = await loadExpertContext(EXPERT_ID);
  const reportDir = path.join(expertContext.expertDir, "reports", "batch_reports");
  await fs.mkdir(reportDir, { recursive: true });

  const voiceProfileReady = expertContext.voice_profile_json?.status === "ok";
  const authorVoice = await loadAuthorVoiceProfile({
    enabled: voiceProfileReady && (process.env.ENABLE_AUTHOR_VOICE === undefined || process.env.ENABLE_AUTHOR_VOICE === "true"),
    author: EXPERT_ID,
    profilePath: expertContext.voiceProfilePath,
  });
  logAuthorVoiceStatus(authorVoice);

  const results = [];
  for (const topic of TOPICS) {
    for (const lengthMode of LENGTHS) {
      console.log(`[batch-report] topic="${topic}" length=${lengthMode}`);
      try {
        results.push(await generateAnswer(openai, topic, lengthMode, authorVoice));
      } catch (err) {
        results.push({
          topic,
          role: "sexologist",
          length_mode: lengthMode,
          style_mode: STYLE,
          sources: [],
          retrieved_chunks_count: 0,
          estimated_token_count: 0,
          answer_preview: "",
          answer: "",
          production_version: null,
          warning: `Generation failed: ${err.message}`,
          author_voice: {
            enabled: authorVoice.enabled,
            author: authorVoice.author,
            profile_loaded: authorVoice.profileLoaded,
            profile_path: authorVoice.profilePath,
          },
        });
      }
    }
  }

  const jsonPath = path.join(reportDir, `dinara_batch_report_${stamp}.json`);
  const mdPath = path.join(reportDir, `${stamp}_dinara_batch_report.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ generated_at: generatedAt, expert_context: expertContext, results }, null, 2), "utf-8");
  await fs.writeFile(mdPath, renderMarkdown(results, generatedAt, expertContext), "utf-8");

  console.log(`Markdown report: ${mdPath}`);
  console.log(`JSON report: ${jsonPath}`);
}

main().catch((err) => {
  console.error(`Dinara batch report failed: ${err.message}`);
  process.exit(1);
});
