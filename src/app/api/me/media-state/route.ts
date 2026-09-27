import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { readSupabaseCurrentMediaState } from "@/lib/persistence/supabase-state";

/**
 * Compact private card snapshot. The response never exposes a user's complete
 * diary, even while the normalized source tables continue to power history.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try {
    return NextResponse.json(await readSupabaseCurrentMediaState(user.client, user.id));
  } catch {
    return apiError("INTERNAL_ERROR", "Your current media state could not be loaded.", 500);
  }
}
