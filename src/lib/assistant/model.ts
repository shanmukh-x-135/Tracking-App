/** Provider-neutral chat model seam. Only `openrouter-model.ts` talks to a real model. */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type FinishReason = "stop" | "tool_calls" | "length" | "other";

export type ModelChunk =
  | { type: "text"; text: string }
  | { type: "finish"; reason: FinishReason; toolCalls: ToolCall[]; usage: { inputTokens: number; outputTokens: number; cost?: number }; servedBy?: string };

export interface ModelRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  toolChoice: "auto" | "none";
  signal: AbortSignal;
}

export interface ChatModel {
  readonly id: string;
  complete(request: ModelRequest): AsyncIterable<ModelChunk>;
}

export type ModelErrorKind = "rate_limited" | "unavailable" | "payment_required" | "model_unavailable" | "bad_response" | "timeout";

/** A failure from the model gateway. Messages never contain upstream bodies or user content. */
export class ModelError extends Error {
  constructor(readonly kind: ModelErrorKind, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "ModelError";
  }
}
