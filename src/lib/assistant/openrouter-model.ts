import { assistantLimits } from "@/lib/assistant/contract";
import { ModelError, type ChatModel, type FinishReason, type ModelChunk, type ModelRequest, type ToolCall } from "@/lib/assistant/model";

/**
 * The only module that sends anything to a model. Models and providers are
 * allowlisted here so that changing either is a reviewed code change, never an
 * env typo or a silent fallback.
 */
export const reviewedModels = [
  { model: "apodex/apodex-1.1-mini:free", provider: "novita" },
  { model: "inclusionai/ling-3.1-flash", provider: "novita" },
] as const;

export const openRouterEndpoint = "https://openrouter.ai/api/v1/chat/completions";

/** Zero-retention, no-training, single-provider, never-paid routing, sent on every request. */
export function providerRouting(provider: string) {
  return {
    zdr: true,
    data_collection: "deny",
    only: [provider],
    allow_fallbacks: false,
    require_parameters: true,
    max_price: { prompt: 0, completion: 0 },
  } as const;
}

export function buildRequestBody(model: string, provider: string, request: Omit<ModelRequest, "signal">) {
  // Only parameters the reviewed Novita endpoints list as supported: with
  // `require_parameters` an unsupported one (e.g. parallel_tool_calls) would
  // leave no eligible endpoint.
  return {
    model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: request.toolChoice,
    stream: true,
    max_tokens: assistantLimits.maxOutputTokens,
    temperature: 0.2,
    reasoning: { exclude: true },
    provider: providerRouting(provider),
  };
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  provider: string;
  referer?: string;
  fetch?: typeof fetch;
}

function retryAfter(headers: Headers): number | undefined {
  const reset = Number(headers.get("x-ratelimit-reset") ?? headers.get("retry-after"));
  if (!Number.isFinite(reset) || reset <= 0) return undefined;
  // OpenRouter reports an epoch timestamp in milliseconds; Retry-After uses seconds.
  if (reset > 1e12) return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  if (reset > 1e9) return Math.max(1, Math.ceil(reset - Date.now() / 1000));
  return Math.ceil(reset);
}

async function errorFor(response: Response): Promise<ModelError> {
  const body = await response.text().catch(() => "");
  if (response.status === 429) return new ModelError("rate_limited", "The model's free capacity is used up.", retryAfter(response.headers));
  if (response.status === 402) return new ModelError("payment_required", "The model gateway refused the request (402).");
  if (response.status === 404 || /no endpoints/i.test(body)) return new ModelError("model_unavailable", "The reviewed model is not available under the required routing.");
  if (response.status === 408) return new ModelError("timeout", "The model timed out.");
  return new ModelError(response.status >= 500 ? "unavailable" : "bad_response", `The model gateway returned ${response.status}.`);
}

function finishReason(value: unknown): FinishReason {
  return value === "stop" || value === "tool_calls" || value === "length" ? value : "other";
}

/** Parses OpenRouter's OpenAI-compatible SSE stream into text and a single finish chunk. */
export async function* parseOpenRouterStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ModelChunk> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const calls: { id: string; name: string; arguments: string }[] = [];
  let reason: FinishReason | undefined;
  let usage = { inputTokens: 0, outputTokens: 0, cost: undefined as number | undefined };
  let servedBy: string | undefined;
  let buffer = "";
  let done = false;
  try {
    while (!done) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        // Blank lines separate events; ":" lines are keep-alive comments (": OPENROUTER PROCESSING").
        if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { done = true; break; }
        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(payload) as Record<string, unknown>; } catch { throw new ModelError("bad_response", "The model stream was malformed."); }
        // Errors after headers arrive in-band with HTTP 200.
        if (chunk.error) throw new ModelError("unavailable", "The model stopped with an error mid-stream.");
        if (typeof chunk.provider === "string") servedBy = chunk.provider;
        const choice = (chunk.choices as Record<string, unknown>[] | undefined)?.[0];
        const delta = choice?.delta as { content?: unknown; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } | undefined;
        if (typeof delta?.content === "string" && delta.content) yield { type: "text", text: delta.content };
        for (const part of delta?.tool_calls ?? []) {
          const index = part.index ?? calls.length;
          calls[index] ??= { id: "", name: "", arguments: "" };
          if (part.id) calls[index].id = part.id;
          if (part.function?.name) calls[index].name += part.function.name;
          if (part.function?.arguments) calls[index].arguments += part.function.arguments;
        }
        if (choice?.finish_reason === "error") throw new ModelError("unavailable", "The model stopped with an error mid-stream.");
        // finish_reason appears twice (last content chunk and the usage chunk); keep the first.
        if (choice?.finish_reason && !reason) reason = finishReason(choice.finish_reason);
        const reported = chunk.usage as { prompt_tokens?: number; completion_tokens?: number; cost?: number } | undefined;
        if (reported) usage = { inputTokens: reported.prompt_tokens ?? 0, outputTokens: reported.completion_tokens ?? 0, cost: reported.cost };
      }
    }
  } finally {
    reader.releaseLock();
  }
  const toolCalls: ToolCall[] = calls.filter(Boolean).filter((call) => call.name).map((call, index) => ({ id: call.id || `call_${index}`, type: "function", function: { name: call.name, arguments: call.arguments } }));
  yield { type: "finish", reason: reason ?? (toolCalls.length ? "tool_calls" : "other"), toolCalls, usage, servedBy };
}

export function createOpenRouterModel(options: OpenRouterOptions): ChatModel {
  if (!options.apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  if (!reviewedModels.some((reviewed) => reviewed.model === options.model && reviewed.provider === options.provider)) {
    throw new Error("MOSAIC_AI_MODEL / MOSAIC_AI_PROVIDER is not a reviewed pair.");
  }
  const send = options.fetch ?? fetch;
  return {
    id: options.model,
    async *complete(request) {
      let response: Response;
      try {
        response = await send(openRouterEndpoint, {
          method: "POST",
          signal: request.signal,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            ...(options.referer ? { "http-referer": options.referer } : {}),
            "x-title": "Mosaic",
          },
          body: JSON.stringify(buildRequestBody(options.model, options.provider, request)),
        });
      } catch (error) {
        if (request.signal.aborted) throw error;
        throw new ModelError("unavailable", "The model gateway could not be reached.");
      }
      if (!response.ok) throw await errorFor(response);
      if (!response.body) throw new ModelError("bad_response", "The model returned no stream.");
      yield* parseOpenRouterStream(response.body);
    },
  };
}
