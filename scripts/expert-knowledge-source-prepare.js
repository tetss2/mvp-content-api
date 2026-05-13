import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import {
  SOURCE_TYPES,
  classifySource,
  renderTaxonomySummaryMarkdown,
  taxonomySummary,
} from "./expert-onboarding-intelligence.js";

const SOURCE_FOLDERS = [
  { key: "website_vercel", sourceType: "website_vercel", relativePath: "knowledge_sources/website_vercel", base: "expert", mode: "normalize_text" },
  { key: "b17_articles", sourceType: "b17_article", relativePath: "knowledge_sources/b17_articles", base: "expert", mode: "normalize_text" },
  { key: "telegram_channel", sourceType: "telegram_channel", relativePath: "knowledge_sources/telegram_channel", base: "expert", mode: "normalize_text" },
  { key: "raw_samples", sourceType: "raw_sample", relativePath: "author_voice/raw_samples", base: "expert", mode: "normalize_text" },
  { key: "current_kb_approved", sourceType: "approved_dataset", relativePath: "knowledge_intake/sexologist/approved", base: "root", mode: "existing_prepared", filter: "current_production" },
  { key: "current_kb_high", sourceType: "approved_high_confidence", relativePath: "knowledge_intake/sexologist/approved_high_confidence", base: "root", mode: "existing_prepared", filter: "current_production" },
  { key: "current_kb_medium", sourceType: "approved_medium_confidence", relativePath: "knowledge_intake/sexologist/approved_medium_confidence", base: "root", mode: "existing_prepared", filter: "current_production" },
];

const INVENTORY_DIRS = [
  "expert_profiles/dinara",
  "data",
  "sources",
  "sorted_sources",
  "knowledge_intake/sexologist",
  "cleaned_corpus",
  "kb/sexologist",
  "author_profiles/dinara",
  "knowledge_indexes/sexologist/reports",
];

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".text"]);
const CLEAN_VERSION = "v1";

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

async function listFiles(dir) {
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizeText(text) {
  return text
    .replace(/^\uFEFF/u, "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, "").replace(/[ \t]{2,}/gu, " "))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function cleanedName(sourceFolder, sourcePath) {
  const parsed = path.parse(sourcePath);
  return `${sourceFolder}__${parsed.name}.cleaned.txt`;
}

function metadataName(sourceKey, cleanedPath) {
  return `${sourceKey}__${path.basename(cleanedPath)}.metadata.json`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}

function wordCount(text) {
  return (text.match(/[а-яёa-z0-9-]+/giu) || []).length;
}

function relative(root, target) {
  return path.relative(root, target).replace(/\\/g, "/");
}

function sourcePath(root, expertDir, sourceFolder) {
  return path.join(sourceFolder.base === "root" ? root : expertDir, sourceFolder.relativePath);
}

async function loadCurrentProductionSourceNames(root) {
  const docstorePath = path.join(root, "knowledge_indexes", "sexologist", "production", "current", "docstore.jsonl");
  if (!await exists(docstorePath)) return null;

  const content = await fs.readFile(docstorePath, "utf-8");
  const names = new Set();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const sourceFile = row.metadata?.source_file || row.source_file || row.source;
      if (sourceFile) names.add(path.basename(sourceFile));
    } catch {
      // Keep local reporting robust if a row is malformed.
    }
  }
  return names;
}

function addDuplicate(map, key, filePath) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(filePath);
}

