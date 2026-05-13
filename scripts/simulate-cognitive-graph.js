import { promises as fs } from "fs";
import path from "path";
import {
  HOOK_FRAMES,
  STORY_TEMPLATES,
  createInitialCognitiveState,
  getTopRelationships,
  observeContentEvent,
  scoreEmotionalOverlap,
  scoreNarrativeProximity,
  scoreTopicDistance,
} from "./expert-cognitive-graph.js";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "cognitive-graph");

const INTENTS = [
  "educational",
  "storytelling",
  "authority",
  "therapeutic",
  "FAQ",
  "soft_sales",
  "engagement",
];

const CTA_ROTATION = [
  "save_share_cta",
  "educational_cta",
  "low_pressure_cta",
  "emotional_cta",
  "trust_cta",
  "soft_cta",
  "dm_cta",
  "consultation_cta",
];

const AUDIENCE_STATES = [
  "cold",
  "warming",
  "engaged",
  "trusting",
  "considering_purchase",
  "returning_reader",
];

const EMOTION_ROTATION = [
  "curiosity",
  "relief",
  "recognition",
  "hope",
  "shame",
  "safety",
  "fear",
  "confidence",
  "hurt",
  "calm",
];

function relative(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

function mdTable(headers, rows) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [headerLine, separator, ...body].join("\n");
}

function pick(items, index) {
  return items[index % items.length];
}

function simulateEventForDay(state, day) {
  const topics = state.topicGraph.nodes;
  const topic = day % 11 === 0
    ? pick(topics.filter((node) => node.cluster === "attachment"), day).label
    : day % 9 === 0
      ? "shame and desire"
      : pick(topics, day + Math.floor(day / 7)).label;

  const directCtaPulse = day % 21 === 0 || day % 34 === 0;
  const ctaType = directCtaPulse ? "consultation_cta" : pick(CTA_ROTATION, day + Math.floor(day / 10));
  const event = {
    day,
    topic,
    intent: pick(INTENTS, day + Math.floor(day / 6)),
    ctaType,
    hookFrame: pick(HOOK_FRAMES, day + Math.floor(day / 15)),
    framing: day % 5 === 0 ? "myth_to_reframe" : day % 4 === 0 ? "pain_to_agency" : "recognition_to_reframe",
    storyTemplate: pick(STORY_TEMPLATES, day + Math.floor(day / 12)),
    emotionalTone: day % 13 === 0 ? "shame" : day % 17 === 0 ? "fear" : pick(EMOTION_ROTATION, day),
    audienceState: pick(AUDIENCE_STATES, Math.floor((day - 1) / 15)),
  };

  return observeContentEvent(state, event);
}

function renderTopicRelationshipReport(state) {
  const relationships = getTopRelationships(state, 12);
  return `# Topic Relationship Report

Generated: ${state.generatedAt}

This report is local-only. It does not call external APIs, mutate indexes, ingest, promote, deploy, publish, or change Telegram runtime behavior.

## Example Topic Graph

${mdTable(
  ["source", "target", "weight", "distance", "narrative_proximity", "emotional_overlap"],
  relationships.map((item) => [
    item.sourceLabel,
    item.targetLabel,
    item.weight,
    item.topicDistance,
    item.narrativeProximity,
    item.emotionalOverlap,
  ]),
)}

## Distance Examples

- relationship anxiety to adult attachment: ${scoreTopicDistance(state, "relationship anxiety", "adult attachment")}
- shame and desire to body sensitivity: ${scoreTopicDistance(state, "shame and desire", "body sensitivity")}
- boundaries in intimacy to trust after conflict: ${scoreTopicDistance(state, "boundaries in intimacy", "trust after conflict")}

## Narrative Proximity Examples

- relationship anxiety to emotional dependency: ${scoreNarrativeProximity(state, "relationship anxiety", "emotional dependency")}
- female sexuality myths to shame and desire: ${scoreNarrativeProximity(state, "female sexuality myths", "shame and desire")}
- trust after conflict to soft communication: ${scoreNarrativeProximity(state, "trust after conflict", "soft communication")}

## Emotional Overlap Examples

- shame and desire to body sensitivity: ${scoreEmotionalOverlap(state, "shame and desire", "body sensitivity")}
- relationship anxiety to emotional dependency: ${scoreEmotionalOverlap(state, "relationship anxiety", "emotional dependency")}
`;
}

function renderNarrativeMemoryReport(state) {
  return `# Narrative Memory Report

Generated: ${state.generatedAt}

## Narrative Arcs

${mdTable(
  ["arc", "stage", "days", "topics", "last_updated"],
  state.narrativeMemory.arcs.map((arc) => [
    arc.title,
    arc.stage,
    arc.contentDays.length,
    arc.primaryTopics.join(", "),
    arc.lastUpdatedDay,
  ]),
)}

## Recurring Motifs

${mdTable(
  ["motif", "count"],
  Object.entries(state.narrativeMemory.recurringMotifs).sort((a, b) => b[1] - a[1]),
)}

## Unresolved Threads

${mdTable(
  ["day", "topic", "question", "status"],
  state.narrativeMemory.unresolvedThreads.slice(-12).map((thread) => [
    thread.day,
    thread.topic,
    thread.question,
    thread.status,
  ]),
)}

## Example Narrative Continuation Recommendation

${state.recommendations.find((item) => item.type === "narrative_continuation")?.recommendation || "No unresolved continuation needed."}
`;
}

