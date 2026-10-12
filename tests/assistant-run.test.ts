import assert from "node:assert/strict";
import test from "node:test";
import { assistantEventSchema, assistantLimits, type AssistantEvent } from "../src/lib/assistant/contract";
import { ModelError } from "../src/lib/assistant/model";
import { buildRequestBody, createOpenRouterModel, parseOpenRouterStream, providerRouting, reviewedModels } from "../src/lib/assistant/openrouter-model";
import { RefTable } from "../src/lib/assistant/references";
import { emptySummary, runAssistant } from "../src/lib/assistant/run";
import { demoModel, scriptedModel } from "../src/lib/assistant/scripted-model";
import type { ToolContext } from "../src/lib/assistant/tools";
import { assistantFixtureState, fixtureCatalog } from "./fixtures/assistant-state";

const ctx = (): ToolContext => ({ getState: async () => assistantFixtureState(), catalog: fixtureCatalog(), refs: new RefTable(), now: new Date("2026-10-12T12:00:00.000Z") });

async function collect(events: AsyncIterable<AssistantEvent>) {
  const out: AssistantEvent[] = [];
  for await (const event of events) out.push(assistantEventSchema.parse(event));
  return out;
}
const text = (events: AssistantEvent[]) => events.filter((event) => event.type === "text").map((event) => (event as { delta: string }).delta).join("");

test("a tool round then a cited answer streams text, refs, scope and done", async () => {
  const model = scriptedModel([
    { toolCalls: [{ name: "ratings_query", arguments: { mediaType: "movie", limit: 2 } }] },
    { text: ["Your top film is [[r", "1]], then [[r2]]. Also [[r77]]."] },
  ]);
  const events = await collect(runAssistant({ model, ctx: ctx(), message: "Which movies did I rate highest?", history: [], signal: new AbortController().signal }));
  assert.deepEqual(events.map((event) => event.type).filter((type, index, all) => type !== all[index - 1]), ["status", "refs", "text", "scope", "done"]);
  assert.equal(text(events), "Your top film is [[r1]], then [[r2]]. Also .");
  const done = events.at(-1) as Extract<AssistantEvent, { type: "done" }>;
  assert.deepEqual(done.cited, ["r1", "r2"]);
  assert.deepEqual([done.usage.modelCalls, done.usage.toolCalls], [2, 1]);
  const refs = (events[1] as Extract<AssistantEvent, { type: "refs" }>).refs;
  assert.equal(refs[0].media.title, "Night Harbor");
  assert.equal(refs[0].facts?.userRating, 5, "card facts come from state, not prose");
  // The model saw the tool result as a tool message tied to its call id.
  const second = model.requests[1].messages;
  assert.equal(second.at(-1)?.role, "tool");
  assert.equal(second.at(-2)?.role, "assistant");
});

test("model calls and tool calls are capped; the last call disables tools", async () => {
  const loop = { toolCalls: [{ name: "library_query", arguments: {} }, { name: "library_query", arguments: {} }, { name: "library_query", arguments: {} }] };
  const model = scriptedModel([loop, loop, { text: "Done." }]);
  const summary = emptySummary();
  const events = await collect(runAssistant({ model, ctx: ctx(), message: "x", history: [], signal: new AbortController().signal }, summary));
  assert.equal(summary.modelCalls, assistantLimits.modelCalls);
  assert.equal(summary.toolCalls, assistantLimits.toolCalls);
  assert.deepEqual(model.requests.map((request) => request.toolChoice), ["auto", "auto", "none"]);
  // Every tool call (including over-budget ones) got a tool result.
  const lastRequest = model.requests[2].messages;
  const calls = lastRequest.filter((message) => message.role === "assistant").flatMap((message) => (message.role === "assistant" ? message.tool_calls ?? [] : []));
  const results = lastRequest.filter((message) => message.role === "tool");
  assert.equal(calls.length, results.length);
  assert.equal(text(events), "Done.");
});

test("tool calls requested on the final, tools-off call are ignored, never executed", async () => {
  const model = scriptedModel([
    { toolCalls: [{ name: "library_query", arguments: {} }] },
    { toolCalls: [{ name: "library_query", arguments: {} }] },
    { text: "Answer.", toolCalls: [{ name: "ratings_query", arguments: {} }] },
  ]);
  const summary = emptySummary();
  await collect(runAssistant({ model, ctx: ctx(), message: "x", history: [], signal: new AbortController().signal }, summary));
  assert.deepEqual(summary.toolNames, ["library_query", "library_query"]);
});

