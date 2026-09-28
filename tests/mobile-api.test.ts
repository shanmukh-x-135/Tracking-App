import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "../src/lib/api/errors";
import { bearerTokenFromAuthorization, resolveAuthenticatedIdentity } from "../src/lib/auth/request-auth";
import { createContinueGetHandler } from "../src/lib/api/continue-route";
import type { ContinueItem } from "../src/lib/current-media/projection";

test("Bearer parsing accepts only a non-empty Bearer credential", () => {
  assert.equal(bearerTokenFromAuthorization("Bearer token"), "token");
  assert.equal(bearerTokenFromAuthorization("bearer   token  "), "token");
  assert.equal(bearerTokenFromAuthorization("Basic token"), undefined);
  assert.equal(bearerTokenFromAuthorization("Bearer"), undefined);
});

test("request authentication uses a verified Bearer identity and fails closed for invalid tokens", async () => {
  const calls: string[] = [];
  const authenticate = {
    async cookie() {
      calls.push("cookie");
      return { client: "cookie-client", claims: { data: { claims: { sub: "cookie-user" } }, error: null } };
    },
    async bearer(token: string) {
      calls.push(`bearer:${token}`);
      return { client: "bearer-client", claims: { data: token === "valid" ? { claims: { sub: "token-user" } } : null, error: token === "valid" ? null : new Error("invalid") } };
    },
  };

  const bearer = await resolveAuthenticatedIdentity(new Request("https://mosaic.test/api/me", { headers: { authorization: "Bearer valid" } }), authenticate);
  assert.deepEqual(bearer, { id: "token-user", client: "bearer-client", source: "bearer" });
  assert.deepEqual(calls, ["bearer:valid"]);

  const invalid = await resolveAuthenticatedIdentity(new Request("https://mosaic.test/api/me", { headers: { authorization: "Bearer invalid" } }), authenticate);
  assert.equal(invalid, undefined);
  assert.equal(calls.at(-1), "bearer:invalid");

  const malformed = await resolveAuthenticatedIdentity(new Request("https://mosaic.test/api/me", { headers: { authorization: "Basic no" } }), authenticate);
  assert.equal(malformed, undefined);
  assert.equal(calls.at(-1), "bearer:invalid");
});

test("mobile clients can read both normalized and legacy error envelopes during rollout", () => {
  assert.equal(apiErrorMessage({ error: { code: "UNAUTHORIZED", message: "Authentication required." } }, "fallback"), "Authentication required.");
  assert.equal(apiErrorMessage({ error: "Older endpoint error." }, "fallback"), "Older endpoint error.");
  assert.equal(apiErrorMessage(null, "fallback"), "fallback");
});

test("Continue endpoint requires authentication and preserves the optional client limit", async () => {
  const item: ContinueItem = {
    id: "mock:game:game", mediaType: "game", provider: "mock", providerId: "game", title: "Game",
    status: "playing", lastActivityAt: "2026-03-01T00:00:00.000Z",
    progress: { percent: null, playtimeMinutes: 0 }, nextAction: { type: "update_game_playthrough" },
  };
  const unauthenticated = createContinueGetHandler({
    getAuthenticatedUser: async () => undefined,
    getCurrentMedia: async () => [item],
  });
  const denied = await unauthenticated(new Request("https://mosaic.test/api/me/continue"));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: { code: "UNAUTHORIZED", message: "Authentication required." } });

  let requestedLimit: number | undefined;
  const authenticated = createContinueGetHandler({
    getAuthenticatedUser: async () => ({ id: "user", client: "client" }),
    getCurrentMedia: async (_client, _userId, limit) => { requestedLimit = limit; return [item]; },
  });
  const response = await authenticated(new Request("https://mosaic.test/api/me/continue?limit=8"));
  assert.equal(response.status, 200);
  assert.equal(requestedLimit, 8);
  assert.deepEqual(await response.json(), { items: [item] });

  await authenticated(new Request("https://mosaic.test/api/me/continue"));
  assert.equal(requestedLimit, undefined);
});
