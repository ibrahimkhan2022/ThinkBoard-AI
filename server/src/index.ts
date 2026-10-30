import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { buildServer } from "./app";
import { loadConfig } from "./config";

// Repo-root .env, regardless of the directory npm runs from.
loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const config = loadConfig();
// Paid-usage counters live here so a restart cannot reset the daily and budget limits (git-ignored).
const usageFile = fileURLToPath(new URL("../data/usage.json", import.meta.url));
const app = await buildServer(config, { usageFile });
await app.listen({ port: config.PORT, host: config.HOST });
