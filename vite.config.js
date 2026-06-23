import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const ignoredDirs = new Set(["assets", "audit", "dist", "node_modules", "supabase"]);
const staticAssetDirs = ["assets/fleet", "assets/backgrounds"];
const extensionlessRoutes = new Map([
  ["/admin/login", "/admin/login/index.html"],
  ["/admin/bookings", "/admin/bookings/index.html"],
  ["/admin/vehicles", "/admin/vehicles/index.html"],
  ["/admin/contacts", "/admin/contacts/index.html"],
  ["/admin/payments", "/admin/payments/index.html"],
  ["/terms", "/terms/index.html"],
  ["/faq", "/faq/index.html"],
  ["/lost-and-found", "/lost-and-found/index.html"],
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

export default defineConfig(() => {
  let buildOutDir = resolve(root, "dist");

  return {
    plugins: [
      {
        name: "mir-extensionless-route-rewrites",
        configureServer(server) {
          server.middlewares.use(rewriteExtensionlessRoute);
        },
        configurePreviewServer(server) {
          server.middlewares.use(rewriteExtensionlessRoute);
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
