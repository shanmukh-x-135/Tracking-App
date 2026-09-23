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

test("Production OAuth always uses the configured canonical origin", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://mosaic-eight-theta.vercel.app";

  try {
    const callbackUrl = createOAuthCallbackUrl("https://mosaic-shanmukh-s-projects3.vercel.app", "/home");
    assert.equal(callbackUrl, "https://mosaic-eight-theta.vercel.app/auth/callback?next=%2Fhome");
    assert.ok(!callbackUrl.includes("mosaic-shanmukh-s-projects3.vercel.app"));
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test("the callback redirects only to a validated path on the request origin", async () => {
  const previousMode = process.env.NEXT_PUBLIC_DATA_MODE;
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_DATA_MODE = "mock";
  process.env.NEXT_PUBLIC_SITE_URL = "https://mosaic-eight-theta.vercel.app";

  try {
    const successResponse = await GET(new NextRequest("https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?next=/library"));
    const unsafeResponse = await GET(new NextRequest("https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?next=/%5Cevil.example"));

    assert.equal(successResponse.headers.get("location"), "https://mosaic-eight-theta.vercel.app/library");
    assert.equal(unsafeResponse.headers.get("location"), "https://mosaic-eight-theta.vercel.app/home");
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_DATA_MODE;
    else process.env.NEXT_PUBLIC_DATA_MODE = previousMode;
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});
