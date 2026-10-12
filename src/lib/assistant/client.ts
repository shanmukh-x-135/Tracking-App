import { apiErrorMessage } from "@/lib/api/errors";
import { assistantEventSchema, type AssistantEvent, type AssistantRef } from "@/lib/assistant/contract";
import type { MosaicState } from "@/lib/persistence/types";

export class AssistantRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/** Sends one question and reads the NDJSON event stream. Throws `AssistantRequestError` for pre-stream failures. */
export async function askMosaic(input: { message: string; history: { role: "user" | "assistant"; text: string }[]; about?: string; mockState?: MosaicState; signal: AbortSignal; onEvent(event: AssistantEvent): void }): Promise<void> {
  const response = await fetch("/api/me/assistant", {
    method: "POST",
    signal: input.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: input.message, history: input.history, ...(input.about ? { about: input.about } : {}), ...(input.mockState ? { mockState: input.mockState } : {}) }),
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    const retry = Number(response.headers.get("retry-after"));
    throw new AssistantRequestError(apiErrorMessage(body, "Mosaic AI couldn't answer right now."), response.status, body?.error?.code, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const parsed = assistantEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) input.onEvent(parsed.data);
    }
    if (done) break;
  }
}

/** Replaces `[[rN]]` tokens with their titles, for history and plain-text contexts. */
export function plainAnswer(text: string, refs: Map<string, AssistantRef>): string {
  return text.replace(/\[\[(r\d+)\]\]/g, (_, id: string) => refs.get(id)?.media.title ?? "");
}
