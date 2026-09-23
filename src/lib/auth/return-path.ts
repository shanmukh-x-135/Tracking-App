const validationOrigin = "https://mosaic.invalid";

function configuredSiteOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Uses the configured public site in Production and the active origin elsewhere. */
export function getOAuthSiteOrigin(activeOrigin: string): string {
  return configuredSiteOrigin() ?? activeOrigin;
}

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
  const callbackUrl = new URL("/auth/callback", getOAuthSiteOrigin(origin));
  callbackUrl.searchParams.set("next", safeReturnPath(returnTo));
  return callbackUrl.toString();
}
