import { promises as fs } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_PATH = join(__dirname, "data", "users.json");
const INTAKE_ROOT = join(__dirname, "knowledge_intake");
const SESSIONS_DIR = join(INTAKE_ROOT, "sessions");

const TARGET_LABELS = {
  psychologist: "Психолог Динара",
  sexologist: "Сексолог Динара",
};

function nowIso() {
  return new Date().toISOString();
}

function safeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeName(name = "file") {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";
}

function localPathForManifest(path) {
  return relative(__dirname, path).replace(/\\/g, "/");
}

async function ensureBaseDirs() {
  await fs.mkdir(join(__dirname, "data"), { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  for (const target of Object.keys(TARGET_LABELS)) {
    await fs.mkdir(join(INTAKE_ROOT, target, "incoming"), { recursive: true });
  }
}

export function getTargetLabel(targetKb) {
  return TARGET_LABELS[targetKb] || targetKb;
}

export async function loadUsers() {
  await ensureBaseDirs();
  try {
    return JSON.parse(await fs.readFile(USERS_PATH, "utf-8"));
  } catch {
    const initial = { admins: [], users: {} };
    await fs.writeFile(USERS_PATH, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
}

export async function getAccessRole(userId) {
  const users = await loadUsers();
  const id = String(userId);
  if ((users.admins || []).map(String).includes(id)) return "admin";
  return users.users?.[id]?.role || "demo";
}

export async function canUseKnowledgeIntake(userId) {
  const role = await getAccessRole(userId);
  return role === "admin" || role === "full_access";
}

function sessionPath(sessionId) {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

async function readSession(sessionId) {
  return JSON.parse(await fs.readFile(sessionPath(sessionId), "utf-8"));
}

async function writeSession(session) {
  await ensureBaseDirs();
  await fs.writeFile(sessionPath(session.session_id), JSON.stringify(session, null, 2), "utf-8");
}

export async function createIntakeSession(userId, targetKb) {
  if (!TARGET_LABELS[targetKb]) throw new Error(`Unknown target knowledge base: ${targetKb}`);
  const session = {
    session_id: safeId("ki"),
    user_id: String(userId),
    target_kb: targetKb,
    status: "collecting",
    created_at: nowIso(),
    items: [],
  };
  await writeSession(session);
  await fs.mkdir(getIncomingDir(session), { recursive: true });
  return session;
}

export function getIncomingDir(session) {
  return join(INTAKE_ROOT, session.target_kb, "incoming", session.session_id);
}

export async function getActiveIntakeSession(userId) {
  await ensureBaseDirs();
  const files = await fs.readdir(SESSIONS_DIR).catch(() => []);
  const sessions = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const session = JSON.parse(await fs.readFile(join(SESSIONS_DIR, file), "utf-8"));
      if (
        String(session.user_id) === String(userId) &&
        ["collecting", "awaiting_confirmation"].includes(session.status)
      ) {
        sessions.push(session);
      }
    } catch {
      // Ignore malformed draft manifests instead of blocking the bot.
    }
  }
  sessions.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return sessions[0] || null;
}

async function addItem(session, item) {
  const current = await readSession(session.session_id);
  if (current.status !== "collecting") {
    throw new Error(`Session ${current.session_id} is not collecting.`);
  }
  current.items.push(item);
  await writeSession(current);
  return current;
}

export async function addFileItem(session, originalName, buffer) {
  const itemId = safeId("item");
  const fileName = `${itemId}_${sanitizeName(originalName)}`;
  const dir = getIncomingDir(session);
  await fs.mkdir(dir, { recursive: true });
  const localPath = join(dir, fileName);
  await fs.writeFile(localPath, buffer);
  const item = {
    item_id: itemId,
    type: "file",
    original_name: originalName || fileName,
    local_path: localPathForManifest(localPath),
    status: "received",
    quality_status: "not_processed",
    created_at: nowIso(),
  };
  return addItem(session, item);
}

export async function addUrlItem(session, url) {
  const itemId = safeId("item");
  const dir = getIncomingDir(session);
  await fs.mkdir(dir, { recursive: true });
  const localPath = join(dir, `${itemId}.url.txt`);
  await fs.writeFile(localPath, url, "utf-8");
  const item = {
    item_id: itemId,
    type: "url",
    original_name: url,
    local_path: localPathForManifest(localPath),
    status: "received",
    quality_status: "not_processed",
    created_at: nowIso(),
  };
  return addItem(session, item);
}

export async function addTextItem(session, text) {
  const itemId = safeId("item");
  const dir = getIncomingDir(session);
  await fs.mkdir(dir, { recursive: true });
  const localPath = join(dir, `${itemId}.note.txt`);
  await fs.writeFile(localPath, text, "utf-8");
  const item = {
    item_id: itemId,
    type: "text",
    original_name: "telegram_note.txt",
    local_path: localPathForManifest(localPath),
    status: "received",
    quality_status: "not_processed",
    created_at: nowIso(),
  };
  return addItem(session, item);
}

export async function setSessionStatus(sessionId, status) {
  const session = await readSession(sessionId);
  session.status = status;
  session.updated_at = nowIso();
  await writeSession(session);
  return session;
}

export function summarizeSession(session) {
  const counts = { file: 0, url: 0, text: 0 };
  for (const item of session.items || []) {
    if (counts[item.type] !== undefined) counts[item.type] += 1;
  }
  return {
    targetLabel: getTargetLabel(session.target_kb),
    fileCount: counts.file,
    urlCount: counts.url,
    textCount: counts.text,
    items: session.items || [],
  };
}

export function isUrlText(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}
