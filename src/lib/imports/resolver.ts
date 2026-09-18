import "server-only";
import { getCatalogItem, getCatalogSeasonEpisodes, searchCatalog } from "@/lib/media/catalog";
import { resolveSerializdRecords } from "@/lib/imports/serializd-resolution";
import { createProviderKey } from "@/lib/media/identity";
import { reconcileRecord } from "@/lib/imports/reconciliation";
import type { NormalizedImportRecord, ReconciliationRow } from "@/lib/imports/types";
import type { CatalogMedia } from "@/lib/media/types";

const CONCURRENCY = 6;

async function candidatesFor(record: NormalizedImportRecord): Promise<CatalogMedia[]> {
  if (record.providerIdentity) {
    try {
      const exact = await getCatalogItem(record.providerIdentity);
      if (exact) return [exact];
    } catch {
      // Provider lookup failures fall through to search and remain reviewable.
    }
  }
  try {
    const result = await searchCatalog(record.title);
    return result.items.filter((media) => media.mediaType === record.mediaType);
  } catch {
    return [];
  }
}

export async function reconcileImportRecords(records: NormalizedImportRecord[]): Promise<ReconciliationRow[]> {
  if (records[0]?.source === "serializd_normalized_v1") return resolveSerializdRecords(records, {
    show: (showId) => getCatalogItem({ provider: "tmdb", mediaType: "tv", providerId: showId }),
    episodes: (showId, seasonNumber) => getCatalogSeasonEpisodes({ provider: "tmdb", mediaType: "tv", providerId: showId }, seasonNumber),
  });
  const cache = new Map<string, Promise<CatalogMedia[]>>();
  const results: ReconciliationRow[] = [];
  for (let offset = 0; offset < records.length; offset += CONCURRENCY) {
    const batch = records.slice(offset, offset + CONCURRENCY);
    const resolved = await Promise.all(batch.map(async (record) => {
      const key = record.providerIdentity ? createProviderKey(record.providerIdentity) : `${record.mediaType}:${record.title.toLocaleLowerCase("en")}`;
      let request = cache.get(key);
      if (!request) { request = candidatesFor(record); cache.set(key, request); }
      return reconcileRecord(record, await request);
    }));
    results.push(...resolved);
  }
  return results;
}
