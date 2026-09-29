import { getCatalogItem, isMediaProvider } from "@/lib/media/catalog";
import type { MediaType } from "@/types/media";
import { apiError } from "@/lib/api/errors";
import { catalogDetailResponse } from "@/lib/api/catalog-contract";

const mediaTypes = new Set<MediaType>(["movie", "tv", "game", "book"]);

export async function GET(_request: Request, context: { params: Promise<{ provider: string; type: string; id: string }> }) {
  const { provider, type, id } = await context.params;
  if (!isMediaProvider(provider) || !mediaTypes.has(type as MediaType) || !id) {
    return apiError("VALIDATION_ERROR", "Catalog identity is invalid.", 400);
  }
  return catalogDetailResponse(() => getCatalogItem({ provider, mediaType: type as MediaType, providerId: id }));
}
