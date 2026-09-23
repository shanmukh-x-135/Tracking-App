import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { handleOAuthCallback } from "../src/lib/auth/callback";
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

test("Local OAuth keeps the local origin when no canonical production URL is configured", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;

  try {
    assert.equal(
      createOAuthCallbackUrl("http://localhost:3000", "/home"),
      "http://localhost:3000/auth/callback?next=%2Fhome",
    );
  } finally {
    if (previousSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
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

test("a successful live callback always redirects to the canonical host", async () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://mosaic-eight-theta.vercel.app";

  try {
    const successfulHome = await handleOAuthCallback(new NextRequest("https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?code=test-code&next=/home"), { isLive: true, exchangeCodeForSession: async () => ({ error: null }) });
    const successfulLibrary = await handleOAuthCallback(new NextRequest("https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?code=test-code&next=/library"), { isLive: true, exchangeCodeForSession: async () => ({ error: null }) });
    const unsafeResponses = await Promise.all(["https://evil.example", "//evil.example", "\\evil", "/\\evil"].map((next) => handleOAuthCallback(new NextRequest(`https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?code=test-code&next=${encodeURIComponent(next)}`), { isLive: true, exchangeCodeForSession: async () => ({ error: null }) })));

    assert.equal(successfulHome.headers.get("location"), "https://mosaic-eight-theta.vercel.app/home");
    assert.equal(successfulLibrary.headers.get("location"), "https://mosaic-eight-theta.vercel.app/library");
    for (const response of unsafeResponses) assert.equal(response.headers.get("location"), "https://mosaic-eight-theta.vercel.app/home");
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});

test("the missing-code callback branch keeps the canonical host", async () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://mosaic-eight-theta.vercel.app";

  try {
    const missingCodeResponse = await handleOAuthCallback(new NextRequest("https://mosaic-shanmukh-s-projects3.vercel.app/auth/callback?next=/library"), { isLive: true, exchangeCodeForSession: async () => ({ error: null }) });

    assert.equal(missingCodeResponse.headers.get("location"), "https://mosaic-eight-theta.vercel.app/login?error=missing_code");
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
  }
});
