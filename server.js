import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dist = join(__dirname, "dist");
const port = parseInt(process.argv.find((a) => a.startsWith("-p"))?.slice(2) || process.argv[process.argv.indexOf("-p") + 1] || "3001");

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

server.listen(port, "0.0.0.0", () => {
  console.log(`▲ Servizz Portal`);
  console.log(`- Local:         http://localhost:${port}`);
  console.log(`- Network:       http://0.0.0.0:${port}`);
  console.log(`✓ Ready`);
});