test("a tool call written as plain text is shown as text, never executed", async () => {
  const summary = emptySummary();
  const model = scriptedModel([{ text: "<tool_call>{\"name\":\"library_query\"}</tool_call>" }]);
  const events = await collect(runAssistant({ model, ctx: ctx(), message: "x", history: [], signal: new AbortController().signal }, summary));
  assert.equal(summary.toolCalls, 0);
  assert.ok(text(events).includes("tool_call"));
});

test("invalid tool arguments are reported to the model, not executed", async () => {
  let loads = 0;
  const context = ctx();
  context.getState = async () => { loads += 1; return assistantFixtureState(); };
  const model = scriptedModel([{ toolCalls: [{ name: "library_query", arguments: "{\"limit\": 9000}" }] }, { text: "Sorry." }]);
  await collect(runAssistant({ model, ctx: context, message: "x", history: [], signal: new AbortController().signal }));
  assert.equal(loads, 0);
  assert.match((model.requests[1].messages.at(-1) as { content: string }).content, /Invalid arguments/);
});

test("an empty answer is retried once, then reported", async () => {
  const recovered = scriptedModel([{ text: "" }, { text: "Hello." }]);
  assert.equal(text(await collect(runAssistant({ model: recovered, ctx: ctx(), message: "x", history: [], signal: new AbortController().signal }))), "Hello.");
  const empty = scriptedModel([{ text: "" }, { text: "" }]);
  await assert.rejects(collect(runAssistant({ model: empty, ctx: ctx(), message: "x", history: [], signal: new AbortController().signal })), (error: unknown) => error instanceof ModelError && error.kind === "bad_response");
});

test("a length stop marks the answer truncated", async () => {
  const events = await collect(runAssistant({ model: scriptedModel([{ text: "Partial", reason: "length" }]), ctx: ctx(), message: "x", history: [], signal: new AbortController().signal }));
  assert.equal((events.at(-1) as Extract<AssistantEvent, { type: "done" }>).truncated, true);
});

