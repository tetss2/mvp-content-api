import { promises as fs } from "fs";
import { join } from "path";

const ROLES = {
  psychologist: {
    label: "Psychologist",
    topic: "why I understand everything but still feel anxious",
    knowledge: "Anxiety is often a signal that the nervous system has been carrying too much for too long. I do not rush clients into fixing themselves. First we name what is happening, reduce shame, and find one small place where a person can breathe again. Good content should feel warm, precise, and non-diagnostic.",
    style: "Sometimes a person comes not for advice, but for a place where their pain is not argued with.\n\nAnd here I always want to slow down. Because anxiety is not a defect. It is often a tired inner alarm that has been working without rest.",
  },
  coach: {
    label: "Coach",
    topic: "why I plan a lot and still do not start",
    knowledge: "Coaching content should help a person choose one next action without self-punishment. The core ideas are clarity, responsibility, energy, and realistic focus. Avoid hype and magical promises. Help the reader distinguish borrowed goals from real commitments.",
    style: "Sometimes the problem is not discipline. The problem is that the goal no longer belongs to you.\n\nBefore making a bigger plan, ask what decision would return one piece of control today.",
  },
  blogger: {
    label: "Blogger",
    topic: "how to stop sounding like everyone else",
    knowledge: "A personal brand becomes memorable through a point of view, repeatable voice, concrete observations, and honest position. Generic tips weaken trust. Strong posts show how the author thinks, not only what they know.",
    style: "I noticed one thing: people often polish the sentence until it loses the person.\n\nThe post becomes correct, useful, smooth. And completely impossible to remember.",
  },
  fitness: {
    label: "Fitness expert",
    topic: "why I start training and quit after a week",
    knowledge: "Fitness guidance should be safe, practical, and non-shaming. Sustainable progress depends on load, recovery, simple habits, sleep, nutrition basics, and plans that fit real life. Avoid medical promises and aggressive body pressure.",
    style: "Most people do not quit because they are weak.\n\nThey quit because the first plan already asked them to live like someone with twice their time, energy, and recovery.",
  },
  marketing: {
    label: "Marketing expert",
    topic: "why content does not bring clients",
    knowledge: "Marketing content should clarify audience, pain, offer, proof, positioning, and the next action. Strong communication is specific. Avoid hype, fake urgency, and vague expertise. A post should help a client recognize their situation quickly.",
    style: "Content often does not sell because it says too many correct things at once.\n\nThe reader sees expertise, but does not see: why this matters to me, why now, and what should I do next.",
  },
};

const FAILURE_CASES = [
  { name: "empty_upload", text: "" },
  { name: "broken_link_only", text: "https://example.invalid/private-post" },
  { name: "thin_style", text: "Write warmly and professionally." },
  { name: "low_quality_input", text: "make me viral post please sell more clients urgent urgent urgent" },
];

