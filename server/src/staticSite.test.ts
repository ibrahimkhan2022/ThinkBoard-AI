import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { resolveStaticFile } from "./staticSite";

process.env.NODE_ENV = "test";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "thinkboard-web-"));
  await mkdir(join(root, "_expo", "static"), { recursive: true });
  await writeFile(join(root, "index.html"), "<html>board</html>");
  await writeFile(join(root, "canvaskit.wasm"), "wasm");
  await writeFile(join(root, "_expo", "static", "app-abc123.js"), "console.log(1)");
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("serving the built web app", () => {
  const config = loadConfig({ MOCK_DELAY_MS: "0" });

  it("serves the page at / and files by their type", async () => {
    const app = await buildServer(config, { webRoot: root });
    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    expect(page.body).toBe("<html>board</html>");

    const wasm = await app.inject({ method: "GET", url: "/canvaskit.wasm" });
    expect(wasm.headers["content-type"]).toBe("application/wasm");
    expect(wasm.headers["cache-control"]).toBe("no-cache");

    const script = await app.inject({ method: "GET", url: "/_expo/static/app-abc123.js" });
    expect(script.headers["content-type"]).toMatch(/javascript/);
    expect(script.headers["cache-control"]).toMatch(/immutable/);
  });

  it("opens a board address (a client-side route) with the page, so a refresh or a shared link works", async () => {
    const app = await buildServer(config, { webRoot: root });
    const res = await app.inject({ method: "GET", url: "/board/1730000000" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("<html>board</html>");
  });

  it("keeps the API working beside it, and unknown API paths stay errors", async () => {
    const app = await buildServer(config, { webRoot: root });
    expect((await app.inject({ method: "GET", url: "/api/health" })).json().ok).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/nothing" })).statusCode).toBe(404);
  });

  it("never reads outside the folder", async () => {
    expect(await resolveStaticFile(root, "/../package.json")).toBeNull();
    expect(await resolveStaticFile(root, "/..%2f..%2fpackage.json")).toBeNull();
    expect(await resolveStaticFile(root, "/%00")).toBeNull();
    expect(await resolveStaticFile(root, "/%E0%A4%A")).toBeNull();
    expect(await resolveStaticFile(root, "/index.html")).toBe(join(root, "index.html"));
  });

  it("serves nothing unless asked to", async () => {
    const app = await buildServer(config);
    expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(404);
  });
});
