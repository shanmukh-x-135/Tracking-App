export type AuthSource = "bearer" | "cookie";

export interface AuthClaimsResult<Client> {
  client: Client;
  claims: { data: { claims?: { sub?: unknown } } | null; error: unknown | null };
}

export interface AuthenticatedIdentity<Client> {
  id: string;
  client: Client;
  source: AuthSource;
}

export function bearerTokenFromAuthorization(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  return token || undefined;
}

/**
 * Keeps authentication source selection testable and makes malformed headers
 * fail closed before any database client is created.
 */
export async function resolveAuthenticatedIdentity<Client>(
  request: Request,
  authenticate: {
    cookie(): Promise<AuthClaimsResult<Client>>;
    bearer(accessToken: string): Promise<AuthClaimsResult<Client>>;
  },
): Promise<AuthenticatedIdentity<Client> | undefined> {
  const accessToken = bearerTokenFromAuthorization(request.headers.get("authorization"));
  if (request.headers.has("authorization") && !accessToken) return undefined;
  const result = accessToken
    ? await authenticate.bearer(accessToken)
    : await authenticate.cookie();
  const userId = typeof result.claims.data?.claims?.sub === "string" ? result.claims.data.claims.sub : undefined;
  if (result.claims.error || !userId) return undefined;
  return { id: userId, client: result.client, source: accessToken ? "bearer" : "cookie" };
}
