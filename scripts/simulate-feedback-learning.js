import path from "path";
import {
  buildFeedbackMemory,
  loadGenerationRuns,
  writeFeedbackMemory,
} from "./expert-feedback-memory.js";
import { writeFeedbackReports } from "./analyze-feedback-memory.js";

const ROOT = process.cwd();
const EXPERT = "dinara";

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function firstPattern(patterns = []) {
  return patterns[0] || {
    pattern: "none",
    usage_count: 0,
    average_score: 0,
    recent_trend: "stable",
  };
}

async function main() {
  const runs = await loadGenerationRuns({ root: ROOT, expertId: EXPERT });
  const memory = buildFeedbackMemory(runs);
  const memoryFiles = await writeFeedbackMemory(memory, { root: ROOT, expertId: EXPERT });
  const reports = await writeFeedbackReports(memory, { root: ROOT, expertId: EXPERT });

  const learnedPattern = firstPattern(memory.successful_patterns.patterns);
  const weakPattern = firstPattern(memory.weak_patterns.patterns);
  const styleWarning = memory.style_feedback.style_drift_warnings[0] || {
    run_id: "none",
    intent: "none",
    warnings: ["none"],
  };
  const retrievalInsight = memory.retrieval_feedback.insights[0] || "none";

  console.log(`Generation runs loaded: ${runs.length}`);
  console.log("\nFeedback memory files:");
  for (const file of Object.values(memoryFiles)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nGenerated reports:");
  for (const file of Object.values(reports)) {
    console.log(`- ${relative(file)}`);
  }

  console.log("\nExample learned pattern:");
  console.log(JSON.stringify(learnedPattern, null, 2));

  console.log("\nExample weak pattern:");
  console.log(JSON.stringify(weakPattern, null, 2));

  console.log("\nExample style drift warning:");
  console.log(JSON.stringify(styleWarning, null, 2));

  console.log("\nExample retrieval learning insight:");
  console.log(retrievalInsight);

  console.log("\nRecommendations:");
  for (const recommendation of memory.recommendations) {
    console.log(`- [${recommendation.priority}] ${recommendation.type}: ${recommendation.recommendation}`);
  }

  console.log("\nWarnings/errors:");
  const warningCount = memory.generation_feedback_log.reduce(
    (count, signal) => count + signal.warnings.length + signal.style_drift_warnings.length,
    0,
  );
  console.log(warningCount ? `Detected recommendation warnings: ${warningCount}` : "none");

  console.log("\nLocal-only confirmation: no deploy, no production mutation, no FAISS/index mutation, no ingest/promote, no live Telegram runtime changes, no OpenAI fine-tuning calls, no automatic prompt rewriting, no automatic retrieval mutation.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
