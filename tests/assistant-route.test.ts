import assert from "node:assert/strict";
import test from "node:test";
import { assistantEventSchema } from "../src/lib/assistant/contract";
import { createAssistantHandler, type AssistantDependencies } from "../src/lib/assistant/handler";
import { createLimiter } from "../src/lib/assistant/limits";
import { ModelError } from "../src/lib/assistant/model";
import { demoModel, scriptedModel } from "../src/lib/assistant/scripted-model";
import { emptyMosaicState, type MosaicState } from "../src/lib/persistence/types";
import { assistantFixtureState, fixtureCatalog } from "./fixtures/assistant-state";

type Deps = AssistantDependencies<string>;

function setup(overrides: Partial<Deps> = {}) {
  const loads: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: Deps = {
    dataMode: "live",
    async getAuthenticatedUser(request) {
      const token = request.headers.get("authorization");
      return token === "Bearer alice" ? { id: "alice-id", client: "alice-client" } : token === "Bearer bob" ? { id: "bob-id", client: "bob-client" } : undefined;
    },
    async loadState(client, userId) { loads.push(`${client}:${userId}`); return userId === "alice-id" ? assistantFixtureState() : emptyMosaicState(); },
    catalog: fixtureCatalog(),
    enabled: true,
    allowedUsers: ["alice-id", "bob-id"],
    createModel: () => demoModel(),
    createMockModel: () => { throw new Error("mock model must not be used in live mode"); },
    limiter: createLimiter({ perUser: 100, windowMs: 60_000, perDay: 1000 }),
    now: () => new Date("2026-10-12T12:00:00.000Z"),
    log: (entry) => logs.push(entry),
    ...overrides,
  };
  return { handler: createAssistantHandler(deps), loads, logs };
}

