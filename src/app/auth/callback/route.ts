import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/return-path";
import { isLiveMode } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!isLiveMode()) return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), url.origin));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=callback_failed" : safeReturnPath(url.searchParams.get("next")), url.origin));
}
