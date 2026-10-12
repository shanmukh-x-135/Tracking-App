import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { assistantLimits, assistantRequestSchema, type AssistantEvent } from "@/lib/assistant/contract";
import type { LimitDecision } from "@/lib/assistant/limits";
import { ModelError, type ChatModel } from "@/lib/assistant/model";
import { RefTable } from "@/lib/assistant/references";
import { emptySummary, runAssistant } from "@/lib/assistant/run";
import type { ToolContext } from "@/lib/assistant/tools";
import { parseProviderKey } from "@/lib/media/identity";
import { emptyMosaicState, type MosaicState } from "@/lib/persistence/types";

interface AssistantUser<Client> { id: string; client: Client }

export interface AssistantDependencies<Client> {
  dataMode: "mock" | "live";
  getAuthenticatedUser(request: Request): Promise<AssistantUser<Client> | undefined>;
  loadState(client: Client, userId: string): Promise<MosaicState>;
  catalog: ToolContext["catalog"];
  /** Live mode: the kill switch and beta allowlist (`*` allows every signed-in user). */
  enabled: boolean;
  allowedUsers: string[];
  /** Returns the configured model, or null when it is missing or not a reviewed pair. */
  createModel(): ChatModel | null;
  /** Mock mode only. */
  createMockModel(): ChatModel;
  limiter: { take(userId: string): LimitDecision };
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
}

const maxBodyBytes = 1_100_000;
const statusOf = { rate_limited: 429, payment_required: 503, model_unavailable: 503, unavailable: 503, timeout: 503, bad_response: 503 } as const;

/** Mock fixtures only need the collection shape; anything else is rejected rather than trusted. */
const mockStateSchema = z.object(Object.fromEntries(Object.keys(emptyMosaicState()).map((key) => [key, z.array(z.unknown()).max(5000).optional()]))).passthrough();

function userMessageFor(error: ModelError): string {
  if (error.kind === "rate_limited") return "Mosaic AI has used today's free capacity. Try again later.";
  if (error.kind === "model_unavailable" || error.kind === "payment_required") return "Mosaic AI's model is unavailable right now.";
  return "Mosaic AI couldn't finish that answer. Try again in a moment.";
}

function modelErrorResponse(error: ModelError): Response {
  const response = apiError(error.kind === "rate_limited" ? "RATE_LIMITED" : "ASSISTANT_UNAVAILABLE", userMessageFor(error), statusOf[error.kind]);
  if (error.retryAfterSeconds) response.headers.set("retry-after", String(error.retryAfterSeconds));
  if (error.kind === "rate_limited") response.headers.set("x-mosaic-limit-scope", "service");
  return response;
}

function errorEvent(error: unknown): AssistantEvent {
  if (error instanceof ModelError) return { type: "error", code: error.kind === "rate_limited" ? "RATE_LIMITED" : "ASSISTANT_UNAVAILABLE", message: userMessageFor(error), retryable: true };
  return { type: "error", code: "INTERNAL_ERROR", message: "Mosaic AI couldn't finish that answer.", retryable: true };
}

const timeoutEvent: AssistantEvent = { type: "error", code: "ASSISTANT_UNAVAILABLE", message: "Mosaic AI took too long to answer. Try again.", retryable: true };

