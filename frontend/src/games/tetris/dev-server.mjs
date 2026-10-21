import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendOrigin = `http://localhost:${process.env.PORT || 5174}`;
const backendOrigin = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveFrontend(request, response) {
  const pathname = new URL(request.url, frontendOrigin).pathname;
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = resolve(frontendRoot, `.${requestedPath}`);

  // Never let a URL path escape the frontend folder.
  if (!filePath.startsWith(frontendRoot + sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer((request, response) => {
  if (request.method === "GET" && serveFrontend(request, response)) return;

  // API calls and Django admin go through the same origin so session cookies work.
  const target = new URL(request.url, backendOrigin);
  const headers = { ...request.headers, host: new URL(backendOrigin).host };
  if (headers.origin) headers.origin = backendOrigin;
  if (headers.referer) headers.referer = `${backendOrigin}/`;

  const proxyRequest = fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request,
    duplex: "half",
    redirect: "manual",
  });

  proxyRequest.then(async (upstream) => {
    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    response.writeHead(upstream.status, responseHeaders);
    if (upstream.body) {
      for await (const chunk of upstream.body) response.write(chunk);
    }
    response.end();
  }).catch(() => {
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ detail: `Django is not reachable at ${backendOrigin}. Start the backend, then refresh.` }));
  });
});

const port = Number(process.env.PORT || 5174);
server.listen(port, "127.0.0.1", () => {
  console.log(`Arcade frontend: ${frontendOrigin}`);
  console.log(`Django API proxy: ${backendOrigin}`);
  console.log("Start Django on port 8000 in a separate terminal before playing.");
});
