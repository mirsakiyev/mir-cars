import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 5173);
const root = path.dirname(fileURLToPath(import.meta.url));
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function resolveRequestPath(urlPath) {
  let cleanPath = "/";

  try {
    cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  } catch (_error) {
    return null;
  }

  if (cleanPath.includes("\0")) {
    return null;
  }

  const segments = cleanPath.split("/").filter(Boolean);

  if (segments.some((segment) => segment.startsWith("."))) {
    return null;
  }

  const requested = cleanPath === "/" ? "/index.html" : cleanPath.endsWith("/") ? `${cleanPath}index.html` : cleanPath;
  const filePath = path.normalize(path.join(root, requested));
  const relativeFilePath = path.relative(root, filePath);

  if (relativeFilePath.startsWith("..") || path.isAbsolute(relativeFilePath)) {
    return null;
  }

  if (path.extname(filePath)) {
    return filePath;
  }

  const directoryIndexPath = path.join(filePath, "index.html");
  if (!path.relative(root, directoryIndexPath).startsWith("..") && fs.existsSync(directoryIndexPath)) {
    return directoryIndexPath;
  }

  const htmlFilePath = `${filePath}.html`;
  if (!path.relative(root, htmlFilePath).startsWith("..") && fs.existsSync(htmlFilePath)) {
    return htmlFilePath;
  }

  return filePath;
}

export const server = http.createServer((request, response) => {
  const filePath = resolveRequestPath(request.url || "/");

  if (!filePath) {
    response.writeHead(403, securityHeaders);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      const notFoundPath = path.join(root, "404.html");

      fs.readFile(notFoundPath, (notFoundError, notFoundData) => {
        if (notFoundError) {
          response.writeHead(404, securityHeaders);
          response.end("Not found");
          return;
        }

        response.writeHead(404, { ...securityHeaders, "Content-Type": types[".html"] });
        response.end(notFoundData);
      });
      return;
    }

    const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { ...securityHeaders, "Content-Type": type });
    response.end(data);
  });
});

server.listen(port, () => {
  console.log(`MIR CARS is running at http://localhost:${port}`);
});
