import http from "http";
http.createServer((req, res) => res.end("OK")).listen(process.env.PORT || 3000);
import "./index.js";
import "./leads-bot.js";
