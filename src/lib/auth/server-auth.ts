import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnvironment } from "@/lib/config/env";
import { resolveAuthenticatedIdentity, type AuthSource } from "@/lib/auth/request-auth";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ServerClient = SupabaseClient<Database>;

export interface AuthenticatedUser {
  id: string;
  client: ServerClient;
  source: AuthSource;
}

export { bearerTokenFromAuthorization } from "@/lib/auth/request-auth";

function bearerClient(accessToken: string): ServerClient {
  const environment = getPublicEnvironment();
  if (environment.dataMode !== "live") throw new Error("Supabase authentication is only available in live data mode.");
  return createSupabaseClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    // The validated access token is also passed through to PostgREST so RLS
    // evaluates the same principal that authenticated this API request.
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Resolves one canonical identity for API routes. Cookie sessions retain the
 * existing web flow; a supplied Bearer token is verified by Supabase before
 * it is used for any user-scoped query.
 */
export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | undefined> {
  if (getPublicEnvironment().dataMode !== "live") return undefined;
  return resolveAuthenticatedIdentity(request, {
    async cookie() {
      const client = await createCookieClient();
      return { client, claims: await client.auth.getClaims() };
    },
    async bearer(accessToken) {
      const client = bearerClient(accessToken);
      return { client, claims: await client.auth.getClaims(accessToken) };
    },
  });
}
