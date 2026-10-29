import cors from "@fastify/cors";
import { TutorRequestSchema } from "@thinkboard/shared";
import Fastify from "fastify";
import type { AppConfig } from "./config";
import { selectProvider } from "./providers";
import { createTutorService, ProviderOutputError, type TutorService } from "./tutorService";

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export async function buildServer(config: AppConfig, service?: TutorService) {
  const selection = service ? undefined : selectProvider(config);
  const tutor = service ?? createTutorService(selection!.provider);

  // 8 MB leaves room for a compressed whiteboard snapshot in later phases.
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
  }));

  app.post("/api/tutor", async (req, reply) => {
    const parsed = TutorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    try {
      return await tutor.analyze(parsed.data);
    } catch (err) {
      if (err instanceof ProviderOutputError) {
        return reply.code(502).send({ error: "invalid_provider_output", message: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: "provider_error", message: "The AI provider failed." });
    }
  });

  return app;
}
