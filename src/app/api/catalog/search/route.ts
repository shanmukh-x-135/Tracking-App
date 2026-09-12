import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCatalog } from "@/lib/media/catalog";
import { getPublicEnvironment } from "@/lib/config/env";
import { users } from "@/data/media";
import { createClient } from "@/lib/supabase/server";
import type { CatalogProfile } from "@/lib/media/types";

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return NextResponse.json({ error: "Enter at least two characters." }, { status: 400 });
  const result = await searchCatalog(parsed.data);
  let profiles: CatalogProfile[];
  if (getPublicEnvironment().dataMode === "mock") {
    const query = parsed.data.toLowerCase();
    profiles = users.filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }));
  } else {
    const client = await createClient();
    const pattern = `%${parsed.data.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [names, handles] = await Promise.all([
      client.from("profiles").select("id,username,display_name,avatar_url").ilike("display_name", pattern).limit(5),
      client.from("profiles").select("id,username,display_name,avatar_url").ilike("username", pattern).limit(5),
    ]);
    const rows = [...(names.data ?? []), ...(handles.data ?? [])];
    profiles = [...new Map(rows.map((row) => [row.id, row])).values()].slice(0, 5).map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url ?? undefined }));
    if (names.error || handles.error) result.failures.push({ provider: "profiles", message: "Profile search is temporarily unavailable." });
  }
  return NextResponse.json({ ...result, profiles });
}
