import { PROVIDER_NAMES } from "@thinkboard/shared";
import { z } from "zod";

const BooleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const EnvSchema = z.object({
  AI_PROVIDER: z.enum(PROVIDER_NAMES).default("mock"),

  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default(""),

  META_MODEL: z.string().default("muse-spark-1.3"),
  MODEL_API_KEY: z.string().default(""),
  ENABLE_PAID_AI: BooleanFlag,
  // Application-level safety limits, not provider-enforced limits.
  MAX_META_CALLS_PER_SESSION: z.coerce.number().int().nonnegative().default(10),
  MAX_META_REQUESTS_PER_DAY: z.coerce.number().int().nonnegative().default(50),
  META_BUDGET_USD: z.coerce.number().nonnegative().default(150),

  MOCK_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("127.0.0.1"),
  /** Extra comma-separated browser origins; localhost is always allowed. */
  CORS_ORIGINS: z.string().default(""),
});

export type AppConfig = z.infer<typeof EnvSchema>;

/** Blank values in `.env` (e.g. `MODEL_API_KEY=`) are treated as unset. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  return EnvSchema.parse(present);
}
