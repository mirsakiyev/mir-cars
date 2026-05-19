import { readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const ignoredDirs = new Set(["assets", "audit", "dist", "node_modules", "supabase"]);
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

export default defineConfig({
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
  ],
  build: {
    rollupOptions: {
      input: Object.fromEntries(htmlEntries(root)),
    },
  },
});
