import { NextResponse } from "next/server";
import { getCatalogItem, isMediaProvider, relatedCatalog } from "@/lib/media/catalog";
import type { MediaType } from "@/types/media";

const mediaTypes = new Set<MediaType>(["movie", "tv", "game", "book"]);

export async function GET(_: Request, { params }: { params: Promise<{ provider: string; type: string; id: string }> }) {
  const { provider, type, id } = await params;
  if (!isMediaProvider(provider) || !mediaTypes.has(type as MediaType)) return NextResponse.json({ error: "Unknown catalog route." }, { status: 404 });
  const media = await getCatalogItem({ provider, mediaType: type as MediaType, providerId: id }).catch(() => null);
  if (!media) return NextResponse.json({ error: "This title is unavailable." }, { status: 404 });
  const result = await relatedCatalog(media);
  return NextResponse.json(result, result.failures.length ? undefined : { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
