import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/auth/callback/route";
import { createOAuthCallbackUrl, safeReturnPath } from "../src/lib/auth/return-path";

test("OAuth return paths stay within Mosaic", () => {
  assert.equal(safeReturnPath("/home"), "/home");
  assert.equal(safeReturnPath("/book/dune?edition=deluxe#log"), "/book/dune?edition=deluxe#log");
  assert.equal(safeReturnPath("https://evil.example"), "/home");
  assert.equal(safeReturnPath("//evil.example"), "/home");
  assert.equal(safeReturnPath("/\\evil.example"), "/home");
});

test("Google OAuth returns to the active origin's home callback", () => {
  assert.equal(
    createOAuthCallbackUrl("https://mosaic-eight-theta.vercel.app", "/home"),
    "https://mosaic-eight-theta.vercel.app/auth/callback?next=%2Fhome",
  );
});

test("the callback redirects only to a validated path on the request origin", async () => {
  const previousMode = process.env.NEXT_PUBLIC_DATA_MODE;
  process.env.NEXT_PUBLIC_DATA_MODE = "mock";

  try {
    const successResponse = await GET(new NextRequest("https://preview.example/auth/callback?next=/home"));
    const unsafeResponse = await GET(new NextRequest("https://preview.example/auth/callback?next=/%5Cevil.example"));

    assert.equal(successResponse.headers.get("location"), "https://preview.example/home");
    assert.equal(unsafeResponse.headers.get("location"), "https://preview.example/home");
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = previousMode;
  }
});
