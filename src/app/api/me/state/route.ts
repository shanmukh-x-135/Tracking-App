import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applySupabaseMutation, readSupabaseState } from "@/lib/persistence/supabase-state";
import { persistenceMutationSchema } from "@/lib/persistence/validation";

async function authenticated() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : undefined;
  return { client, userId, error };
}

export async function GET() {
  const { client, userId } = await authenticated();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try { return NextResponse.json(await readSupabaseState(client, userId)); }
  catch (error) {
    console.error("Mosaic state could not be loaded.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Your Mosaic data could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client, userId } = await authenticated();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = persistenceMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The update was invalid." }, { status: 400 });
  try {
    await applySupabaseMutation(client, userId, parsed.data);
    return NextResponse.json(await readSupabaseState(client, userId));
  } catch {
    return NextResponse.json({ error: "Your update could not be saved." }, { status: 500 });
  }
}
