import { z } from "zod";

/** The stable request and event contract for `POST /api/me/assistant`, shared by web and native clients. */

export const assistantLimits = {
  messageChars: 1000,
  historyTurns: 8,
  historyChars: 4000,
  modelCalls: 3,
  toolCalls: 5,
  maxOutputTokens: 1200,
  toolResultBytes: 6000,
  timeoutMs: 45_000,
} as const;

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(assistantLimits.messageChars),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(assistantLimits.historyChars),
  }).strict()).max(assistantLimits.historyTurns).default([]),
  /** Optional provider key (`provider:mediaType:providerId`) the question is about. */
  about: z.string().max(260).optional(),
  /** Mock data mode only: the browser-held fixture state. Rejected in live mode. */
  mockState: z.unknown().optional(),
}).strict();

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

const refMediaSchema = z.object({
  provider: z.enum(["tmdb", "igdb", "googlebooks", "mock"]),
  mediaType: z.enum(["movie", "tv", "game", "book"]),
  providerId: z.string(),
  title: z.string(),
  posterUrl: z.string().optional(),
  releaseYear: z.number().optional(),
});

export const assistantRefSchema = z.object({
  id: z.string().regex(/^r\d+$/),
  /** `your_mosaic`: a title in the user's own records. `catalog`: a catalog result, never a claim about the user. */
  origin: z.enum(["your_mosaic", "catalog"]),
  media: refMediaSchema,
  /** Server-copied facts from the user's records; never taken from model text. */
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  /** Server-written reason for a catalog suggestion. */
  reason: z.string().optional(),
  /** Ref id of the title a suggestion was derived from. */
  seed: z.string().optional(),
});

export type AssistantRef = z.infer<typeof assistantRefSchema>;
export type AssistantRefMedia = z.infer<typeof refMediaSchema>;

export const assistantErrorCodes = ["RATE_LIMITED", "ASSISTANT_UNAVAILABLE", "INTERNAL_ERROR"] as const;

export const assistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), tool: z.string(), label: z.string() }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  /** Refs become available as tools return; clients render `[[rN]]` tokens with them. */
  z.object({ type: z.literal("refs"), refs: z.array(assistantRefSchema) }),
  z.object({ type: z.literal("scope"), items: z.array(z.object({ tool: z.string(), summary: z.string() })) }),
  z.object({
    type: z.literal("done"),
    truncated: z.boolean(),
    /** Ref ids the answer actually cites, in first-mention order. */
    cited: z.array(z.string()),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), modelCalls: z.number(), toolCalls: z.number() }),
  }),
  z.object({ type: z.literal("error"), code: z.enum(assistantErrorCodes), message: z.string(), retryable: z.boolean() }),
]);

export type AssistantEvent = z.infer<typeof assistantEventSchema>;