function wordCount(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function scoreMaterial(text, category) {
  const words = wordCount(text);
  const urlOnly = /^https?:\/\/\S+$/i.test(String(text || "").trim());
  const paragraphs = String(text || "").split(/\n{2,}/).filter((item) => wordCount(item) >= 8).length;
  let score = 0;
  if (words >= 45) score += 1;
  else if (words >= 18) score += 1;
  if (paragraphs >= 2) score += category === "style" ? 2 : 1;
  if (category === "knowledge" && /avoid|safe|belief|client|audience|promise|positioning|recovery|shame/i.test(text)) score += 1;
  if (urlOnly || words === 0) score -= 2;
  if (/viral|urgent|guarantee|guaranteed|100%/i.test(text)) score -= 1;
  return Math.max(0, Math.min(3, score));
}

function readinessLabel(score) {
  if (score >= 5) return "good";
  if (score >= 3) return "medium";
  return "weak";
}

function simulateRole([key, role]) {
  const uploadScore = scoreMaterial(role.knowledge, "knowledge") + scoreMaterial(role.style, "style");
  const extractionScore = uploadScore >= 6 ? 2 : uploadScore >= 3 ? 1 : 0;
  const generationScore = role.topic.length > 20 && uploadScore >= 4 ? 2 : 1;
  const uxScore = 2;
  const wowScore = uploadScore >= 6 ? 2 : 1;
  const total = uploadScore + extractionScore + generationScore + uxScore + wowScore;
  const risks = [];
  if (scoreMaterial(role.style, "style") < 3) risks.push("style sample may not teach cadence strongly enough");
  if (scoreMaterial(role.knowledge, "knowledge") < 3) risks.push("worldview may remain generic");
  if (key === "fitness") risks.push("needs careful non-medical guidance copy in real prompts");
  if (key === "marketing") risks.push("needs concrete offer/audience examples to avoid generic strategy posts");
  return {
    role: key,
    label: role.label,
    topic: role.topic,
    upload_quality: readinessLabel(uploadScore),
    extraction_readiness: extractionScore === 2 ? "good" : extractionScore === 1 ? "medium" : "weak",
    generation_readiness: generationScore === 2 ? "good" : "medium",
    onboarding_ux: "good",
    wow_quality: wowScore === 2 ? "good" : "medium",
    total,
    risks,
  };
}

function simulateFailureCase(item) {
  const knowledgeScore = scoreMaterial(item.text, "knowledge");
  const styleScore = scoreMaterial(item.text, "style");
  const suggestions = [];
  if (!item.text.trim()) suggestions.push("show empty upload guidance and ask for text/file/link again");
  if (/^https?:\/\//i.test(item.text.trim())) suggestions.push("ask user to paste page/post text next to the link");
  if (styleScore < 2) suggestions.push("request 3-5 real posts for style rhythm");
  if (knowledgeScore < 2) suggestions.push("request one expert note with beliefs, audience, boundaries, and examples");
  return {
    case: item.name,
    material_score: readinessLabel(knowledgeScore + styleScore),
    expected_recovery: suggestions,
  };
}

function renderReport(results, failures) {
  const lines = [
    "# Onboarding Product Loop Simulation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Role Flows",
    "",
  ];
  for (const result of results) {
    lines.push(`### ${result.label}`);
    lines.push(`- Topic: ${result.topic}`);
    lines.push(`- Uploads: ${result.upload_quality}`);
    lines.push(`- Extraction: ${result.extraction_readiness}`);
    lines.push(`- Generation: ${result.generation_readiness}`);
    lines.push(`- Onboarding UX: ${result.onboarding_ux}`);
    lines.push(`- WOW quality: ${result.wow_quality}`);
    lines.push(`- Total score: ${result.total}/14`);
    lines.push(`- Risks: ${result.risks.length ? result.risks.join("; ") : "none"}`);
    lines.push("");
  }
  lines.push("## Failure Handling");
  lines.push("");
  for (const failure of failures) {
    lines.push(`### ${failure.case}`);
    lines.push(`- Material score: ${failure.material_score}`);
    lines.push(`- Recovery: ${failure.expected_recovery.join("; ")}`);
    lines.push("");
  }
  lines.push("## Product Notes");
  lines.push("");
  lines.push("- Strongest immediate path is still template expert -> first generated post -> dashboard -> add materials.");
  lines.push("- Weakest real-user point is bare links or tiny style samples. Telegram guidance must ask for copied text, not just accept the file.");
  lines.push("- Fitness and marketing are viable as starter templates, but need real examples quickly to avoid generic content.");
  return lines.join("\n");
}

async function main() {
  const results = Object.entries(ROLES).map(simulateRole);
  const failures = FAILURE_CASES.map(simulateFailureCase);
  const report = renderReport(results, failures);
  const outDir = join(process.cwd(), "reports", "onboarding-simulations");
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = join(outDir, `${stamp}_product_loop.md`);
  const jsonPath = join(outDir, `${stamp}_product_loop.json`);
  await fs.writeFile(mdPath, report, "utf-8");
  await fs.writeFile(jsonPath, JSON.stringify({ generated_at: new Date().toISOString(), results, failures }, null, 2), "utf-8");
  console.log(`Simulation complete: ${mdPath}`);
  console.log(`JSON: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
