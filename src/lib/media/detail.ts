import "server-only";
import { mediaById } from "@/data/media";
import { getCatalogItem } from "@/lib/media/catalog";
import { parseProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import type { CatalogMedia } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

export async function resolveDetailMedia(id: string, mediaType: MediaType): Promise<CatalogMedia | null> {
  let decodedId: string;
  try { decodedId = decodeURIComponent(id); } catch { return null; }
  const fixture = mediaById(decodedId);
  if (fixture?.mediaType === mediaType) return normalizeMock(fixture);
  const identity = parseProviderKey(decodedId);
  if (!identity || identity.mediaType !== mediaType) return null;
  try {
    return await getCatalogItem(identity);
  } catch {
    return null;
  }
}
