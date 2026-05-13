import { clamp, round, splitParagraphs, unique } from "./utils.js";

function repeatedOpeningCount(paragraphs) {
  const starts = paragraphs
    .map((item) => item.split(/\s+/).slice(0, 4).join(" ").toLowerCase())
    .filter((item) => item.length > 10);
  const counts = new Map();
  for (const start of starts) counts.set(start, (counts.get(start) || 0) + 1);
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function evaluateRepetitionRisk(input = {}) {
  const text = input.promptText || "";
  const runtimeRisk = input.repetitionRisk || {};
  const paragraphs = splitParagraphs(text);
  const repeatedOpenings = repeatedOpeningCount(paragraphs);
  const repeatedRecentTopic = Number(runtimeRisk.same_topic_recent_count || 0);
  const repeatedHook = Number(runtimeRisk.repeated_hook_recent_count || 0);
  const runtimeScore = Number(runtimeRisk.risk_score || 0);
  const risk = clamp(runtimeScore + Math.min(0.22, repeatedOpenings * 0.07) + Math.min(0.18, repeatedRecentTopic * 0.06) + Math.min(0.18, repeatedHook * 0.06));
  const score = clamp(1 - risk);

  return {
    score: round(score),
    risk_score: round(risk),
    status: risk >= 0.48 ? "reframe" : risk >= 0.24 ? "watch" : "low",
    detected: {
      repeated_paragraph_openings: repeatedOpenings,
      same_topic_recent_count: repeatedRecentTopic,
      repeated_hook_recent_count: repeatedHook,
      runtime_risk_score: runtimeScore,
    },
    warnings: [
      risk >= 0.24 ? "repetition_risk" : null,
      repeatedOpenings > 0 ? "repeated_paragraph_openings" : null,
    ].filter(Boolean),
    soft_constraints: [
      "Change the opening angle when a topic or hook appeared recently.",
      "Do not repeat the same expert frame across adjacent paragraphs.",
      "Use one clear thread and one reframe instead of restating the same insight.",
      "Avoid repeating CTA or therapeutic wording from recent memory.",
    ],
  };
}

function repetitionConstraintText() {
  return unique(evaluateRepetitionRisk({}).soft_constraints).map((item) => `- ${item}`).join("\n");
}

export {
  evaluateRepetitionRisk,
  repetitionConstraintText,
};
