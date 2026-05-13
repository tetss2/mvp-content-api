import { promises as fs } from "fs";
import path from "path";
import {
  buildAuthorVoiceProfile,
  loadAuthorVoiceSources,
  loadGeneratedOutputs,
  reportsDir,
  scoreAuthorVoiceMatch,
  writeAuthorVoiceProfile,
} from "./expert-author-voice.js";

const ROOT = process.cwd();
const EXPERT = "dinara";
const MIN_SOURCE_WORDS = 200;

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function firstPhrase(profile) {
  return profile.expert_phrases.high_confidence[0]
    || profile.expert_phrases.emotional[0]
    || profile.vocabulary_profile.educational_phrases[0]
    || { value: "none", count: 0 };
}

function tableRows(items, render, fallback) {
  return items?.length ? items.map(render).join("\n") : fallback;
}

function renderScoreRows(scoredOutputs) {
  return tableRows(scoredOutputs, (item) => (
    `| ${item.output.relative_path} | ${item.score.overall_voice_match_score} | ${item.score.tone_similarity} | ${item.score.rhythm_similarity} | ${item.score.vocabulary_similarity} | ${item.score.generic_ai_risk} | ${item.score.recommendations.join("; ")} |`
  ), "| none | 0 | 0 | 0 | 0 | low | none |");
}

function renderAuthorVoiceReport(profile, scoredOutputs) {
  const phrase = firstPhrase(profile);
  return `# Author Voice Report

Generated: ${new Date().toISOString()}

This report is local-only. It does not wire author voice into production prompts, Telegram, fine-tuning, or runtime behavior.

## Sources

- Source files analyzed: ${profile.source_files.length}
- Generated outputs scored: ${scoredOutputs.length}

## Emotional Profile

\`\`\`json
${JSON.stringify(profile.emotional_profile, null, 2)}
\`\`\`

## Example Expert Phrase

\`\`\`json
${JSON.stringify(phrase, null, 2)}
\`\`\`

## Style Similarity Scores

| output | overall | tone | rhythm | vocabulary | generic_ai_risk | recommendations |
| --- | ---: | ---: | ---: | ---: | --- | --- |
${renderScoreRows(scoredOutputs)}

## Recommendation Boundary

Voice recommendations are advisory only. They do not rewrite prompts or mutate production behavior.
`;
}

function renderEmotionalToneReport(profile) {
  return `# Emotional Tone Report

Generated: ${new Date().toISOString()}

## Tone Profile

\`\`\`json
${JSON.stringify(profile.tone_profile, null, 2)}
\`\`\`

## Emotional Profile

\`\`\`json
${JSON.stringify(profile.emotional_profile, null, 2)}
\`\`\`
`;
}

function renderStorytellingProfileReport(profile) {
  return `# Storytelling Profile Report

Generated: ${new Date().toISOString()}

## Storytelling Behavior

\`\`\`json
${JSON.stringify(profile.storytelling_profile, null, 2)}
\`\`\`

## Example Storytelling Pattern

${profile.storytelling_profile.detected_patterns[0] || "none"}
`;
}

function renderVocabularyProfileReport(profile) {
  return `# Vocabulary Profile Report

Generated: ${new Date().toISOString()}

## Expert Phrases

\`\`\`json
${JSON.stringify(profile.expert_phrases, null, 2)}
\`\`\`

## Vocabulary Profile

\`\`\`json
${JSON.stringify(profile.vocabulary_profile, null, 2)}
\`\`\`
`;
}

function renderGenericAiDetectionReport(profile, scoredOutputs) {
  const forbidden = profile.forbidden_generic_ai_phrases.phrases[0] || { phrase: "none" };
  return `# Generic AI Detection Report

Generated: ${new Date().toISOString()}

## Example Forbidden AI Phrase

\`\`\`json
${JSON.stringify(forbidden, null, 2)}
\`\`\`

## Suppression List

\`\`\`json
${JSON.stringify(profile.forbidden_generic_ai_phrases, null, 2)}
\`\`\`

## Generated Output Risk

| output | generic_ai_risk | hits |
| --- | --- | --- |
${tableRows(scoredOutputs, (item) => `| ${item.output.relative_path} | ${item.score.generic_ai_risk} | ${item.score.generic_ai_phrase_hits.join(", ") || "none"} |`, "| none | low | none |")}
`;
}

