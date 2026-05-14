import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const TELEMETRY_DIR = path.join(ROOT, "reports", "beta-telemetry");

function parseArgs(argv) {
  const args = { days: 7 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--days") args.days = Math.max(1, Number(argv[i + 1] || 7));
  }
  return args;
}

async function readEvents(days) {
  const entries = await fs.readdir(TELEMETRY_DIR).catch(() => []);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = entries
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort()
    .filter((name) => new Date(name.slice(0, 10)).getTime() >= cutoff - 24 * 60 * 60 * 1000);
  const events = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(TELEMETRY_DIR, file), "utf-8").catch(() => "");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (new Date(event.ts).getTime() >= cutoff) events.push(event);
      } catch {}
    }
  }
  return events;
}

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function countBy(events, key) {
  return events.reduce((acc, event) => {
    const value = event[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function summarize(events, days) {
  const users = new Set(events.map((event) => event.user_id));
  const usersWith = (name) => new Set(events.filter((event) => event.event === name).map((event) => event.user_id));
  const onboardingStarted = usersWith("onboarding_started");
  const onboardingCompleted = usersWith("onboarding_completed");
  const firstGeneration = usersWith("first_generation");
  const regeneration = usersWith("regeneration_used");
  const demoStarted = usersWith("demo_started");
  const demoConverted = usersWith("demo_conversion");
  const exhausted = events.filter((event) => event.event === "generation_exhausted");
  const upgrades = events.filter((event) => event.event === "upgrade_prompt_shown" || event.event === "stars_upgrade_clicked");
  const costs = events.filter((event) => event.event === "cost_recorded");
  const costTotal = costs.reduce((sum, event) => sum + Number(event.estimated_usd || 0), 0);

  const dropoffs = {
    onboarding_started_no_completion: [...onboardingStarted].filter((id) => !onboardingCompleted.has(id)).length,
    completed_no_first_generation: [...onboardingCompleted].filter((id) => !firstGeneration.has(id)).length,
    demo_started_no_conversion: [...demoStarted].filter((id) => !demoConverted.has(id)).length,
    exhausted_no_upgrade_click: exhausted.length > 0 && upgrades.length === 0 ? exhausted.length : 0,
  };

  return [
    `Beta telemetry summary (${days}d)`,
    "",
    `Users seen: ${users.size}`,
    `Events: ${events.length}`,
    "",
    "Activation",
    `Onboarding started: ${onboardingStarted.size}`,
    `Onboarding completed: ${onboardingCompleted.size} (${pct(onboardingCompleted.size, onboardingStarted.size)} of started)`,
    `First generation users: ${firstGeneration.size} (${pct(firstGeneration.size, onboardingCompleted.size)} of completed)`,
    "",
    "Usage",
    `Regeneration users: ${regeneration.size} (${pct(regeneration.size, firstGeneration.size)} of first-generation users)`,
    `Demo started: ${demoStarted.size}`,
    `Demo converted: ${demoConverted.size} (${pct(demoConverted.size, demoStarted.size)} of demo users)`,
    "",
    "Monetization",
    `Quota exhausted events: ${exhausted.length}`,
    `Upgrade/Stars intent events: ${upgrades.length}`,
    "",
    "Dropoff points",
    `Started onboarding, not completed: ${dropoffs.onboarding_started_no_completion}`,
    `Completed onboarding, no first generation: ${dropoffs.completed_no_first_generation}`,
    `Demo started, not converted: ${dropoffs.demo_started_no_conversion}`,
    `Quota exhausted, no upgrade click in window: ${dropoffs.exhausted_no_upgrade_click}`,
    "",
    "Costs",
    `Estimated runtime cost: $${costTotal.toFixed(3)}`,
    `Cost categories: ${JSON.stringify(countBy(costs, "category"))}`,
    "",
    "Top events",
    JSON.stringify(countBy(events, "event"), null, 2),
  ].join("\n");
}

const args = parseArgs(process.argv);
const events = await readEvents(args.days);
console.log(summarize(events, args.days));
