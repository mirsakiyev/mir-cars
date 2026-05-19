import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const ignoredDirs = new Set(["assets", "audit", "dist", "node_modules", "supabase"]);
const staticAssetDirs = ["assets/fleet", "assets/backgrounds"];
const adminRoutes = new Set([
  "/admin/login",
  "/admin/bookings",
  "/admin/vehicles",
  "/admin/contacts",
  "/admin/payments",
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

function rewriteAdminRoute(request, _response, next) {
  const originalUrl = request.url || "/";
  const [, pathname = "/", suffix = ""] = originalUrl.match(/^([^?#]*)(.*)$/) || [];
  const normalizedPath = pathname.replace(/\/+$/, "");

  if (adminRoutes.has(normalizedPath)) {
    request.url = `${normalizedPath}/index.html${suffix}`;
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
        name: "mir-admin-route-rewrites",
        configureServer(server) {
          server.middlewares.use(rewriteAdminRoute);
        },
        configurePreviewServer(server) {
          server.middlewares.use(rewriteAdminRoute);
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
