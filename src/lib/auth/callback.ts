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
    return NextResponse.redirect(location);
  };
  if (!dependencies.isLive) return redirect(safeNext);
  const code = url.searchParams.get("code");
  if (!code) return redirect("/login?error=missing_code");

  const { error } = await dependencies.exchangeCodeForSession(code);
  return redirect(error ? "/login?error=callback_failed" : safeNext);
}
