import { NextResponse, type NextRequest } from "next/server";
import { getOAuthSiteOrigin, safeReturnPath } from "@/lib/auth/return-path";

type CallbackDependencies = {
  isLive: boolean;
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
};

/**
 * Keeps the successful exchange branch testable without a real OAuth code or
 * a session mutation. The route supplies the production dependencies.
 */
export async function handleOAuthCallback(request: NextRequest, dependencies: CallbackDependencies): Promise<NextResponse> {
  const url = new URL(request.url);
  const siteOrigin = getOAuthSiteOrigin(url.origin);
  if (!dependencies.isLive) return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), siteOrigin));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", siteOrigin));

  const { error } = await dependencies.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/login?error=callback_failed" : safeReturnPath(url.searchParams.get("next")), siteOrigin));
}
