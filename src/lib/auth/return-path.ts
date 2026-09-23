const validationOrigin = "https://mosaic.invalid";

/**
 * Keeps OAuth return targets on this application. Backslashes are rejected
 * because the URL parser treats them as path separators for special schemes.
 */
export function safeReturnPath(value: string | null, fallback = "/home"): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    return new URL(value, validationOrigin).origin === validationOrigin ? value : fallback;
  } catch {
    return fallback;
  }
}

export function createOAuthCallbackUrl(origin: string, returnTo: string | null): string {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", safeReturnPath(returnTo));
  return callbackUrl.toString();
}
