import { NextResponse } from "next/server";
import { getPublicEnvironment } from "@/lib/config/env";
import { lists, mediaById } from "@/data/media";
import { normalizeMock } from "@/lib/media/providers/mock";
import { catalogFromRow } from "@/lib/persistence/supabase-state";
import { createClient } from "@/lib/supabase/server";
import type { UserList } from "@/lib/persistence/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (getPublicEnvironment().dataMode === "mock") {
    const fixture = lists.find((list) => list.id === id && !list.isPrivate);
    if (!fixture) return NextResponse.json({ error: "List not found." }, { status: 404 });
    const list: UserList = {
      id: fixture.id, title: fixture.title, description: fixture.description, visibility: "public", updatedAt: new Date(0).toISOString(),
      items: fixture.mediaIds.flatMap((mediaId, position) => {
        const media = mediaById(mediaId);
        return media ? [{ id: `public:${fixture.id}:${mediaId}`, media: normalizeMock(media), position }] : [];
      }),
    };
    return NextResponse.json(list);
  }
  const client = await createClient();
  const { data: list, error } = await client.from("lists").select("*").eq("id", id).single();
  if (error || !list) return NextResponse.json({ error: "List not found." }, { status: 404 });
  const itemsResult = await client.from("list_items").select("*").eq("list_id", id).order("position");
  if (itemsResult.error) return NextResponse.json({ error: "List could not be loaded." }, { status: 500 });
  const mediaIds = (itemsResult.data ?? []).map((item) => item.media_id);
  const mediaResult = mediaIds.length ? await client.from("media_items").select("*").in("id", mediaIds) : { data: [], error: null };
  if (mediaResult.error) return NextResponse.json({ error: "List could not be loaded." }, { status: 500 });
  const media = new Map((mediaResult.data ?? []).map((row) => [row.id, catalogFromRow(row)]));
  const response: UserList = {
    id: list.id, title: list.title, description: list.description, visibility: list.visibility, updatedAt: list.updated_at,
    items: (itemsResult.data ?? []).flatMap((item) => {
      const found = media.get(item.media_id);
      return found ? [{ id: item.id, media: found, position: item.position, note: item.note ?? undefined }] : [];
    }),
  };
  return NextResponse.json(response);
}
