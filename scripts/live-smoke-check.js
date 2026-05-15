import "dotenv/config";

const baseUrl = (process.env.LIVE_BASE_URL || process.env.RAILWAY_PUBLIC_URL || process.argv[2] || "").replace(/\/+$/, "");

const paths = [
  "/health",
  "/runtime-status",
  "/payment-status",
  "/miniapp-status",
  "/runtime/plans",
  "/miniapp/api/plans",
];

async function checkPath(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 160) };
    }
    return {
      path,
      ok: res.ok && body?.ok !== false,
      status: res.status,
      ms: Date.now() - started,
      body,
    };
  } catch (error) {
    return {
      path,
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: error.message,
    };
  }
}

if (!baseUrl) {
  console.error("Usage: LIVE_BASE_URL=https://your-app.up.railway.app npm run live:smoke");
  console.error("   or: node scripts/live-smoke-check.js https://your-app.up.railway.app");
  process.exit(1);
}

const results = [];
for (const path of paths) {
  results.push(await checkPath(path));
}

const summary = {
  ok: results.every((result) => result.ok),
  baseUrl,
  checkedAt: new Date().toISOString(),
  results: results.map((result) => ({
    path: result.path,
    ok: result.ok,
    status: result.status,
    ms: result.ms,
    error: result.error || null,
    serviceOk: result.body?.ok ?? null,
  })),
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.ok) {
  process.exitCode = 1;
}