async function writeVoiceReports(profile, scoredOutputs, { root = ROOT, expertId = EXPERT } = {}) {
  const dir = reportsDir(root, expertId);
  await fs.mkdir(dir, { recursive: true });
  const reports = {
    author_voice_report: path.join(dir, "author_voice_report.md"),
    emotional_tone_report: path.join(dir, "emotional_tone_report.md"),
    storytelling_profile_report: path.join(dir, "storytelling_profile_report.md"),
    vocabulary_profile_report: path.join(dir, "vocabulary_profile_report.md"),
    generic_ai_detection_report: path.join(dir, "generic_ai_detection_report.md"),
  };
  await fs.writeFile(reports.author_voice_report, renderAuthorVoiceReport(profile, scoredOutputs), "utf8");
  await fs.writeFile(reports.emotional_tone_report, renderEmotionalToneReport(profile), "utf8");
  await fs.writeFile(reports.storytelling_profile_report, renderStorytellingProfileReport(profile), "utf8");
  await fs.writeFile(reports.vocabulary_profile_report, renderVocabularyProfileReport(profile), "utf8");
  await fs.writeFile(reports.generic_ai_detection_report, renderGenericAiDetectionReport(profile, scoredOutputs), "utf8");
  return reports;
}

async function main() {
  const sources = await loadAuthorVoiceSources({ root: ROOT, expertId: EXPERT });
  const outputs = await loadGeneratedOutputs({ root: ROOT, expertId: EXPERT });
  const sourceWordCount = sources.reduce((sum, source) => sum + source.content.split(/\s+/).filter(Boolean).length, 0);
  const dedicatedSourcesArePlaceholders = sources.some((source) => /empty_sources|empty_source_folder|No text files found/i.test(source.content));
  const supplementalOutputs = sourceWordCount < MIN_SOURCE_WORDS || dedicatedSourcesArePlaceholders
    ? outputs.map((output) => ({
      ...output,
      relative_path: `${output.relative_path}#supplemental_sandbox_style_sample`,
    }))
    : [];
  const profileSources = [...sources, ...supplementalOutputs];
  const profile = buildAuthorVoiceProfile({ sources: profileSources, expertId: EXPERT });
  profile.source_note = supplementalOutputs.length
    ? "Dedicated author voice sources were sparse; generated sandbox outputs were included as supplemental local style samples."
    : "Dedicated author voice sources were sufficient.";
  const profileFiles = await writeAuthorVoiceProfile(profile, { root: ROOT, expertId: EXPERT });
  const scoredOutputs = outputs.map((output) => ({
    output,
    score: scoreAuthorVoiceMatch(output.content, profile),
  }));
  const reports = await writeVoiceReports(profile, scoredOutputs, { root: ROOT, expertId: EXPERT });

  const phrase = firstPhrase(profile);
  const forbidden = profile.forbidden_generic_ai_phrases.phrases[0] || { phrase: "none" };
  const storyPattern = profile.storytelling_profile.detected_patterns[0] || "none";
  const scoreExample = scoredOutputs[0]?.score || null;

  console.log(`Author voice sources analyzed: ${sources.length}`);
  console.log(`Supplemental sandbox style samples: ${supplementalOutputs.length}`);
  console.log(`Generated outputs scored: ${scoredOutputs.length}`);
  console.log("\nVoice profile files:");
  for (const file of Object.values(profileFiles)) console.log(`- ${relative(file)}`);
  console.log("\nGenerated reports:");
  for (const file of Object.values(reports)) console.log(`- ${relative(file)}`);
  console.log("\nExample emotional profile:");
  console.log(JSON.stringify(profile.emotional_profile, null, 2));
  console.log("\nExample expert phrase:");
  console.log(JSON.stringify(phrase, null, 2));
  console.log("\nExample forbidden AI phrase:");
  console.log(JSON.stringify(forbidden, null, 2));
  console.log("\nExample storytelling pattern:");
  console.log(storyPattern);
  console.log("\nExample style similarity score:");
  console.log(JSON.stringify(scoreExample, null, 2));
  console.log("\nWarnings/errors:");
  console.log(sources.length ? "none" : "no_author_voice_sources_found");
  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram runtime changes, no OpenAI fine-tuning, no automatic prompt rewriting.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {
  renderAuthorVoiceReport,
  renderEmotionalToneReport,
  renderGenericAiDetectionReport,
  renderStorytellingProfileReport,
  renderVocabularyProfileReport,
  writeVoiceReports,
};
