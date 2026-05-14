import { access, mkdir, writeFile, rm } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const mode = (process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
const betaMode = ["beta", "staging", "railway-beta"].includes(mode);
const dataRoot = process.env.RUNTIME_DATA_ROOT || (betaMode ? join(ROOT, "runtime-data", "beta") : ROOT);

const required = [
  betaMode ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN",
  "OPENAI_API_KEY",
];

const optional = [
  ["SUPABASE_URL", "vector retrieval"],
  ["SUPABASE_ANON_KEY", "vector retrieval"],
  ["FISH_AUDIO_API_KEY", "voice generation"],
  ["FISH_AUDIO_VOICE_ID", "voice generation"],
  ["FALAI_KEY", "photo/video generation"],
  ["CLOUDINARY_CLOUD", "video audio hosting"],
  ["CLOUDINARY_API_KEY", "video audio hosting"],
  ["CLOUDINARY_API_SECRET", "video audio hosting"],
];

const missingRequired = required.filter((name) => !process.env[name]);
const missingOptional = optional.filter(([name]) => !process.env[name]);

if (betaMode && process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN === process.env.TELEGRAM_BETA_TOKEN) {
  missingRequired.push("TELEGRAM_BETA_TOKEN must differ from TELEGRAM_TOKEN in beta mode");
}

await mkdir(dataRoot, { recursive: true });
const probe = join(dataRoot, ".railway-write-probe");
await writeFile(probe, new Date().toISOString(), "utf-8");
await rm(probe, { force: true });

const expectedFiles = [
  "package.json",
  "index.js",
  "start.js",
  "articles.production.json",
];

const missingFiles = [];
for (const file of expectedFiles) {
  try {
    await access(join(ROOT, file));
  } catch {
    missingFiles.push(file);
  }
}

const status = {
  ok: missingRequired.length === 0 && missingFiles.length === 0,
  runtimeMode: mode,
  betaMode,
  dataRoot,
  polling: process.env.TELEGRAM_POLLING !== "false",
  leadsBot: process.env.START_LEADS_BOT === "true",
  required,
  missingRequired,
  missingOptional: missingOptional.map(([name, feature]) => ({ name, feature })),
  missingFiles,
};

console.log(JSON.stringify(status, null, 2));

if (!status.ok) {
  process.exitCode = 1;
}
