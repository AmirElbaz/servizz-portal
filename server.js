import { createServer, request as httpRequest } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dist = join(__dirname, "dist");
const port = parseInt(process.argv.find((a) => a.startsWith("-p"))?.slice(2) || process.argv[process.argv.indexOf("-p") + 1] || "3001");

// Backend target for /api/* requests. The browser calls the same origin
// (VITE_API_URL=/api) and we forward here so it never needs to reach the
// backend's internal IP directly. Override with API_PROXY_TARGET if needed.
const apiTarget = new URL(process.env.API_PROXY_TARGET || "http://localhost:3002");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  // Reverse-proxy API calls to the backend so the SPA can use a same-origin
  // /api base URL on every domain (local and public) without hardcoding the
  // backend's internal IP into the bundle.
  if (req.url.startsWith("/api/") || req.url === "/api") {
    const proxyReq = httpRequest(
      {
        protocol: apiTarget.protocol,
        hostname: apiTarget.hostname,
        port: apiTarget.port || 80,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: apiTarget.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad gateway", detail: err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  const decodedUrl = decodeURIComponent(req.url.split("?")[0]);
  let filePath = join(dist, decodedUrl === "/" ? "index.html" : decodedUrl);

  if (!existsSync(filePath) || !extname(filePath)) {
    filePath = join(dist, "index.html");
  }

  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    const html = readFileSync(join(dist, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`▲ Servizz Portal`);
  console.log(`- Local:         http://localhost:${port}`);
  console.log(`- Network:       http://127.0.0.1:${port}`);
  console.log(`✓ Ready`);
});