function emptyBreakdown(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

async function buildInventory(root, expertDir, selectedSourcePaths, currentProductionNames) {
  const directories = [];
  const cleanedCandidates = [];
  const rawCandidates = [];
  const duplicateNames = new Map();
  const duplicateHashes = new Map();
  const ignoredByPrepare = [];
  const selected = new Set(selectedSourcePaths);

  for (const dir of INVENTORY_DIRS) {
    const absoluteDir = path.join(root, dir);
    if (!await exists(absoluteDir)) continue;

    const files = await listFiles(absoluteDir);
    const extensions = {};
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase() || "(none)";
      extensions[ext] = (extensions[ext] || 0) + 1;
      addDuplicate(duplicateNames, path.basename(filePath).toLowerCase(), relative(root, filePath));

      if (/\.cleaned\.txt$/i.test(filePath)) {
        const rel = relative(root, filePath);
        cleanedCandidates.push(rel);
        if (!selected.has(rel)) ignoredByPrepare.push(rel);
        try {
          addDuplicate(duplicateHashes, sha256(await fs.readFile(filePath, "utf-8")), rel);
        } catch {
          // Inventory should not fail on one unreadable file.
        }
      } else if (/\.(pdf|docx|txt|md|markdown|text)$/i.test(filePath)) {
        rawCandidates.push(relative(root, filePath));
      }
    }

    directories.push({
      path: dir,
      file_count: files.length,
      extensions,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    directories,
    likely_cleaned_files: cleanedCandidates,
    likely_raw_files: rawCandidates.filter((filePath) => !/\.cleaned\.txt$/i.test(filePath)),
    duplicate_names: [...duplicateNames.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([filename, files]) => ({ filename, files })),
    duplicate_hashes: [...duplicateHashes.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([content_sha256, files]) => ({ content_sha256, files })),
    ignored_by_prepare: ignoredByPrepare,
    recommended_canonical_source_folders: [
      "knowledge_intake/sexologist/approved (filtered to current production docstore names)",
      "knowledge_intake/sexologist/approved_high_confidence (filtered to current production docstore names)",
      "knowledge_intake/sexologist/approved_medium_confidence (filtered to current production docstore names)",
      "expert_profiles/dinara/knowledge_sources/{website_vercel,b17_articles,telegram_channel} for future imported raw text",
      "expert_profiles/dinara/author_voice/raw_samples for future author voice samples",
    ],
    current_production_source_count: currentProductionNames?.size || 0,
  };
}

function renderInventoryMarkdown(inventory) {
  const directoryLines = inventory.directories.map((dir) => {
    const extText = Object.entries(dir.extensions)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(", ");
    return `- ${dir.path}: ${dir.file_count} files (${extText || "no files"})`;
  }).join("\n");

  const list = (items, limit = 80) => {
    if (!items.length) return "- none";
    return items.slice(0, limit).map((item) => `- ${item}`).join("\n")
      + (items.length > limit ? `\n- ...and ${items.length - limit} more` : "");
  };

  const duplicateNames = inventory.duplicate_names.length
    ? inventory.duplicate_names.slice(0, 40).map((item) => `- ${item.filename}: ${item.files.join("; ")}`).join("\n")
    : "- none";
  const duplicateHashes = inventory.duplicate_hashes.length
    ? inventory.duplicate_hashes.slice(0, 40).map((item) => `- ${item.content_sha256}: ${item.files.join("; ")}`).join("\n")
    : "- none";

  return `# Dinara Source Path Inventory

Generated: ${inventory.generated_at}

## Discovered Directories

${directoryLines}

## Likely Cleaned Files

${list(inventory.likely_cleaned_files)}

## Likely Raw Files

${list(inventory.likely_raw_files)}

## Duplicate-Looking Files By Filename

${duplicateNames}

## Duplicate-Looking Files By Content Hash

${duplicateHashes}

## Currently Ignored By Prepare Script

${list(inventory.ignored_by_prepare)}

## Recommended Canonical Source Folders

${inventory.recommended_canonical_source_folders.map((item) => `- ${item}`).join("\n")}

Current production source count detected from docstore: ${inventory.current_production_source_count}
`;
}

async function writeInventoryReport(root, expertDir, onboardingDir, selectedSourcePaths, currentProductionNames) {
  const inventory = await buildInventory(root, expertDir, selectedSourcePaths, currentProductionNames);
  const inventoryPath = path.join(onboardingDir, `${stamp()}_source_path_inventory.md`);
  await fs.writeFile(inventoryPath, renderInventoryMarkdown(inventory), "utf-8");
  return { inventory, inventoryPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const expertDir = path.join(root, "expert_profiles", args.expert);
  const sourceRoot = path.join(expertDir, "knowledge_sources");
  const cleanedRoot = path.join(sourceRoot, "cleaned");
  const metadataRoot = path.join(cleanedRoot, "_metadata");
  const onboardingDir = path.join(expertDir, "reports", "onboarding");
  await fs.mkdir(cleanedRoot, { recursive: true });
  await fs.mkdir(metadataRoot, { recursive: true });
  await fs.mkdir(onboardingDir, { recursive: true });

  const currentProductionNames = await loadCurrentProductionSourceNames(root);
  const files = [];
  const warnings = [];
  const sourceFolders = [];
  const unsupportedFiles = [];
  const ignoredFiles = [];
  const hashOwners = new Map();
  const duplicateHashes = new Map();
  const sourceTypeBreakdown = emptyBreakdown(SOURCE_TYPES);
  const selectedSourcePaths = [];
  const cleanedAt = new Date().toISOString();
  let totalFilesScanned = 0;
  let metadataFilesCreated = 0;

  for (const sourceFolder of SOURCE_FOLDERS) {
    const folderPath = sourcePath(root, expertDir, sourceFolder);
    const folderExists = await exists(folderPath);
    const allFiles = folderExists ? await listFiles(folderPath) : [];
    totalFilesScanned += allFiles.length;
    const textFiles = allFiles.filter((filePath) => TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    const skippedFiles = allFiles.filter((filePath) => !TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    const includedTextFiles = textFiles.filter((filePath) => {
      if (sourceFolder.filter !== "current_production") return true;
      return currentProductionNames?.has(path.basename(filePath));
    });
    const ignoredTextFiles = textFiles.filter((filePath) => !includedTextFiles.includes(filePath));

    sourceFolders.push({
      source_folder: sourceFolder.relativePath,
      source_type: sourceFolder.sourceType,
      mode: sourceFolder.mode,
      exists: folderExists,
      file_count: allFiles.length,
      text_file_count: textFiles.length,
      included_text_file_count: includedTextFiles.length,
      ignored_text_file_count: ignoredTextFiles.length,
      unsupported_file_count: skippedFiles.length,
      empty: allFiles.length === 0,
    });

    if (!folderExists) warnings.push(`Missing source folder: ${sourceFolder.relativePath}`);
    if (folderExists && allFiles.length === 0) warnings.push(`Source folder is empty: ${sourceFolder.relativePath}`);

    for (const filePath of ignoredTextFiles) {
      const ignored = {
        source_type: sourceFolder.sourceType,
        source_path: relative(root, filePath),
        reason: "not_in_current_production_docstore",
      };
      ignoredFiles.push(ignored);
      warnings.push(`Ignored non-production prepared file: ${ignored.source_path}`);
    }

    for (const filePath of skippedFiles) {
      const skipped = {
        source_type: sourceFolder.sourceType,
        source_path: relative(root, filePath),
        extension: path.extname(filePath).toLowerCase() || "(none)",
        reason: "unsupported_format",
      };
      unsupportedFiles.push(skipped);
      warnings.push(`Unsupported format skipped: ${skipped.source_path}`);
    }

    for (const filePath of includedTextFiles) {
      const raw = await fs.readFile(filePath, "utf-8");
      const cleaned = normalizeText(raw);
      const relativeSource = relative(root, filePath);
      const sourceWarnings = [];
      let outputPath = filePath;

      if (sourceFolder.mode === "normalize_text") {
        const relativeWithinFolder = path.relative(folderPath, filePath);
        const outputDir = path.join(cleanedRoot, sourceFolder.key, path.dirname(relativeWithinFolder));
        await fs.mkdir(outputDir, { recursive: true });
        outputPath = path.join(outputDir, cleanedName(sourceFolder.key, filePath));
        await fs.writeFile(outputPath, cleaned ? `${cleaned}\n` : "", "utf-8");
      } else {
        sourceWarnings.push("existing_prepared_file_referenced_without_copy");
      }

      if (!raw.trim()) sourceWarnings.push("source_file_empty");
      if (!cleaned) sourceWarnings.push("cleaned_text_empty");

      const contentHash = sha256(cleaned);
      const cleanedRelativePath = relative(root, outputPath);
      const duplicateContent = hashOwners.has(contentHash);

      if (duplicateContent) {
        const firstOwner = hashOwners.get(contentHash);
        const duplicateEntry = duplicateHashes.get(contentHash) || {
          content_sha256: contentHash,
          first_source_path: firstOwner.source_path,
          duplicate_source_paths: [],
        };
        duplicateEntry.duplicate_source_paths.push(relativeSource);
        duplicateHashes.set(contentHash, duplicateEntry);
        sourceWarnings.push("duplicate_content_hash");
      } else {
        hashOwners.set(contentHash, { source_path: relativeSource, cleaned_path: cleanedRelativePath });
      }

      const intelligence = classifySource({
        sourceFolder,
        sourcePath: relativeSource,
        text: cleaned,
        wordCount: wordCount(cleaned),
        duplicateContent,
      });
      sourceWarnings.push(...intelligence.warnings);
      const combinedWarnings = [...new Set(sourceWarnings)];

      const metadata = {
        expert_id: args.expert,
        source_type: intelligence.source_type,
        confidence_level: intelligence.confidence_level,
        expert_signal_score: intelligence.expert_signal_score,
        content_kind: intelligence.content_kind,
        is_generation_safe: intelligence.is_generation_safe,
        source_path: relativeSource,
        cleaned_path: cleanedRelativePath,
        original_url: null,
        title: null,
        detected_date: null,
        cleaned_at: cleanedAt,
        clean_version: CLEAN_VERSION,
        content_sha256: contentHash,
        char_count: cleaned.length,
        word_count: wordCount(cleaned),
        status: "prepared",
        warnings: combinedWarnings,
        classification: intelligence.classification,
      };
      const metadataPath = path.join(metadataRoot, metadataName(sourceFolder.key, outputPath));
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
      metadataFilesCreated += 1;
      sourceTypeBreakdown[intelligence.source_type] = (sourceTypeBreakdown[intelligence.source_type] || 0) + 1;
      selectedSourcePaths.push(relativeSource);

      files.push({
        source_folder: sourceFolder.relativePath,
        configured_source_type: sourceFolder.sourceType,
        source_type: intelligence.source_type,
        confidence_level: intelligence.confidence_level,
        expert_signal_score: intelligence.expert_signal_score,
        content_kind: intelligence.content_kind,
        is_generation_safe: intelligence.is_generation_safe,
        source_mode: sourceFolder.mode,
        source_path: relativeSource,
        cleaned_path: cleanedRelativePath,
        metadata_path: relative(root, metadataPath),
        content_sha256: contentHash,
        chars_before: raw.length,
        chars_after: cleaned.length,
        word_count: metadata.word_count,
        empty_after_cleaning: cleaned.length === 0,
        warnings: combinedWarnings,
      });
      for (const warning of combinedWarnings) {
        if (warning === "existing_prepared_file_referenced_without_copy") continue;
        warnings.push(`${warning}: ${relativeSource}`);
      }
    }
  }

  const { inventoryPath } = await writeInventoryReport(root, expertDir, onboardingDir, selectedSourcePaths, currentProductionNames);
  const taxonomy = taxonomySummary(files);
  const taxonomyPath = path.join(onboardingDir, `${stamp()}_taxonomy_summary.md`);
  await fs.writeFile(taxonomyPath, renderTaxonomySummaryMarkdown({
    expert: args.expert,
    generatedAt: new Date().toISOString(),
    files,
    taxonomy,
  }), "utf-8");

  const report = {
    expert: args.expert,
    generated_at: new Date().toISOString(),
    mode: "local_text_normalization_and_existing_prepared_provenance",
    clean_version: CLEAN_VERSION,
    source_path_inventory_report: relative(root, inventoryPath),
    taxonomy_summary_report: relative(root, taxonomyPath),
    source_folders: sourceFolders,
    total_files_scanned: totalFilesScanned,
    total_files_prepared: files.length,
    unsupported_files_skipped: unsupportedFiles.length,
    ignored_files_count: ignoredFiles.length,
    duplicate_hashes_detected: duplicateHashes.size,
    metadata_files_created: metadataFilesCreated,
    source_type_breakdown: sourceTypeBreakdown,
    confidence_breakdown: taxonomy.confidence_distribution,
    content_kind_breakdown: taxonomy.content_kind_distribution,
    generation_safety_breakdown: taxonomy.generation_safety,
    low_signal_files: taxonomy.low_signal_files,
    probable_questionnaire_files: taxonomy.probable_questionnaire_files,
    duplicate_boilerplate_files: taxonomy.duplicate_boilerplate_files,
    admin_content_files: taxonomy.admin_content_files,
    unsupported_files: unsupportedFiles,
    ignored_files: ignoredFiles,
    duplicate_hashes: [...duplicateHashes.values()],
    files_processed: files.length,
    files,
    warnings,
    safety: {
      local_only: true,
      network_calls: false,
      openai_calls: false,
      production_mutation: false,
      faiss_mutation: false,
      ingestion: false,
      promote: false,
      copied_existing_prepared_files: false,
    },
  };

  const jsonPath = path.join(onboardingDir, `${stamp()}_source_prepare_report.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Source path inventory Markdown: ${inventoryPath}`);
  console.log(`Taxonomy summary Markdown: ${taxonomyPath}`);
  console.log(`Source prepare JSON: ${jsonPath}`);
  console.log(`Files scanned: ${totalFilesScanned}`);
  console.log(`Files prepared: ${files.length}`);
  console.log(`Metadata files created: ${metadataFilesCreated}`);
  console.log(`Source type breakdown: ${JSON.stringify(sourceTypeBreakdown)}`);
  console.log(`Confidence breakdown: ${JSON.stringify(taxonomy.confidence_distribution)}`);
  console.log(`Content kind breakdown: ${JSON.stringify(taxonomy.content_kind_distribution)}`);
  console.log(`Generation safety: ${JSON.stringify(taxonomy.generation_safety)}`);
  console.log(`Duplicate hashes detected: ${duplicateHashes.size}`);
  console.log(`Ignored files: ${ignoredFiles.length}`);
  console.log(`Source folders: ${sourceFolders.map((source) => `${source.source_folder}=${source.empty ? "empty" : "non-empty"}`).join(", ")}`);
  if (warnings.length) console.log(`Warnings: ${warnings.join("; ")}`);
}

main().catch((err) => {
  console.error(`Expert source preparation failed: ${err.message}`);
  process.exit(1);
});
