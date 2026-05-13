import { promises as fs } from "fs";
import path from "path";

const EXPECTED_DIRS = [
  "knowledge_sources/website_vercel",
  "knowledge_sources/b17_articles",
  "knowledge_sources/telegram_channel",
  "author_voice/raw_samples",
  "reports/onboarding",
  "reports/batch_reports",
  "reports/feedback_reports",
];

function parseArgs(argv) {
  const args = { expert: "dinara" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--expert") args.expert = argv[++i] || args.expert;
  }
  return args;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, root = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, root));
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      files.push({
        path: path.relative(root, fullPath).replace(/\\/g, "/"),
        bytes: stat.size,
      });
    }
  }
  return files;
}

async function inspectFolder(expertDir, relativePath) {
  const absolutePath = path.join(expertDir, relativePath);
  if (!await exists(absolutePath)) {
    return {
      path: relativePath,
      exists: false,
      empty: null,
      file_count: 0,
      files: [],
    };
  }

  const files = await listFiles(absolutePath);
  return {
    path: relativePath,
    exists: true,
    empty: files.length === 0,
    file_count: files.length,
    files,
  };
}

function renderMarkdown(report) {
  const folderLines = report.folders.map((folder) => {
    if (!folder.exists) return `- ${folder.path}: missing`;
    return `- ${folder.path}: ${folder.empty ? "empty" : "non-empty"} (${folder.file_count} files)`;
  }).join("\n");

  const sourceLines = report.sources.map((source) => {
    if (!source.exists) return `- ${source.path}: missing`;
    return `- ${source.path}: ${source.empty ? "empty" : "non-empty"} (${source.file_count} files)`;
  }).join("\n");

  const warningLines = report.warnings.length
    ? report.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- none";

  return `# Expert onboarding inventory: ${report.expert}

Generated: ${report.generated_at}

Profile: ${report.profile.exists ? "present" : "missing"}

## Source Folders

${sourceLines}

## Expected Structure

${folderLines}

## Warnings

${warningLines}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const expertDir = path.join(root, "expert_profiles", args.expert);
  const onboardingDir = path.join(expertDir, "reports", "onboarding");
  await fs.mkdir(onboardingDir, { recursive: true });

  const profilePath = path.join(expertDir, "profile.json");
  const folders = [];
  for (const folder of EXPECTED_DIRS) {
    folders.push(await inspectFolder(expertDir, folder));
  }

  const sources = folders.filter((folder) => folder.path.startsWith("knowledge_sources/"));
  const warnings = [];
  for (const folder of folders) {
    if (!folder.exists) warnings.push(`Missing folder: ${folder.path}`);
    if (folder.exists && folder.empty && folder.path.startsWith("knowledge_sources/")) {
      warnings.push(`Source folder is empty: ${folder.path}`);
    }
  }
  if (!await exists(profilePath)) warnings.push("Missing profile.json");

  const report = {
    expert: args.expert,
    generated_at: new Date().toISOString(),
    expert_dir: expertDir,
    profile: {
      path: path.relative(root, profilePath).replace(/\\/g, "/"),
      exists: await exists(profilePath),
    },
    folders,
    sources,
    missing_folders: folders.filter((folder) => !folder.exists).map((folder) => folder.path),
    empty_folders: folders.filter((folder) => folder.exists && folder.empty).map((folder) => folder.path),
    warnings,
    safety: {
      local_only: true,
      network_calls: false,
      production_mutation: false,
      faiss_mutation: false,
      ingestion: false,
      promote: false,
    },
  };

  const fileStamp = stamp();
  const jsonPath = path.join(onboardingDir, `${fileStamp}_inventory_report.json`);
  const mdPath = path.join(onboardingDir, `${fileStamp}_inventory_report.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  await fs.writeFile(mdPath, renderMarkdown(report), "utf-8");

  console.log(`Inventory Markdown: ${mdPath}`);
  console.log(`Inventory JSON: ${jsonPath}`);
  console.log(`Source folders: ${sources.map((source) => `${source.path}=${source.empty ? "empty" : "non-empty"}`).join(", ")}`);
  if (warnings.length) console.log(`Warnings: ${warnings.join("; ")}`);
}

main().catch((err) => {
  console.error(`Expert inventory failed: ${err.message}`);
  process.exit(1);
});
