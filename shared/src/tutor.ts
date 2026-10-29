import { z } from "zod";
import { isValidNormalizedBox } from "./geometry";

export const TUTOR_MODES = [
  "ask",
  "check_work",
  "hint",
  "start",
  "next_step",
  "explain_step",
] as const;
export const TutorModeSchema = z.enum(TUTOR_MODES);
export type TutorMode = z.infer<typeof TutorModeSchema>;

export const RectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const NormalizedBoxSchema = z
  .object({
    xMin: z.number(),
    yMin: z.number(),
    xMax: z.number(),
    yMax: z.number(),
  })
  .refine(isValidNormalizedBox, {
    message: "Highlight must lie within 0..1000 with min < max on both axes",
  });

export const TutorResponseSchema = z.object({
  status: z.enum(["correct", "error_found", "incomplete", "uncertain"]),
  message: z.string().min(1).max(4000),
  hint: z.string().max(2000).optional(),
  nextStep: z.string().max(2000).optional(),
  /** 1-based index of the earliest incorrect step, when one was identified. */
  errorStep: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
  /** Normalized 0..1000 relative to the image the model saw. */
  highlight: NormalizedBoxSchema.optional(),
  revealAnswer: z.boolean(),
});
export type TutorResponse = z.infer<typeof TutorResponseSchema>;

/** Canned "check my work" outcomes the mock provider can play back. */
export const MOCK_SCENARIOS = [
  "distribution_error",
  "arithmetic_error",
  "missing_steps",
  "correct",
  "unclear_handwriting",
] as const;
export const MockScenarioSchema = z.enum(MOCK_SCENARIOS);
export type MockScenario = z.infer<typeof MockScenarioSchema>;

export const TutorRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(100),
    mode: TutorModeSchema,
    question: z.string().max(2000).optional(),
    /** Canvas rectangle the image was exported from; needed to map highlights back. */
    region: RectSchema,
    /** Base64 image of `region` (what the model sees). Omitted when there is nothing to show. */
    imageBase64: z.string().max(7_000_000).optional(),
    imageMimeType: z.enum(["image/png", "image/jpeg"]).optional(),
    /** Test aid: only the mock provider reads this; real providers ignore it. */
    mockScenario: MockScenarioSchema.optional(),
  })
  .refine((r) => !r.imageBase64 || r.imageMimeType, {
    message: "imageMimeType is required when imageBase64 is present",
    path: ["imageMimeType"],
  });
export type TutorRequest = z.infer<typeof TutorRequestSchema>;

export const PROVIDER_NAMES = ["mock", "ollama", "meta"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const TutorResultSchema = z.object({
  response: TutorResponseSchema,
  meta: z.object({
    provider: z.enum(PROVIDER_NAMES),
    /** True when the response is canned test data, never real analysis. */
    isMock: z.boolean(),
  }),
});
export type TutorResult = z.infer<typeof TutorResultSchema>;
