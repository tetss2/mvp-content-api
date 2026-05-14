import { promises as fs } from "fs";
import { basename, extname, join } from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const USERS_ROOT = join(process.cwd(), "users");

export const ONBOARDING_ROLES = {
  psychologist: {
    label: "Психолог",
    prompt: "Ты профессиональный психолог. Пиши экспертно, бережно, человечно, без диагнозов и обещаний результата.",
  },
  sexologist: {
    label: "Сексолог",
    prompt: "Ты профессиональный сексолог. Пиши спокойно, этично, научно аккуратно, без пошлости и без медицинских обещаний.",
  },
  gestalt_therapist: {
    label: "Гештальт-терапевт",
    prompt: "Ты гештальт-терапевт. Пиши через осознавание, контакт, чувства, границы и живой опыт клиента.",
  },
  coach: {
    label: "Коуч",
    prompt: "Ты коуч. Пиши ясно, практично, поддерживающе, с фокусом на выборе, действии и ответственности.",
  },
  blogger: {
    label: "Блогер",
    prompt: "Ты эксперт-блогер. Пиши живо, лично, наблюдательно, с сильным крючком и понятной мыслью для соцсетей.",
  },
};

export function getUserId(rawUserId) {
  return String(rawUserId || "unknown").replace(/[^\w.-]/g, "_");
}

export function getUserRoot(userId) {
  return join(USERS_ROOT, getUserId(userId));
}

export function slugifyScenario(value) {
  return String(value || "expert")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9а-я]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "expert";
}

export async function ensureUserExpertFolders(userId) {
  const root = getUserRoot(userId);
  const dirs = [
    "profile",
    "scenarios",
    "knowledge/pending",
    "style/pending",
    "voice",
    "avatar",
  ];
  await Promise.all(dirs.map((dir) => fs.mkdir(join(root, dir), { recursive: true })));
  return root;
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export async function loadUserProfile(userId) {
  return readJson(join(getUserRoot(userId), "profile", "profile.json"), null);
}

export async function saveUserProfile(userId, profile) {
  const root = await ensureUserExpertFolders(userId);
  await fs.writeFile(join(root, "profile", "profile.json"), JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}

export async function userHasCompletedExpert(userId) {
  const profile = await loadUserProfile(userId);
  return profile?.status === "completed";
}

export async function listUserScenarios(userId) {
  const root = await ensureUserExpertFolders(userId);
  const scenarioRoot = join(root, "scenarios");
  const entries = await fs.readdir(scenarioRoot, { withFileTypes: true }).catch(() => []);
  const scenarios = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const config = await readJson(join(scenarioRoot, entry.name, "config.json"), null);
    if (config) scenarios.push(config);
  }
  return scenarios.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export async function loadUserScenario(userId, scenarioId) {
  if (!scenarioId) return null;
  return readJson(join(getUserRoot(userId), "scenarios", scenarioId, "config.json"), null);
}

export async function createUserScenario(userId, roleKey, options = {}) {
  const root = await ensureUserExpertFolders(userId);
  const role = ONBOARDING_ROLES[roleKey] || null;
  const title = options.title || role?.label || roleKey || "Эксперт";
  const scenarioId = slugifyScenario(options.scenarioId || roleKey || title);
  const dir = join(root, "scenarios", scenarioId);
  await fs.mkdir(dir, { recursive: true });
  const config = {
    id: scenarioId,
    role_key: roleKey,
    label: title,
    expert_name: options.expertName || "",
    system_prompt: options.systemPrompt || role?.prompt || `Ты эксперт в роли "${title}". Пиши профессионально, живо и полезно для соцсетей.`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(join(dir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
  return config;
}

function safeStoredName(originalName, prefix = "item") {
  const clean = basename(String(originalName || prefix)).replace(/[^\wа-яА-ЯёЁ.\- ]/g, "_").slice(0, 90);
  return `${Date.now()}_${clean || prefix}`;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]);
    } catch {
      return fallback;
    }
  }
}

function compactForAnalysis(text, maxChars = 10000) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxChars);
}

