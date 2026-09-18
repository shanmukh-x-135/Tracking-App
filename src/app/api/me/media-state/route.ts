import { NextResponse } from "next/server";
import { deriveCurrentMediaState } from "@/lib/persistence/current-media-state";
import { readSupabaseState } from "@/lib/persistence/supabase-state";
import { createClient } from "@/lib/supabase/server";

/**
 * Compact private card snapshot. The response never exposes a user's complete
 * diary, even while the normalized source tables continue to power history.
 */
export async function GET() {
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : undefined;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const state = await readSupabaseState(client, userId);
    return NextResponse.json({ watchRegion: state.watchRegion, media: deriveCurrentMediaState(state) });
  } catch {
    return NextResponse.json({ error: "Your current media state could not be loaded." }, { status: 500 });
  }
}
