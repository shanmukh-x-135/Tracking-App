import { NextResponse, type NextRequest } from "next/server";
import { isLiveMode } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

function safePath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/library";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!isLiveMode()) return NextResponse.redirect(new URL(safePath(url.searchParams.get("next")), url.origin));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=callback_failed" : safePath(url.searchParams.get("next")), url.origin));
}