function fallbackQualityScore(text, category = "knowledge") {
  const value = String(text || "").trim();
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const hasUrlOnly = /^https?:\/\/\S+$/i.test(value);
  const paragraphCount = value.split(/\n{2,}/).filter((p) => p.trim().length > 40).length;
  const cyrillicShare = value ? (value.match(/[А-Яа-яЁё]/g) || []).length / value.length : 0;
  let score = "weak";
  if (wordCount >= 180 && cyrillicShare > 0.35 && (paragraphCount >= 2 || category === "knowledge")) score = "good";
  else if (wordCount >= 60 && cyrillicShare > 0.25) score = "medium";
  return {
    score,
    style_learning: category === "style" ? score : (paragraphCount >= 2 ? "medium" : "weak"),
    expert_learning: category === "knowledge" ? score : (wordCount >= 120 ? "medium" : "weak"),
    warnings: [
      ...(hasUrlOnly ? ["Only a link was uploaded; add copied post/article text for stronger learning."] : []),
      ...(wordCount < 60 ? ["Very little text; the AI has weak evidence to learn from."] : []),
      ...(category === "style" && paragraphCount < 2 ? ["Few paragraph patterns; style rhythm may be guessed."] : []),
    ],
    useful_signals: [],
  };
}

async function updateStoredMetadata(metadata, patch) {
  if (!metadata?.path) return metadata;
  const metaPath = `${metadata.path}.json`;
  const current = await readJson(metaPath, metadata);
  const updated = {
    ...(current || metadata),
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(metaPath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function storeOnboardingFile(userId, category, originalName, buffer, meta = {}) {
  const root = await ensureUserExpertFolders(userId);
  const folderByCategory = {
    knowledge: "knowledge/pending",
    style: "style/pending",
    avatar: "avatar",
    voice: "voice",
  };
  const folder = folderByCategory[category] || "knowledge/pending";
  const storedName = safeStoredName(originalName, category);
  const path = join(root, folder, storedName);
  await fs.writeFile(path, buffer);
  const metadata = {
    original_name: originalName || storedName,
    stored_name: storedName,
    category,
    path,
    size: buffer.length,
    ...meta,
    created_at: new Date().toISOString(),
  };
  await fs.writeFile(`${path}.json`, JSON.stringify(metadata, null, 2), "utf-8");
  return metadata;
}

export async function storeOnboardingText(userId, category, text, meta = {}) {
  const name = safeStoredName(`${category}.txt`, category);
  return storeOnboardingFile(userId, category, name, Buffer.from(text, "utf-8"), {
    content_type: "text/plain",
    ...meta,
  });
}

async function listCategoryFiles(userId, category) {
  const root = await ensureUserExpertFolders(userId);
  const folderByCategory = {
    knowledge: "knowledge/pending",
    style: "style/pending",
    avatar: "avatar",
    voice: "voice",
  };
  const dir = join(root, folderByCategory[category]);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name));
}

async function extractText(path) {
  const extension = extname(path).toLowerCase();
  try {
    if (extension === ".txt" || extension === ".md") {
      return await fs.readFile(path, "utf-8");
    }
    const buffer = await fs.readFile(path);
    if (extension === ".pdf") {
      const parsed = await pdfParse(buffer);
      return parsed.text || "";
    }
    if (extension === ".docx") {
      const parsed = await mammoth.extractRawText({ buffer });
      return parsed.value || "";
    }
  } catch (error) {
    console.warn(`[expert-onboarding] failed to extract ${path}: ${error.message}`);
  }
  return "";
}

export async function analyzeOnboardingMaterial(openai, userId, metadata, category = metadata?.category) {
  if (!metadata?.path || !["knowledge", "style"].includes(category)) return null;
  const rawText = compactForAnalysis(await extractText(metadata.path), 9000);
  const fallback = fallbackQualityScore(rawText, category);
  if (!rawText) {
    const emptyResult = {
      ...fallback,
      score: "weak",
      warnings: ["Could not extract readable text from this material."],
      source_name: metadata.original_name || basename(metadata.path),
      analyzed_at: new Date().toISOString(),
    };
    await updateStoredMetadata(metadata, { quality: emptyResult });
    return emptyResult;
  }

  let quality = null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      max_tokens: 420,
      messages: [
        {
          role: "system",
          content: [
            "You score uploaded expert materials for a Russian AI-content onboarding flow.",
            "Return strict JSON only. Scores must be one of: good, medium, weak.",
            "style_learning means usefulness for learning author voice. expert_learning means usefulness for learning expertise/worldview.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            category,
            source_name: metadata.original_name || basename(metadata.path),
            text: rawText,
            required_json_shape: {
              score: "good|medium|weak",
              style_learning: "good|medium|weak",
              expert_learning: "good|medium|weak",
              warnings: ["short practical warning if weak/medium"],
              useful_signals: ["what can be learned from this material"],
            },
          }),
        },
      ],
    });
    quality = safeJsonParse(completion.choices[0].message.content, null);
  } catch (error) {
    console.warn(`[expert-onboarding] material analysis failed: ${error.message}`);
  }

  const result = {
    ...fallback,
    ...(quality || {}),
    score: ["good", "medium", "weak"].includes(quality?.score) ? quality.score : fallback.score,
    style_learning: ["good", "medium", "weak"].includes(quality?.style_learning) ? quality.style_learning : fallback.style_learning,
    expert_learning: ["good", "medium", "weak"].includes(quality?.expert_learning) ? quality.expert_learning : fallback.expert_learning,
    warnings: Array.isArray(quality?.warnings) ? quality.warnings.slice(0, 4) : fallback.warnings,
    useful_signals: Array.isArray(quality?.useful_signals) ? quality.useful_signals.slice(0, 5) : fallback.useful_signals,
    source_name: metadata.original_name || basename(metadata.path),
    analyzed_at: new Date().toISOString(),
  };
  await updateStoredMetadata(metadata, { quality: result });
  return result;
}