const post = (body: unknown, user?: string, headers: Record<string, string> = {}) => new Request("https://mosaic.test/api/me/assistant", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
  headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}` } : {}), ...headers },
});

async function events(response: Response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /application\/x-ndjson/);
  return (await response.text()).trim().split("\n").map((line) => assistantEventSchema.parse(JSON.parse(line)));
}

test("signed-out requests are rejected before anything loads", async () => {
  const { handler, loads } = setup();
  const response = await handler(post({ message: "What's on my watchlist?" }));
  assert.equal(response.status, 401);
  assert.equal(loads.length, 0);
});

test("the kill switch is checked before any model or data access", async () => {
  let built = 0;
  const { handler, loads } = setup({ enabled: false, createModel: () => { built += 1; return demoModel(); } });
  const response = await handler(post({ message: "hi" }, "alice"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "ASSISTANT_UNAVAILABLE");
  assert.deepEqual([built, loads.length], [0, 0]);
});

test("the private beta allowlist blocks other signed-in users; * opens it", async () => {
  const closed = setup({ allowedUsers: ["bob-id"] });
  assert.equal((await closed.handler(post({ message: "hi" }, "alice"))).status, 403);
  assert.equal((await setup({ allowedUsers: [] }).handler(post({ message: "hi" }, "alice"))).status, 403, "empty allowlist admits nobody");
  assert.equal((await setup({ allowedUsers: ["*"] }).handler(post({ message: "hi" }, "alice"))).status, 200);
});

test("a missing or unreviewed model configuration is a 503, not a fallback", async () => {
  const { handler } = setup({ createModel: () => null });
  const response = await handler(post({ message: "hi" }, "alice"));
  assert.equal(response.status, 503);
});

test("each user only ever reads their own records; client-supplied identities and state are rejected", async () => {
  const { handler, loads } = setup();
  const alice = await events(await handler(post({ message: "What should I watch next from my watchlist?" }, "alice")));
  assert.deepEqual(loads, ["alice-client:alice-id"]);
  assert.ok(alice.some((event) => event.type === "refs"));
  const bob = await events(await handler(post({ message: "What should I watch next from my watchlist?" }, "bob")));
  assert.deepEqual(loads, ["alice-client:alice-id", "bob-client:bob-id"]);
  assert.ok(!bob.some((event) => event.type === "refs"), "Bob's empty library yields no titles");
  for (const body of [
    { message: "hi", userId: "alice-id" },
    { message: "hi", mockState: assistantFixtureState() },
    { message: "" },
    { message: "x".repeat(1001) },
    { message: "hi", history: Array.from({ length: 9 }, () => ({ role: "user", text: "x" })) },
    { message: "hi", about: "not-a-key" },
    "{bad json",
  ]) assert.equal((await handler(post(body, "bob"))).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal(loads.length, 2);
});

test("an answer streams as NDJSON events ending in done", async () => {
  const { handler, logs } = setup();
  const stream = await events(await handler(post({ message: "Which movies did I rate highest?" }, "alice")));
  assert.equal(stream.at(-1)!.type, "done");
  const done = stream.at(-1) as Extract<typeof stream[number], { type: "done" }>;
  assert.ok(done.cited.length > 0);
  // Logs carry metadata only: no message text and no titles.
  const logged = JSON.stringify(logs);
  assert.ok(!/rate highest|Night Harbor/.test(logged));
  assert.equal(logs[0].outcome, "ok");
});

test("upstream rate limits before streaming become a 429 with Retry-After", async () => {
  const { handler } = setup({ createModel: () => scriptedModel([{ error: new ModelError("rate_limited", "x", 120) }]) });
  const response = await handler(post({ message: "hi" }, "alice"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  assert.equal(response.headers.get("x-mosaic-limit-scope"), "service");
  assert.equal((await response.json()).error.code, "RATE_LIMITED");
});

test("model unavailability before streaming is a 503; after streaming starts it is an error event", async () => {
  const early = setup({ createModel: () => scriptedModel([{ error: new ModelError("model_unavailable", "x") }]) });
  assert.equal((await early.handler(post({ message: "hi" }, "alice"))).status, 503);
  const late = setup({ createModel: () => scriptedModel([{ toolCalls: [{ name: "library_query", arguments: {} }] }, { error: new ModelError("unavailable", "x") }]) });
  const stream = await events(await late.handler(post({ message: "hi" }, "alice")));
  assert.deepEqual(stream.at(-1), { type: "error", code: "ASSISTANT_UNAVAILABLE", message: "Mosaic AI couldn't finish that answer. Try again in a moment.", retryable: true });
});

test("the per-user limiter answers 429 with its scope", async () => {
  const { handler } = setup({ limiter: createLimiter({ perUser: 1, windowMs: 60_000, perDay: 1000 }) });
  assert.equal((await handler(post({ message: "hi" }, "alice"))).status, 200);
  const limited = await handler(post({ message: "hi" }, "alice"));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("x-mosaic-limit-scope"), "user");
  assert.equal((await handler(post({ message: "hi" }, "bob"))).status, 200, "other users keep their own window");
});

test("the limiter's daily service cap and window reset", () => {
  let time = Date.parse("2026-10-12T23:59:00.000Z");
  const limiter = createLimiter({ perUser: 2, windowMs: 60_000, perDay: 3 }, () => time);
  assert.ok(limiter.take("a").allowed && limiter.take("a").allowed);
  assert.equal(limiter.take("a").scope, "user");
  assert.ok(limiter.take("b").allowed);
  const capped = limiter.take("c");
  assert.deepEqual([capped.allowed, capped.scope, capped.retryAfterSeconds], [false, "service", 60]);
  time += 120_000;
  assert.ok(limiter.take("c").allowed, "a new UTC day resets the count");
});

test("mock mode uses the client fixture and the scripted model, never authentication or a live model", async () => {
  let liveBuilt = 0;
  const { handler } = setup({
    dataMode: "mock",
    getAuthenticatedUser: async () => { throw new Error("not in mock mode"); },
    createModel: () => { liveBuilt += 1; return demoModel(); },
    createMockModel: demoModel,
    enabled: false,
  });
  const stream = await events(await handler(post({ message: "What's on my lists?", mockState: assistantFixtureState() })));
  assert.match(stream.filter((event) => event.type === "text").map((event) => (event as { delta: string }).delta).join(""), /Rainy day/);
  assert.equal(liveBuilt, 0);
  assert.equal((await handler(post({ message: "hi", mockState: { library: "nope" } }))).status, 400);
  // Mock requests never spend the limiter (no model is reached).
  const strict = setup({ dataMode: "mock", createMockModel: demoModel, limiter: createLimiter({ perUser: 1, windowMs: 60_000, perDay: 1 }) });
  for (let index = 0; index < 3; index += 1) assert.equal((await strict.handler(post({ message: "hi", mockState: {} }))).status, 200);
});

test("data loading failures are a 500 without details", async () => {
  const { handler } = setup({ loadState: async (): Promise<MosaicState> => { throw new Error("relation \"secret_table\" does not exist"); } });
  const response = await handler(post({ message: "What should I watch next from my watchlist?" }, "alice"));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("secret_table"));
});
