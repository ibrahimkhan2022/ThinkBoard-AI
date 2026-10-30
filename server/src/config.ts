import { PROVIDER_NAMES } from "@thinkboard/shared";
import { z } from "zod";

const BooleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const EnvSchema = z.object({
  AI_PROVIDER: z.enum(PROVIDER_NAMES).default("mock"),

  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  /** Must be a vision-capable model, e.g. gemma3:4b or qwen2.5vl:7b. */
  OLLAMA_MODEL: z.string().default(""),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  META_MODEL: z.string().default("muse-spark-1.3"),
  META_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MODEL_API_KEY: z.string().default(""),
  ENABLE_PAID_AI: BooleanFlag,
  /**
   * The "-contributor" models are cheaper because Meta may train on the prompts,
   * images and replies. Student work is private by default, so this must be
   * switched on deliberately.
   */
  META_ALLOW_TRAINING_USE: BooleanFlag,
  /** Hard cap on output tokens per call, including hidden reasoning (billed as output). */
  META_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(8000).default(1200),
  /** Hidden reasoning effort; "off" leaves it to the provider default. More effort costs more. */
  META_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high", "off"]).default("low"),
  META_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
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
