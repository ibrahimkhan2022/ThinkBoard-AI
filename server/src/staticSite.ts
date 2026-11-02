import type { FastifyInstance } from "fastify";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

/** The file a request path names inside `root`, or null when it points outside it (../) or is not a file. */
export async function resolveStaticFile(root: string, urlPath: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = normalize(join(root, decoded));
  if (target !== root && !target.startsWith(root + sep)) return null;
  try {
    return (await stat(target)).isFile() ? target : null;
  } catch {
    return null;
  }
}

/**
 * Serves the built web app (`npm run build:web`) from the same port as the API, so one address
 * is the whole product: no dev server to keep running, no separate address for the API.
 * The app has client-side routes (/board/123), so any other page falls back to index.html.
 */
export function serveWebApp(app: FastifyInstance, root: string) {
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== "GET" && req.method !== "HEAD") return reply.code(404).send({ error: "not_found" });
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not_found" });

    const file = await resolveStaticFile(root, req.url);
    const target = file ?? join(root, "index.html");
    // Only files the build names by content (/_expo, /assets) are safe to keep; canvaskit.wasm and the page are not.
    const isHashed = file !== null && /^\/(_expo|assets)\//.test(req.url);
    try {
      const body = await readFile(target);
      return reply
        .type(TYPES[extname(target).toLowerCase()] ?? "application/octet-stream")
        .header("Cache-Control", isHashed ? "public, max-age=31536000, immutable" : "no-cache")
        .send(body);
    } catch {
      return reply.code(404).send({ error: "web_app_not_built", message: "Run `npm run build:web` first." });
    }
  });
}