function renderAudienceMemoryReport(state) {
  const rows = Object.entries(state.audienceMemory.heardTopics)
    .map(([topic, memory]) => ({
      topic,
      ...memory,
      saturation: state.audienceMemory.topicSaturation[topic],
      novelty: state.audienceMemory.noveltyScores[topic],
      repetitionProbability: state.audienceMemory.repetitionProbability[topic],
    }))
    .sort((a, b) => b.count - a.count);

  const insight = rows.find((row) => row.saturation >= 0.62) || rows[0];
  return `# Audience Memory Report

Generated: ${state.generatedAt}

## Audience Heard Topics

${mdTable(
  ["topic", "count", "last_heard_day", "memory_strength", "saturation", "novelty", "repetition_probability"],
  rows.map((row) => [
    row.topic,
    row.count,
    row.lastHeardDay,
    row.memoryStrength,
    row.saturation,
    row.novelty,
    row.repetitionProbability,
  ]),
)}

## Reinforcement Opportunities

${mdTable(
  ["topic", "memory_strength", "reason"],
  state.audienceMemory.reinforcementOpportunities.slice(0, 8).map((item) => [
    item.topic,
    item.memoryStrength,
    item.reason || `${item.daysSinceSeen} days since seen`,
  ]),
)}

## Example Audience Memory Insight

${insight.topic} has been heard ${insight.count} times. Saturation is ${insight.saturation}, novelty is ${insight.novelty}, and repetition probability is ${insight.repetitionProbability}; the next use should add a new angle or an adjacent callback.
`;
}

function renderSemanticRepetitionReport(state) {
  const warnings = state.repetitionIntelligence.warnings;
  const example = warnings.find((warning) => warning.type === "repeated_concept")
    || warnings.find((warning) => warning.type === "repeated_hook")
    || warnings[0];

  return `# Semantic Repetition Report

Generated: ${state.generatedAt}

## Repeated Concepts

${mdTable(
  ["concept", "count"],
  Object.entries(state.repetitionIntelligence.conceptHistory).sort((a, b) => b[1] - a[1]),
)}

## Repeated Hooks

${mdTable(
  ["hook", "count"],
  Object.entries(state.repetitionIntelligence.hookHistory).sort((a, b) => b[1] - a[1]),
)}

## Warnings

${warnings.length ? mdTable(
    ["day", "type", "severity", "value", "score", "message"],
    warnings.slice(-20).map((warning) => [
      warning.day,
      warning.type,
      warning.severity,
      warning.value,
      warning.score,
      warning.message,
    ]),
  ) : "No semantic repetition warnings detected."}

## Example Semantic Repetition Warning

${example ? example.message : "No warning generated in this run."}
`;
}

function renderTrustAccumulationReport(state) {
  const trajectory = state.trustState.trustTrajectory;
  const authority = state.trustState.authorityTrajectory;
  return `# Trust Accumulation Report

Generated: ${state.generatedAt}

## Trust State

\`\`\`json
${JSON.stringify({
    authorityGrowth: state.trustState.authorityGrowth,
    emotionalTrustGrowth: state.trustState.emotionalTrustGrowth,
    educationalTrust: state.trustState.educationalTrust,
    vulnerabilityTrust: state.trustState.vulnerabilityTrust,
    consistencyTrust: state.trustState.consistencyTrust,
    audienceFamiliarity: state.trustState.audienceFamiliarity,
  }, null, 2)}
\`\`\`

## Example Trust Progression

${mdTable(
  ["day", "trust_score", "topic"],
  trajectory.filter((item) => item.day % 15 === 0 || item.day === 1 || item.day === 90).map((item) => [
    item.day,
    item.score,
    item.topic,
  ]),
)}

## Authority Progression

${mdTable(
  ["day", "authority_score", "domain"],
  authority.filter((item) => item.day % 15 === 0 || item.day === 90).map((item) => [
    item.day,
    item.score,
    item.domain,
  ]),
)}
`;
}

function renderEmotionalProgressionReport(state) {
  const cycles = state.emotionalProgression.cycles;
  const latest = cycles.at(-1);
  return `# Emotional Progression Report

Generated: ${state.generatedAt}

## Emotional Cycles

${mdTable(
  ["day", "emotion", "intensity", "topic"],
  cycles.filter((item) => item.day % 7 === 0 || item.day >= 84).map((item) => [
    item.day,
    item.emotion,
    item.intensity,
    item.topic,
  ]),
)}

## Saturation

\`\`\`json
${JSON.stringify(state.emotionalProgression.audienceEmotionalSaturation, null, 2)}
\`\`\`

## Example Emotional Pacing Insight

Current overload risk is ${state.emotionalProgression.emotionalOverloadRisk}, pacing balance is ${state.emotionalProgression.pacingBalance}, and the latest emotion is ${latest.emotion}. ${state.emotionalProgression.emotionalOverloadRisk > 0.42 ? "Use a calmer educational bridge next." : "The current emotional cadence remains balanced enough for continued depth."}
`;
}