test("history is plain text; stale ref tokens are stripped and the context is fixed", async () => {
  const model = scriptedModel([{ text: "ok" }]);
  await collect(runAssistant({ model, ctx: ctx(), message: "and now?", about: "mock:book:salt-archive", history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Try [[r1]] next" }], signal: new AbortController().signal }));
  const messages = model.requests[0].messages;
  assert.deepEqual(messages.map((message) => message.role), ["system", "system", "user", "assistant", "user"]);
  assert.equal((messages[3] as { content: string }).content, "Try  next");
  assert.match((messages[1] as { content: string }).content, /2026-10-12.*mock:book:salt-archive/);
});

test("abort stops the loop without further model calls", async () => {
  const controller = new AbortController();
  const model = scriptedModel(() => { controller.abort(); return { toolCalls: [{ name: "library_query", arguments: {} }] }; });
  const events = await collect(runAssistant({ model, ctx: ctx(), message: "x", history: [], signal: controller.signal }));
  assert.equal(model.requests.length, 1);
  assert.ok(!events.some((event) => event.type === "done"));
});

test("the demo model answers from tools, refuses writes and other users", async () => {
  for (const [question, expected] of [
    ["What should I watch next from my watchlist?", /\[\[r\d+\]\]/],
    ["Mark Night Harbor as watched", /only read your Mosaic/],
    ["What is my friend watching?", /only see your own Mosaic/],
    ["What's on my lists?", /Rainy day \(2\)/],
  ] as const) {
    const events = await collect(runAssistant({ model: demoModel(), ctx: ctx(), message: question, history: [], signal: new AbortController().signal }));
    assert.match(text(events), expected, question);
  }
});

// --- OpenRouter adapter -----------------------------------------------------

const sse = (...lines: string[]) => new Response(lines.map((line) => `${line}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const data = (value: unknown) => `data: ${JSON.stringify(value)}`;

function recordingFetch(response: () => Response) {
  const bodies: Record<string, unknown>[] = [];
  const headers: Record<string, string>[] = [];
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return response();
  }) as typeof fetch;
  return { fetcher, bodies, headers };
}

const request = { messages: [{ role: "user" as const, content: "hi" }], tools: [], toolChoice: "auto" as const, signal: new AbortController().signal };

async function drain(model: ReturnType<typeof createOpenRouterModel>) {
  const chunks = [];
  for await (const chunk of model.complete(request)) chunks.push(chunk);
  return chunks;
}

test("every OpenRouter request carries zero-retention, Novita-only, zero-price routing and no model fallback", async () => {
  const { fetcher, bodies, headers } = recordingFetch(() => sse(data({ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] }), "data: [DONE]"));
  const model = createOpenRouterModel({ apiKey: "test-key", model: reviewedModels[0].model, provider: "novita", fetch: fetcher });
  await drain(model);
  const body = bodies[0];
  assert.deepEqual(body.provider, { zdr: true, data_collection: "deny", only: ["novita"], allow_fallbacks: false, require_parameters: true, max_price: { prompt: 0, completion: 0 } });
  assert.equal(body.model, "apodex/apodex-1.1-mini:free");
  assert.ok(!("models" in body), "no fallback model list");
  assert.ok(!("parallel_tool_calls" in body), "not supported by the reviewed endpoint, so it would block routing");
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, assistantLimits.maxOutputTokens);
  assert.equal(headers[0].authorization, "Bearer test-key");
  assert.deepEqual(providerRouting("novita").max_price, { prompt: 0, completion: 0 });
  assert.deepEqual(Object.keys(buildRequestBody("m", "novita", { messages: [], tools: [], toolChoice: "none" })).sort(), ["max_tokens", "messages", "model", "provider", "reasoning", "stream", "temperature", "tool_choice", "tools"]);
});

test("only reviewed model/provider pairs can be constructed", () => {
  assert.throws(() => createOpenRouterModel({ apiKey: "k", model: "google/gemma-4-31b-it:free", provider: "novita" }), /reviewed pair/);
  assert.throws(() => createOpenRouterModel({ apiKey: "k", model: reviewedModels[0].model, provider: "google-ai-studio" }), /reviewed pair/);
  assert.throws(() => createOpenRouterModel({ apiKey: "", model: reviewedModels[0].model, provider: "novita" }), /OPENROUTER_API_KEY/);
});

test("the SSE parser assembles fragmented tool calls, skips keep-alives and reads the usage frame", async () => {
  const stream = sse(
    ": OPENROUTER PROCESSING",
    data({ provider: "Novita", choices: [{ delta: { content: "Let me check. " } }] }),
    data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "library_", arguments: "{\"sta" } }] } }] }),
    data({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "query", arguments: "tus\":\"watchlist\"}" } }] } }] }),
    data({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    data({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 812, completion_tokens: 31, cost: 0 } }),
    "data: [DONE]",
  ).body!;
  const chunks = [];
  for await (const chunk of parseOpenRouterStream(stream)) chunks.push(chunk);
  assert.deepEqual(chunks[0], { type: "text", text: "Let me check. " });
  assert.deepEqual(chunks[1], { type: "finish", reason: "tool_calls", toolCalls: [{ id: "call_a", type: "function", function: { name: "library_query", arguments: "{\"status\":\"watchlist\"}" } }], usage: { inputTokens: 812, outputTokens: 31, cost: 0 }, servedBy: "Novita" });
});

test("a mid-stream error with HTTP 200 fails the request", async () => {
  const stream = sse(data({ choices: [{ delta: { content: "Par" } }] }), data({ error: { code: 502, message: "upstream secret detail" }, choices: [{ delta: {}, finish_reason: "error" }] })).body!;
  await assert.rejects(async () => { for await (const _ of parseOpenRouterStream(stream)) void _; }, (error: unknown) => error instanceof ModelError && error.kind === "unavailable" && !error.message.includes("secret"));
});

test("gateway statuses map to typed errors without leaking upstream bodies", async () => {
  const reset = String(Date.now() + 90_000);
  for (const [status, body, kind, headers] of [
    [429, "{\"error\":\"rate\"}", "rate_limited", { "x-ratelimit-reset": reset }],
    [402, "{\"error\":\"negative balance\"}", "payment_required", {}],
    [404, "{\"error\":\"model\"}", "model_unavailable", {}],
    [400, "{\"error\":{\"message\":\"No endpoints found matching your data policy\"}}", "model_unavailable", {}],
    [503, "{}", "unavailable", {}],
  ] as const) {
    const { fetcher } = recordingFetch(() => new Response(body, { status, headers }));
    const model = createOpenRouterModel({ apiKey: "k", model: reviewedModels[0].model, provider: "novita", fetch: fetcher });
    await assert.rejects(drain(model), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.kind, kind, String(status));
      assert.ok(!error.message.includes("balance") && !error.message.includes("policy"));
      if (kind === "rate_limited") assert.ok(error.retryAfterSeconds! > 80 && error.retryAfterSeconds! <= 90);
      return true;
    });
  }
});
