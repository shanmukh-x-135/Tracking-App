import { NextResponse } from "next/server";
import { getCatalogItem, isMediaProvider } from "@/lib/media/catalog";
import type { MediaType } from "@/types/media";

const mediaTypes = new Set<MediaType>(["movie", "tv", "game", "book"]);

export async function GET(_request: Request, context: { params: Promise<{ provider: string; type: string; id: string }> }) {
  const { provider, type, id } = await context.params;
  if (!isMediaProvider(provider) || !mediaTypes.has(type as MediaType) || !id) {
    return NextResponse.json({ error: "Invalid catalog identity." }, { status: 400 });
  }
  const item = await getCatalogItem({ provider, mediaType: type as MediaType, providerId: id });
  return item ? NextResponse.json(item) : NextResponse.json({ error: "Media item not found." }, { status: 404 });
}