function renderCtaMemoryReport(state) {
  return `# CTA Memory Report

Generated: ${state.generatedAt}

## CTA History Summary

${mdTable(
  ["cta_type", "count"],
  Object.entries(state.repetitionIntelligence.ctaStructureHistory).sort((a, b) => b[1] - a[1]),
)}

## Escalation Pacing

${mdTable(
  ["day", "cta_type", "pressure", "level"],
  state.ctaMemory.escalationPacing.filter((item) => item.day % 10 === 0 || item.pressure >= 0.55).map((item) => [
    item.day,
    item.ctaType,
    item.pressure,
    item.escalationLevel,
  ]),
)}

## Risk

- Consultation pressure accumulation: ${state.ctaMemory.consultationPressureAccumulation}
- CTA desensitization risk: ${state.ctaMemory.ctaDesensitizationRisk}
- Recommendation: ${state.recommendations.find((item) => item.type === "cta_cooldown")?.recommendation || "CTA pressure is acceptable for this simulated window."}
`;
}

function renderRecommendationsReport(state) {
  return `# Cognition Recommendations Report

Generated: ${state.generatedAt}

## Recommendations

${mdTable(
  ["type", "priority", "target", "recommendation"],
  state.recommendations.map((item) => [
    item.type,
    item.priority,
    item.target,
    item.recommendation,
  ]),
)}

## Identity Evolution

\`\`\`json
${JSON.stringify(state.identityEvolution, null, 2)}
\`\`\`

## Concept Reinforcement

\`\`\`json
${JSON.stringify(state.conceptReinforcement, null, 2)}
\`\`\`
`;
}

async function writeReports(state) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reports = {
    "topic_relationship_report.md": renderTopicRelationshipReport(state),
    "narrative_memory_report.md": renderNarrativeMemoryReport(state),
    "audience_memory_report.md": renderAudienceMemoryReport(state),
    "semantic_repetition_report.md": renderSemanticRepetitionReport(state),
    "trust_accumulation_report.md": renderTrustAccumulationReport(state),
    "emotional_progression_report.md": renderEmotionalProgressionReport(state),
    "CTA_memory_report.md": renderCtaMemoryReport(state),
    "cognition_recommendations_report.md": renderRecommendationsReport(state),
  };

  const written = [];
  for (const [fileName, content] of Object.entries(reports)) {
    const target = path.join(REPORT_DIR, fileName);
    await fs.writeFile(target, content, "utf8");
    written.push(target);
  }
  return written;
}

async function main() {
  const state = createInitialCognitiveState({
    expertId: "dinara",
    generatedAt: "2026-05-13T00:00:00.000Z",
  });

  for (let day = 1; day <= 90; day += 1) {
    simulateEventForDay(state, day);
  }

  const reportPaths = await writeReports(state);
  const topRelationship = getTopRelationships(state, 1)[0];
  const trustStart = state.trustState.trustTrajectory[0];
  const trustEnd = state.trustState.trustTrajectory.at(-1);
  const repetitionWarning = state.repetitionIntelligence.warnings.at(-1);
  const narrativeRecommendation = state.recommendations.find((item) => item.type === "narrative_continuation");
  const saturationInsight = Object.entries(state.audienceMemory.topicSaturation)
    .sort((a, b) => b[1] - a[1])[0];

  console.log("Central Expert Cognitive Graph simulation complete.");
  console.log("Local-only confirmation: no deploy, no Telegram runtime changes, no auto-posting, no external APIs, no ingest/promote, no FAISS/index mutation.");
  console.log(`Reports: ${reportPaths.map(relative).join(", ")}`);
  console.log(`Example topic graph: ${topRelationship.sourceLabel} -> ${topRelationship.targetLabel}, weight ${topRelationship.weight}, distance ${topRelationship.topicDistance}.`);
  console.log(`Example trust progression: day ${trustStart.day} score ${trustStart.score} -> day ${trustEnd.day} score ${trustEnd.score}.`);
  console.log(`Example audience memory insight: ${saturationInsight[0]} saturation ${saturationInsight[1]}, novelty ${state.audienceMemory.noveltyScores[saturationInsight[0]]}.`);
  console.log(`Example semantic repetition warning: ${repetitionWarning?.message || "none"}`);
  console.log(`Example narrative continuation recommendation: ${narrativeRecommendation?.recommendation || "none"}`);
  console.log(`Example emotional pacing insight: overload risk ${state.emotionalProgression.emotionalOverloadRisk}, pacing balance ${state.emotionalProgression.pacingBalance}.`);
}

main().catch((error) => {
  console.error("Cognitive graph simulation failed.");
  console.error(error);
  process.exitCode = 1;
});
