import { NextResponse, type NextRequest } from "next/server";
import { getOAuthSiteOrigin, safeReturnPath } from "@/lib/auth/return-path";
import { isLiveMode } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const siteOrigin = getOAuthSiteOrigin(url.origin);
  if (!isLiveMode()) return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), siteOrigin));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", siteOrigin));

  const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=callback_failed" : safeReturnPath(url.searchParams.get("next")), siteOrigin));
}
