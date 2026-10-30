import cors from "@fastify/cors";
import { TutorRequestSchema } from "@thinkboard/shared";
import Fastify from "fastify";
import { BudgetError } from "./budget";
import type { AppConfig } from "./config";
import { ProviderError } from "./providers/errors";
import { selectProvider, type ProviderSelection, type SelectOptions } from "./providers";
import { createTutorService, ProviderOutputError, type TutorService } from "./tutorService";

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export interface BuildOptions extends SelectOptions {
  /** Replace the whole provider layer (tests). */
  service?: TutorService;
  selection?: ProviderSelection;
}

export async function buildServer(config: AppConfig, options: BuildOptions = {}) {
  const selection = options.service ? options.selection : (options.selection ?? selectProvider(config, options));
  const tutor = options.service ?? createTutorService(selection!.provider);

  // 8 MB leaves room for a compressed whiteboard snapshot.
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 8 * 1024 * 1024 });
  if (selection?.warning) app.log.warn(selection.warning);

  const extraOrigins = config.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(null, !origin || LOCALHOST_ORIGIN.test(origin) || extraOrigins.includes(origin)),
  });

  app.get("/api/health", async () => ({
    ok: true,
    provider: tutor.provider.name,
    isMock: tutor.provider.isMock,
    paid: selection?.paid ?? false,
    ...(selection?.model ? { model: selection.model } : {}),
  }));

  /**
   * Estimated usage for the paid provider: counts and spend come from our own
   * gate, not from billing. Free providers have nothing to report.
   */
  app.get("/api/usage", async (req) => {
    const sessionId = String((req.query as { sessionId?: string }).sessionId ?? "").slice(0, 100);
    if (!selection?.usage) return { paid: false };
    return { paid: true, model: selection.model, ...selection.usage.snapshot(sessionId) };
  });

  app.post("/api/tutor", async (req, reply) => {
    const parsed = TutorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    try {
      return await tutor.analyze(parsed.data);
    } catch (err) {
      if (err instanceof BudgetError) {
        return reply.code(429).send({ error: err.code, message: err.message });
      }
      if (err instanceof ProviderError) {
        if (err.retryAfterSeconds) reply.header("Retry-After", String(err.retryAfterSeconds));
        return reply.code(err.httpStatus).send({ error: err.code, message: err.userMessage });
      }
      if (err instanceof ProviderOutputError) {
        return reply.code(502).send({ error: "invalid_provider_output", message: "The AI sent a reply that could not be used. Please try again." });
      }
      // Never log request bodies: they contain the student's board image.
      req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "provider failure");
      return reply.code(500).send({ error: "provider_error", message: "The AI provider failed." });
    }
  });

  return app;
}