function buildStyleExtractionPrompt() {
  return [
    "Ты извлекаешь стиль и экспертную идентичность нового автора для генерации постов.",
    "Работай только по материалам. Не выдумывай биографию, дипломы, опыт, кейсы и личные факты.",
    "Нужно добиться эффекта: пользователь читает первый пост и думает «это правда похоже на меня».",
    "Извлеки: tone, cadence, emotional_style, paragraph_rhythm, recurring_phrases, cta_style, forbidden_phrases, opening_styles.",
    "Также оцени материалы good/medium/weak отдельно для style learning и expert learning.",
    "Верни Markdown с заголовками строго: PERSONA, WORLDVIEW, STYLE_GUIDANCE, STYLE_EXAMPLES, MATERIAL_QUALITY.",
  ].join("\n");
}

function extractSection(raw, name, nextNames = []) {
  const names = nextNames.length ? nextNames.join("|") : "$";
  const regex = new RegExp(`${name}([\\s\\S]*?)(?:${names}|$)`, "i");
  return raw.match(regex)?.[1]?.trim() || "";
}

export async function buildUserScenarioContext(userId, scenarioId, topic = "") {
  const [profile, scenario] = await Promise.all([
    loadUserProfile(userId),
    loadUserScenario(userId, scenarioId),
  ]);
  if (!profile && !scenario) return null;

  const root = getUserRoot(userId);
  const draftFiles = [
    join(root, "profile", "persona.md"),
    join(root, "profile", "worldview.md"),
    join(root, "profile", "style_guidance.md"),
    join(root, "profile", "style_examples.md"),
  ];
  const draftText = [];
  for (const file of draftFiles) {
    const text = await fs.readFile(file, "utf-8").catch(() => "");
    if (text.trim()) draftText.push(text.trim());
  }

  const knowledgeFiles = await listCategoryFiles(userId, "knowledge");
  const knowledgeText = [];
  for (const file of knowledgeFiles.slice(0, 5)) {
    const text = (await extractText(file)).trim();
    if (text) knowledgeText.push(`Источник ${basename(file)}:\n${text.slice(0, 2500)}`);
  }

  return {
    profile,
    scenario,
    context: [
      profile ? `Эксперт: ${profile.expert_name || scenario?.expert_name || ""}` : "",
      scenario ? `Сценарий: ${scenario.label}\n${scenario.system_prompt}` : "",
      draftText.join("\n\n"),
      knowledgeText.join("\n\n"),
      topic ? `Тема запроса: ${topic}` : "",
    ].filter(Boolean).join("\n\n"),
  };
}

