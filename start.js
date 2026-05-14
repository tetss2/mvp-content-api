import http from "http";
const startedAt = new Date().toISOString();
const runtimeMode = process.env.RUNTIME_MODE || process.env.APP_ENV || process.env.NODE_ENV || "development";
http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "mvp-content-api", runtimeMode, startedAt }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}).listen(process.env.PORT || 3000);
await import("./index.js");
if (process.env.START_LEADS_BOT === "true") {
  await import("./leads-bot.js");
}
