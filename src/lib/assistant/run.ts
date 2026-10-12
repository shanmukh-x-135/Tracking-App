import { assistantLimits, type AssistantEvent } from "@/lib/assistant/contract";
import { ModelError, type ChatMessage, type ChatModel, type ToolCall } from "@/lib/assistant/model";
import { contextMessage, systemPrompt } from "@/lib/assistant/prompt";
import { RefTextFilter, stripRefTokens } from "@/lib/assistant/references";
import { executeTool, toolDefinitions, type AssistantTool, type ToolContext } from "@/lib/assistant/tools";

export interface RunInput {
  model: ChatModel;
  ctx: ToolContext;
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  about?: string;
  signal: AbortSignal;
  tools?: AssistantTool[];
}

export interface RunSummary {
  modelCalls: number;
  toolCalls: number;
  toolNames: string[];
  inputTokens: number;
  outputTokens: number;
  servedBy: Set<string>;
  cost: number;
}

/**
 * The bounded tool loop. At most `modelCalls` requests and `toolCalls` tool
 * executions per question; the last allowed request disables tools so the
 * model must answer from what it already has. Model errors propagate so the
 * route can map them (before streaming) or emit an `error` event (after).
 */
export async function* runAssistant(input: RunInput, summary: RunSummary = emptySummary()): AsyncGenerator<AssistantEvent> {
  const tools = input.tools;
  const definitions = toolDefinitions(tools);
  const filter = new RefTextFilter((id) => Boolean(input.ctx.refs.get(id)));
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: contextMessage(input.ctx.now, input.about) },
    ...input.history.map((turn) => ({ role: turn.role, content: stripRefTokens(turn.text) }) as ChatMessage),
    { role: "user", content: input.message },
  ];
  const scope: { tool: string; summary: string }[] = [];
  let truncated = false;
  let answered = false;
  let emptyRetries = 0;

  while (summary.modelCalls < assistantLimits.modelCalls && !input.signal.aborted) {
    const toolsAllowed = summary.modelCalls < assistantLimits.modelCalls - 1 && summary.toolCalls < assistantLimits.toolCalls;
    summary.modelCalls += 1;
    let text = "";
    let toolCalls: ToolCall[] = [];
    let reason = "other";
    for await (const chunk of input.model.complete({ messages, tools: definitions, toolChoice: toolsAllowed ? "auto" : "none", signal: input.signal })) {
      if (chunk.type === "text") {
        text += chunk.text;
        const visible = filter.push(chunk.text);
        if (visible) yield { type: "text", delta: visible };
      } else {
        toolCalls = toolsAllowed ? chunk.toolCalls : [];
        reason = chunk.reason;
        summary.inputTokens += chunk.usage.inputTokens;
        summary.outputTokens += chunk.usage.outputTokens;
        summary.cost += chunk.usage.cost ?? 0;
        if (chunk.servedBy) summary.servedBy.add(chunk.servedBy);
      }
    }
    if (input.signal.aborted) return;

    if (!toolCalls.length) {
      if (!text.trim()) {
        if (emptyRetries++ === 0 && summary.modelCalls < assistantLimits.modelCalls) continue;
        throw new ModelError("bad_response", "The model returned an empty answer.");
      }
      truncated = reason === "length";
      answered = true;
      break;
    }

    messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      if (summary.toolCalls >= assistantLimits.toolCalls) {
        // Every tool_call needs a matching result; over-budget calls are answered, never executed.
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Tool budget reached. Answer from the data you have." }) });
        continue;
      }
      summary.toolCalls += 1;
      summary.toolNames.push(call.function.name);
      const result = await executeTool(input.ctx, call.function.name, call.function.arguments, tools);
      yield { type: "status", tool: call.function.name, label: result.label };
      if (result.scope) scope.push({ tool: call.function.name, summary: result.scope });
      const fresh = input.ctx.refs.takeFresh();
      if (fresh.length) yield { type: "refs", refs: fresh };
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }

  const rest = filter.flush();
  if (rest) yield { type: "text", delta: rest };
  if (!answered && !input.signal.aborted) throw new ModelError("bad_response", "The model did not finish an answer.");
  if (scope.length) yield { type: "scope", items: scope };
  yield {
    type: "done", truncated, cited: filter.cited,
    usage: { inputTokens: summary.inputTokens, outputTokens: summary.outputTokens, modelCalls: summary.modelCalls, toolCalls: summary.toolCalls },
  };
}

export function emptySummary(): RunSummary {
  return { modelCalls: 0, toolCalls: 0, toolNames: [], inputTokens: 0, outputTokens: 0, servedBy: new Set(), cost: 0 };
}
