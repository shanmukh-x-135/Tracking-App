import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

const querySchema = z.string().trim().min(2).max(100);
const mediaTypeSchema = z.enum(["movie", "tv", "game", "book"]);

export interface CatalogSearchRequest {
  query: string;
  mediaType?: MediaType;
}

/** Applies the public `type` filter after the existing all-provider aggregate. */
export function filterCatalogSearchItems(items: CatalogMedia[], mediaType: MediaType | undefined): CatalogMedia[] {
  return mediaType ? items.filter((item) => item.mediaType === mediaType) : items;
}

/** Validates only the public HTTP contract; provider work remains in lib/media. */
export function parseCatalogSearchRequest(request: Request): CatalogSearchRequest | Response {
  const url = new URL(request.url);
  const query = querySchema.safeParse(url.searchParams.get("q"));
  if (!query.success) return apiError("VALIDATION_ERROR", "Query must contain between 2 and 100 characters.", 400);
  const rawMediaType = url.searchParams.get("type");
  if (rawMediaType === null) return { query: query.data };
  const mediaType = mediaTypeSchema.safeParse(rawMediaType);
  if (!mediaType.success) return apiError("VALIDATION_ERROR", "Type must be movie, tv, game, or book.", 400);
  return { query: query.data, mediaType: mediaType.data };
}

/** A total upstream search outage is distinct from a legitimate empty result. */
export function catalogSearchResponse(result: CatalogSearchResult, allProvidersFailed = false): Response {
  if (allProvidersFailed) {
    return apiError("PROVIDER_UNAVAILABLE", "Catalog search is temporarily unavailable. Please try again.", 503);
  }
  return NextResponse.json(result);
}

export async function catalogDetailResponse(load: () => Promise<CatalogMedia | null>): Promise<Response> {
  try {
    const item = await load();
    return item ? NextResponse.json(item) : apiError("NOT_FOUND", "Media item not found.", 404);
  } catch {
    return apiError("PROVIDER_UNAVAILABLE", "Catalog details are temporarily unavailable. Please try again.", 503);
  }
}
