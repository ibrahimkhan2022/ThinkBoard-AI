import { z } from "zod";
import { UsageReportSchema } from "./tutor";

/** A request to draw a study diagram (Meta Muse Image). Costs money, so it only happens on an explicit button press. */
export const DiagramRequestSchema = z.object({
  sessionId: z.string().min(1).max(100),
  /** What to draw, in the student's words, e.g. "the water cycle with evaporation and condensation labelled". */
  description: z.string().trim().min(3).max(400),
  /**
   * The part of the board the diagram is about, when the student refers to it ("draw what this situation looks like").
   * With it, Muse Spark first reads the problem and writes the brief; without it the description is drawn as it is.
   */
  imageBase64: z.string().max(7_000_000).optional(),
  imageMimeType: z.enum(["image/png", "image/jpeg"]).optional(),
  /** Typed lines of the problem, exactly as written (see TutorRequest.typedLines). */
  typedLines: z.array(z.object({ line: z.number().int().min(1).max(40), text: z.string().min(1).max(300) })).max(40).optional(),
}).refine((r) => !r.imageBase64 || r.imageMimeType, { message: "imageMimeType is required when imageBase64 is present", path: ["imageMimeType"] });
export type DiagramRequest = z.infer<typeof DiagramRequestSchema>;

export const DIAGRAM_MIME_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;

export const DiagramResultSchema = z.object({
  imageBase64: z.string().min(1),
  imageMimeType: z.enum(DIAGRAM_MIME_TYPES),
  /** What the diagram shows, in words: the brief Muse Spark wrote from the board (absent when the student's own words were drawn). */
  brief: z.string().optional(),
  meta: z.object({
    model: z.string(),
    /** Estimated from the price list, not an invoice. */
    usage: UsageReportSchema.optional(),
  }),
});
export type DiagramResult = z.infer<typeof DiagramResultSchema>;
