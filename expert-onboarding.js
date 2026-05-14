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

export async function generatePersonaDrafts(openai, userId) {
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
