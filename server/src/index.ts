import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { buildServer } from "./app";
import { loadConfig } from "./config";

// Repo-root .env, regardless of the directory npm runs from.
loadDotenv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const config = loadConfig();
const app = await buildServer(config);
await app.listen({ port: config.PORT, host: config.HOST });
