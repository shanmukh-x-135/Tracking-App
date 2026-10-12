import { ModelError, type ChatMessage, type ChatModel, type FinishReason, type ModelChunk, type ToolCall } from "@/lib/assistant/model";

/** Deterministic stand-ins for a real model: CI and mock mode never call a model provider. */

export interface ScriptStep {
  text?: string | string[];
  toolCalls?: { name: string; arguments: string | Record<string, unknown> }[];
  reason?: FinishReason;
  error?: ModelError;
}

type Script = ScriptStep[] | ((messages: ChatMessage[], call: number) => ScriptStep);

/** Replays fixed steps (or a function of the conversation), recording every request for assertions. */
export function scriptedModel(script: Script) {
  const requests: { messages: ChatMessage[]; toolChoice: "auto" | "none" }[] = [];
  const model: ChatModel & { requests: typeof requests } = {
    id: "scripted",
    requests,
    async *complete(request): AsyncGenerator<ModelChunk> {
      requests.push({ messages: structuredClone(request.messages), toolChoice: request.toolChoice });
      const call = requests.length - 1;
      const step = typeof script === "function" ? script(request.messages, call) : script[call];
      if (!step) throw new ModelError("bad_response", "Script exhausted.");
      if (step.error) throw step.error;
      for (const text of Array.isArray(step.text) ? step.text : step.text ? [step.text] : []) {
        if (request.signal.aborted) return;
        yield { type: "text", text };
      }
      const toolCalls: ToolCall[] = (step.toolCalls ?? []).map((tool, index) => ({ id: `call_${call}_${index}`, type: "function", function: { name: tool.name, arguments: typeof tool.arguments === "string" ? tool.arguments : JSON.stringify(tool.arguments) } }));
      yield { type: "finish", reason: step.reason ?? (toolCalls.length ? "tool_calls" : "stop"), toolCalls, usage: { inputTokens: 0, outputTokens: 0, cost: 0 }, servedBy: "scripted" };
    },
  };
  return model;
}

function chunks(text: string): string[] {
  return text.match(/[\s\S]{1,14}/g) ?? [];
}

function pickTool(question: string): ScriptStep {
  const q = question.toLowerCase();
  if (/^(please\s+)?(mark|log|add|rate|delete|remove|edit|change|set)\b/.test(q.trim())) return { text: chunks("I can only read your Mosaic, not change it. Use Quick Log or the title's page to log, rate or edit it.") };
  if (/\b(friend|another user|someone else|other people|other users)\b/.test(q)) return { text: chunks("I can only see your own Mosaic, so I can't answer questions about other people's activity.") };
  const call = (name: string, args: Record<string, unknown> = {}): ScriptStep => ({ toolCalls: [{ name, arguments: args }] });
  if (/\blists?\b/.test(q)) return call("list_query");
  if (/\b(recommend|similar|suggest)/.test(q)) return call("ratings_query", { min: 4, order: "highest", limit: 3 });
  if (/\b(rated|rating|highest|best)\b/.test(q)) return call("ratings_query", { order: "highest", limit: 5 });
  if (/\bplaying\b/.test(q)) return call("library_query", { mediaType: "game", status: "playing" });
  if (/\b(watchlist|watch next)\b/.test(q)) return call("library_query", { status: "watchlist", limit: 5 });
  if (/\b(stats|how many)\b/.test(q)) return call("stats_summary");
  if (/\b(log|logged|month|week|activity)\b/.test(q)) return call("activity_query", { limit: 8 });
  if (/\b(episode|reading|progress|continue|far)\b/.test(q)) return call("continue_items");
  return call("library_query", { limit: 6 });
}

function answerFromTool(content: string): ScriptStep {
  let data: { error?: string; items?: { ref?: string }[]; lists?: { title?: string; itemCount?: number }[]; ref?: string; total?: number } = {};
  try { data = JSON.parse(content); } catch { /* treated as empty */ }
  if (data.error) return { text: chunks("I couldn't find that in your Mosaic.") };
  if (data.lists) return { text: chunks(data.lists.length ? `You have ${data.lists.length} saved ${data.lists.length === 1 ? "list" : "lists"}: ${data.lists.map((list) => `${list.title} (${list.itemCount})`).join(", ")}.` : "You don't have any saved lists yet.") };
  const refs = [...(data.ref ? [data.ref] : []), ...(data.items ?? []).map((item) => item.ref).filter((ref): ref is string => Boolean(ref))];
  if (!refs.length) return { text: chunks("I didn't find anything matching that in your Mosaic yet.") };
  return { text: chunks(`From your Mosaic: ${refs.slice(0, 5).map((ref) => `[[${ref}]]`).join(", ")}.`) };
}

/** Keyword-driven demo model for mock mode and browser tests. Never used in live data mode. */
export function demoModel(): ChatModel {
  return scriptedModel((messages) => {
    const last = messages.at(-1);
    if (last?.role === "tool") return answerFromTool(last.content);
    const question = [...messages].reverse().find((message) => message.role === "user");
    return pickTool(question?.role === "user" ? question.content : "");
  });
}