/** HTTP adapter for the read-only assistant. All authorization happens here, before any model call. */
export function createAssistantHandler<Client>(deps: AssistantDependencies<Client>): (request: Request) => Promise<Response> {
  return async (request) => {
    const started = Date.now();
    const log = deps.log ?? ((entry) => console.info("mosaic.assistant", entry));
    const requestId = crypto.randomUUID();

    if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) return apiError("VALIDATION_ERROR", "The request was too large.", 400);
    let user: AssistantUser<Client> | undefined;
    if (deps.dataMode === "live") {
      user = await deps.getAuthenticatedUser(request);
      if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
    }
    const raw = await request.text().catch(() => "");
    if (raw.length > maxBodyBytes) return apiError("VALIDATION_ERROR", "The request was too large.", 400);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return apiError("VALIDATION_ERROR", "The request was invalid.", 400); }
    const parsed = assistantRequestSchema.safeParse(json);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "The request was invalid.", 400);
    const body = parsed.data;
    if (body.about !== undefined && !parseProviderKey(body.about)) return apiError("VALIDATION_ERROR", "Unknown title.", 400);

    let model: ChatModel | null;
    let loadState: () => Promise<MosaicState>;
    if (deps.dataMode === "live") {
      // Client-held state is only ever a mock-mode fixture; live answers use the caller's own records.
      if (body.mockState !== undefined) return apiError("VALIDATION_ERROR", "The request was invalid.", 400);
      if (!deps.enabled) return apiError("ASSISTANT_UNAVAILABLE", "Mosaic AI is not available yet.", 503);
      if (!deps.allowedUsers.includes("*") && !deps.allowedUsers.includes(user!.id)) return apiError("FORBIDDEN", "Mosaic AI is in a private beta.", 403);
      model = deps.createModel();
      if (!model) return apiError("ASSISTANT_UNAVAILABLE", "Mosaic AI is not configured.", 503);
      const { client, id } = user!;
      loadState = () => deps.loadState(client, id);
    } else {
      const mock = mockStateSchema.safeParse(body.mockState ?? {});
      if (!mock.success) return apiError("VALIDATION_ERROR", "The request was invalid.", 400);
      const state = { ...emptyMosaicState(), ...mock.data } as MosaicState;
      model = deps.createMockModel();
      loadState = async () => state;
    }

    // Mock mode never reaches a model, so only live requests spend the limiter.
    const limit: LimitDecision = deps.dataMode === "live" ? deps.limiter.take(user!.id) : { allowed: true };
    if (!limit.allowed) {
      const response = apiError("RATE_LIMITED", limit.scope === "service" ? "Mosaic AI has used today's capacity. Try again later." : "You're asking quickly. Wait a moment and try again.", 429);
      if (limit.retryAfterSeconds) response.headers.set("retry-after", String(limit.retryAfterSeconds));
      response.headers.set("x-mosaic-limit-scope", limit.scope ?? "user");
      return response;
    }

    let statePromise: Promise<MosaicState> | undefined;
    const ctx: ToolContext = { getState: () => (statePromise ??= loadState()), catalog: deps.catalog, refs: new RefTable(), now: deps.now?.() ?? new Date() };
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(assistantLimits.timeoutMs)]);
    const summary = emptySummary();
    const events = runAssistant({ model, ctx, message: body.message, history: body.history, about: body.about, signal }, summary);
    const finish = (outcome: string) => log({
      requestId, outcome, model: model.id, modelCalls: summary.modelCalls, toolCalls: summary.toolCalls, tools: summary.toolNames,
      inputTokens: summary.inputTokens, outputTokens: summary.outputTokens, servedBy: [...summary.servedBy], cost: summary.cost, ms: Date.now() - started,
    });

    // Run the first step before committing to a 200 stream so early failures keep real HTTP statuses.
    let first: IteratorResult<AssistantEvent>;
    try { first = await events.next(); }
    catch (error) {
      if (error instanceof ModelError) { finish(error.kind); return modelErrorResponse(error); }
      if (signal.aborted) { finish(request.signal.aborted ? "aborted" : "timeout"); return apiError("ASSISTANT_UNAVAILABLE", "Mosaic AI took too long to answer. Try again.", 503); }
      finish("internal_error");
      return apiError("INTERNAL_ERROR", "Your Mosaic data could not be loaded.", 500);
    }

    const encoder = new TextEncoder();
    const line = (event: AssistantEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) controller.enqueue(line(first.value));
          for (let next = await events.next(); !next.done; next = await events.next()) controller.enqueue(line(next.value));
          if (signal.aborted && !request.signal.aborted) controller.enqueue(line(timeoutEvent));
          finish(request.signal.aborted ? "aborted" : signal.aborted ? "timeout" : "ok");
        } catch (error) {
          // A client cancel needs no reply; a server-side timeout does.
          if (!request.signal.aborted) controller.enqueue(line(signal.aborted ? timeoutEvent : errorEvent(error)));
          finish(request.signal.aborted ? "aborted" : signal.aborted ? "timeout" : error instanceof ModelError ? error.kind : "internal_error");
        } finally {
          controller.close();
        }
      },
      async cancel() { await events.return(undefined); },
    });
    return new NextResponse(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId } });
  };
}