async function generatePersonaDraftsLegacy(openai, userId) {
  const root = await ensureUserExpertFolders(userId);
  const profile = await loadUserProfile(userId);
  const scenarios = await listUserScenarios(userId);
  const knowledgeFiles = await listCategoryFiles(userId, "knowledge");
  const styleFiles = await listCategoryFiles(userId, "style");

  const snippets = [];
  for (const file of [...knowledgeFiles.slice(0, 4), ...styleFiles.slice(0, 4)]) {
    const text = (await extractText(file)).trim();
    if (text) snippets.push(`Файл ${basename(file)}:\n${text.slice(0, 2200)}`);
  }

  const base = [
    `Имя эксперта: ${profile?.expert_name || ""}`,
    `Сценарии: ${scenarios.map((s) => s.label).join(", ") || "не указаны"}`,
    snippets.join("\n\n") || "Пользователь пока загрузил мало текстовых материалов. Сделай осторожный черновик по имени и роли.",
  ].join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.45,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: "Ты помогаешь собрать AI-персону эксперта для генерации контента. Пиши по-русски, кратко, прикладно, без выдуманных фактов.",
      },
      {
        role: "user",
        content: `На основе данных создай 3 блока в Markdown с заголовками строго: PERSONA, WORLDVIEW, STYLE_EXAMPLES.\n\n${base}`,
      },
    ],
  });

  const raw = completion.choices[0].message.content.trim();
  const sections = {
    persona: raw.match(/PERSONA([\s\S]*?)(WORLDVIEW|$)/i)?.[1]?.trim() || raw,
    worldview: raw.match(/WORLDVIEW([\s\S]*?)(STYLE_EXAMPLES|$)/i)?.[1]?.trim() || "",
    style_examples: raw.match(/STYLE_EXAMPLES([\s\S]*)/i)?.[1]?.trim() || "",
  };

  await fs.writeFile(join(root, "profile", "persona.md"), sections.persona, "utf-8");
  await fs.writeFile(join(root, "profile", "worldview.md"), sections.worldview, "utf-8");
  await fs.writeFile(join(root, "profile", "style_examples.md"), sections.style_examples, "utf-8");
  return { root, raw, sections };
}

export async function generatePersonaDrafts(openai, userId) {
  const root = await ensureUserExpertFolders(userId);
  const profile = await loadUserProfile(userId);
  const scenarios = await listUserScenarios(userId);
  const knowledgeFiles = await listCategoryFiles(userId, "knowledge");
  const styleFiles = await listCategoryFiles(userId, "style");

  const snippets = [];
  for (const file of [...knowledgeFiles.slice(0, 5), ...styleFiles.slice(0, 6)]) {
    const text = compactForAnalysis(await extractText(file), 3200);
    const meta = await readJson(`${file}.json`, {});
    const quality = meta?.quality ? `\nQuality: ${JSON.stringify(meta.quality)}` : "";
    if (text) snippets.push(`File ${basename(file)} [${meta?.category || "material"}]${quality}:\n${text}`);
  }

  const base = [
    `Expert name: ${profile?.expert_name || ""}`,
    `Scenarios: ${scenarios.map((s) => s.label).join(", ") || "not specified"}`,
    snippets.join("\n\n") || "The user has uploaded very little text. Make a cautious draft from name and role only; mark material quality as weak.",
  ].join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    max_tokens: 1700,
    messages: [
      { role: "system", content: buildStyleExtractionPrompt() },
      { role: "user", content: `Создай прикладные черновики на русском для генерации контента.\n\n${base}` },
    ],
  });

  const raw = completion.choices[0].message.content.trim();
  const sections = {
    persona: extractSection(raw, "PERSONA", ["WORLDVIEW", "STYLE_GUIDANCE", "STYLE_EXAMPLES", "MATERIAL_QUALITY"]) || raw,
    worldview: extractSection(raw, "WORLDVIEW", ["STYLE_GUIDANCE", "STYLE_EXAMPLES", "MATERIAL_QUALITY"]),
    style_guidance: extractSection(raw, "STYLE_GUIDANCE", ["STYLE_EXAMPLES", "MATERIAL_QUALITY"]),
    style_examples: extractSection(raw, "STYLE_EXAMPLES", ["MATERIAL_QUALITY"]),
    material_quality: extractSection(raw, "MATERIAL_QUALITY"),
  };

  await fs.writeFile(join(root, "profile", "persona.md"), sections.persona, "utf-8");
  await fs.writeFile(join(root, "profile", "worldview.md"), sections.worldview, "utf-8");
  await fs.writeFile(join(root, "profile", "style_guidance.md"), sections.style_guidance, "utf-8");
  await fs.writeFile(join(root, "profile", "style_examples.md"), sections.style_examples, "utf-8");
  await fs.writeFile(join(root, "profile", "material_quality.md"), sections.material_quality, "utf-8");
  return { root, raw, sections };
}

export async function getOnboardingInventory(userId) {
  const [knowledge, style, avatar, voice, scenarios, profile] = await Promise.all([
    listCategoryFiles(userId, "knowledge"),
    listCategoryFiles(userId, "style"),
    listCategoryFiles(userId, "avatar"),
    listCategoryFiles(userId, "voice"),
    listUserScenarios(userId),
    loadUserProfile(userId),
  ]);
  return {
    profile,
    scenarios,
    counts: {
      knowledge: knowledge.length,
      style: style.length,
      avatar: avatar.length,
      voice: voice.length,
    },
  };
}
