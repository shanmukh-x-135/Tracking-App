import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "../src/lib/api/errors";
import { bearerTokenFromAuthorization, resolveAuthenticatedIdentity } from "../src/lib/auth/request-auth";

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
