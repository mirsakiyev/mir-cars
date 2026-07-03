import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, loadEnv } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const ignoredDirs = new Set(["assets", "audit", "dist", "node_modules", "supabase"]);
const staticAssetDirs = ["assets/fleet", "assets/backgrounds"];
const localFunctionRoutes = new Map([
  ["create-checkout-session", "create-checkout-session.mjs"],
  ["customer-booking-lookup", "customer-booking-lookup.mjs"],
  ["customer-extension-request", "customer-extension-request.mjs"],
  ["customer-lost-found", "customer-lost-found.mjs"],
]);
const extensionlessRoutes = new Map([
  ["/fleet", "/fleet.html"],
  ["/policies", "/policies/index.html"],
  ["/admin/login", "/admin/login/index.html"],
  ["/admin/bookings", "/admin/bookings/index.html"],
  ["/admin/vehicles", "/admin/vehicles/index.html"],
  ["/admin/contacts", "/admin/contacts/index.html"],
  ["/admin/payments", "/admin/payments/index.html"],
  ["/terms", "/terms/index.html"],
  ["/faq", "/faq/index.html"],
  ["/lost-and-found", "/lost-and-found/index.html"],
  ["/portal", "/portal/index.html"],
  ["/contact", "/contact/index.html"],
  ["/payment-success", "/payment-success.html"],
  ["/payment-cancelled", "/payment-cancelled.html"],
]);

function htmlEntries(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (ignoredDirs.has(name)) return [];

    const filePath = resolve(dir, name);
    const stats = statSync(filePath);

    if (stats.isDirectory()) return htmlEntries(filePath);
    if (!name.endsWith(".html")) return [];

    const key = relative(root, filePath).replace(/\\/g, "/").replace(/\/index\.html$/, "").replace(/\.html$/, "") || "index";
    return [[key, filePath]];
  });
}

function rewriteExtensionlessRoute(request, _response, next) {
  const originalUrl = request.url || "/";
  const [, pathname = "/", suffix = ""] = originalUrl.match(/^([^?#]*)(.*)$/) || [];
  const normalizedPath = pathname.replace(/\/+$/, "");
  const routeTarget = extensionlessRoutes.get(normalizedPath);

  if (routeTarget) {
    request.url = `${routeTarget}${suffix}`;
  }

  next();
}

function decodeRequestPath(url) {
  try {
    return decodeURIComponent(new URL(url || "/", "http://127.0.0.1").pathname);
  } catch (_error) {
    return null;
  }
}

function isLocalHtmlRequest(request) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) return false;

  const pathname = decodeRequestPath(request.url);
  if (!pathname || pathname.includes("\0")) return false;
  if (pathname.startsWith("/@") || pathname.startsWith("/src/") || pathname.startsWith("/node_modules/")) return false;
  if (pathname.startsWith("/.netlify/functions/")) return false;

  const extension = pathname.match(/\/[^/]*\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() || "";
  if (extension && extension !== "html") return false;

  const acceptHeader = String(request.headers.accept || "");
  return !acceptHeader || acceptHeader.includes("text/html") || acceptHeader.includes("*/*");
}

function localFileExists(baseDir, pathname) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const filePath = resolve(baseDir, cleanPath || "index.html");
  const relativePath = relative(baseDir, filePath);

  if (relativePath.startsWith("..") || relativePath === "" || relativePath.startsWith("../") || relativePath.startsWith("..\\")) {
    return false;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) return true;
  if (existsSync(resolve(filePath, "index.html"))) return true;
  if (!/\.[^/]+$/.test(filePath) && existsSync(`${filePath}.html`)) return true;

  return false;
}

function serveLocalNotFound(sourceDir, fallbackDir = sourceDir) {
  return (request, response, next) => {
    const pathname = decodeRequestPath(request.url);
    if (!isLocalHtmlRequest(request) || !pathname || localFileExists(sourceDir, pathname)) {
      next();
      return;
    }

    const notFoundPath = resolve(fallbackDir, "404.html");
    if (!existsSync(notFoundPath)) {
      next();
      return;
    }

    response.statusCode = 404;
    response.setHeader("Content-Type", "text/html; charset=utf-8");

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(readFileSync(notFoundPath, "utf8"));
  };
}

function applyLocalEnv(mode) {
  const env = loadEnv(mode, root, "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    request.on("error", rejectBody);
  });
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : String(value || "")]),
  );
}

function sendLocalFunctionResponse(response, result) {
  response.statusCode = result?.statusCode || 200;

  for (const [key, value] of Object.entries(result?.headers || {})) {
    response.setHeader(key, value);
  }

  response.end(result?.body || "");
}

function isLoopbackRequest(request) {
  const remoteAddress = request.socket?.remoteAddress || "";

  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

async function runLocalNetlifyFunction(request, response, next) {
  const originalUrl = request.url || "/";
  const requestUrl = new URL(originalUrl, "http://127.0.0.1");
  const functionName = requestUrl.pathname.match(/^\/\.netlify\/functions\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const functionFile = localFunctionRoutes.get(functionName);

  if (!functionFile) {
    next();
    return;
  }

  if (!isLoopbackRequest(request)) {
    response.statusCode = 403;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Local function access is restricted to this machine." }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const functionUrl = pathToFileURL(resolve(root, "netlify/functions", functionFile)).href;
    const { handler } = await import(functionUrl);
    const result = await handler({
      body,
      headers: normalizeHeaders(request.headers),
      httpMethod: request.method,
      isBase64Encoded: false,
      path: requestUrl.pathname,
      queryStringParameters: Object.fromEntries(requestUrl.searchParams.entries()),
      rawQuery: requestUrl.searchParams.toString(),
      rawUrl: originalUrl,
    });

    sendLocalFunctionResponse(response, result);
  } catch (error) {
    console.error("Local Netlify function failed.", error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Local function failed. Check the dev server logs." }));
  }
}

function copyStaticAssetDirs(outDir) {
  for (const staticDir of staticAssetDirs) {
    const source = resolve(root, staticDir);
    const destination = resolve(outDir, staticDir);

    if (!existsSync(source)) continue;

    rmSync(destination, { force: true, recursive: true });
    mkdirSync(resolve(destination, ".."), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

export default defineConfig(({ mode }) => {
  applyLocalEnv(mode);

  let buildOutDir = resolve(root, "dist");

  return {
    plugins: [
      {
        name: "mir-extensionless-route-rewrites",
        configureServer(server) {
          server.middlewares.use(runLocalNetlifyFunction);
          server.middlewares.use(rewriteExtensionlessRoute);
          server.middlewares.use(serveLocalNotFound(root));
        },
        configurePreviewServer(server) {
          server.middlewares.use(runLocalNetlifyFunction);
          server.middlewares.use(rewriteExtensionlessRoute);
          server.middlewares.use(serveLocalNotFound(buildOutDir, buildOutDir));
        },
      },
      {
        name: "mir-static-image-copy",
        configResolved(config) {
          buildOutDir = resolve(config.root, config.build.outDir);
        },
        writeBundle() {
          copyStaticAssetDirs(buildOutDir);
        },
      },
    ],
    build: {
      rollupOptions: {
        input: Object.fromEntries(htmlEntries(root)),
      },
    },
  };
});
