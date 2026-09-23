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
  const safeNext = safeReturnPath(url.searchParams.get("next"));
  const redirect = (path: string): NextResponse => {
    const location = new URL(path, siteOrigin);
    // Temporary production trace: deliberately excludes callback query values,
    // OAuth codes, tokens, cookies, and all account information.
    console.info("oauth_callback.host_trace", JSON.stringify({
      request_host: url.host,
      forwarded_host: request.headers.get("x-forwarded-host") ?? "unavailable",
      canonical_host: new URL(siteOrigin).host,
      safe_next: safeNext,
      redirect_host: location.host,
      redirect_path: location.pathname,
    }));
    return NextResponse.redirect(location);
  };
  if (!dependencies.isLive) return redirect(safeNext);
  const code = url.searchParams.get("code");
  if (!code) return redirect("/login?error=missing_code");

  const { error } = await dependencies.exchangeCodeForSession(code);
  return redirect(error ? "/login?error=callback_failed" : safeNext);
}
