import "dotenv/config";
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
const warnings = [];

if (betaMode && process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN === process.env.TELEGRAM_BETA_TOKEN) {
  missingRequired.push("TELEGRAM_BETA_TOKEN must differ from TELEGRAM_TOKEN in beta mode");
}
if ((process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) && process.env.MINIAPP_DEV_AUTH !== "false") {
  warnings.push("MINIAPP_DEV_AUTH should be false in production/Railway.");
}
if (process.env.TELEGRAM_STARS_ENABLED === "true" && process.env.PAYMENT_TEST_MODE === "true") {
  warnings.push("PAYMENT_TEST_MODE=true while Telegram Stars checkout is enabled.");
}
if (process.env.TELEGRAM_STARS_ENABLED === "true" && !process.env.TELEGRAM_BOT_USERNAME) {
  warnings.push("TELEGRAM_BOT_USERNAME missing; Mini App Telegram handoff links are degraded.");
}
if (process.env.TELEGRAM_WEBHOOK_URL && !/^https:\/\//i.test(process.env.TELEGRAM_WEBHOOK_URL)) {
  missingRequired.push("TELEGRAM_WEBHOOK_URL must be HTTPS when configured");
}
const miniappUrl = process.env.MINIAPP_PUBLIC_URL || process.env.TELEGRAM_MINIAPP_URL || "";
if ((process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) && miniappUrl && !/^https:\/\//i.test(miniappUrl)) {
  missingRequired.push("MINIAPP_PUBLIC_URL/TELEGRAM_MINIAPP_URL must be HTTPS in production/Railway");
}
for (const name of ["PLAN_START_STARS_PRICE", "PLAN_PRO_STARS_PRICE"]) {
  if (process.env[name] && (!Number.isFinite(Number(process.env[name])) || Number(process.env[name]) <= 0)) {
    missingRequired.push(`${name} must be a positive Stars amount`);
  }
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
  mainBotEnabled: process.env.TELEGRAM_POLLING !== "false" && Boolean(process.env[betaMode ? "TELEGRAM_BETA_TOKEN" : "TELEGRAM_TOKEN"]),
  mainTelegramTokenPresent: Boolean(process.env.TELEGRAM_TOKEN),
  telegramBetaTokenPresent: Boolean(process.env.TELEGRAM_BETA_TOKEN),
  leadsBotEnabled: process.env.START_LEADS_BOT === "true" && Boolean(process.env.LEADS_BOT_TOKEN),
  leadsBotRequested: process.env.START_LEADS_BOT === "true",
  leadsBotTokenPresent: Boolean(process.env.LEADS_BOT_TOKEN),
  webhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL),
  miniappConfigured: Boolean(miniappUrl),
  starsCheckout: process.env.TELEGRAM_STARS_ENABLED === "true",
  paymentTestMode: process.env.PAYMENT_TEST_MODE === "true" || process.env.TELEGRAM_STARS_TEST_MODE === "true",
  required,
  missingRequired,
  missingOptional: missingOptional.map(([name, feature]) => ({ name, feature })),
  missingFiles,
  warnings,
};

console.log(JSON.stringify(status, null, 2));

if (!status.ok) {
  process.exitCode = 1;
}
