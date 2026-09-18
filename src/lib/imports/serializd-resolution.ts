import type { CatalogEpisode, CatalogMedia } from "@/lib/media/types";
import type { NormalizedImportRecord, ReconciliationRow } from "@/lib/imports/types";
import { reconcileRecord } from "@/lib/imports/reconciliation";

export interface SerializdResolver {
  show(showId: string): Promise<CatalogMedia | null>;
  episodes(showId: string, seasonNumber: number): Promise<CatalogEpisode[]>;
}

/** Exact IDs only, with per-job caches and bounded provider concurrency. */
export async function resolveSerializdRecords(records: NormalizedImportRecord[], provider: SerializdResolver): Promise<ReconciliationRow[]> {
  const shows = new Map<string, Promise<CatalogMedia | null>>();
  const seasons = new Map<string, Promise<CatalogEpisode[]>>();
  const rows: ReconciliationRow[] = [];
  for (let offset = 0; offset < records.length; offset += 4) {
    rows.push(...await Promise.all(records.slice(offset, offset + 4).map(async (record): Promise<ReconciliationRow> => {
      if (record.mediaType !== "tv" || !record.providerIdentity) return reconcileRecord(record, []);
      if (record.defaultImport === false) return { record, match: { confidence: "unmatched", candidates: [] }, decision: "skipped" };
      const showId = record.providerIdentity.providerId;
      if (!shows.has(showId)) shows.set(showId, provider.show(showId).catch(() => null));
      const media = await shows.get(showId);
      if (!media || media.mediaType !== "tv" || media.provider !== "tmdb" || media.providerId !== showId) return reconcileRecord(record, []);
      let resolvedRecord = record;
      if (record.tmdbSeasonId !== undefined) {
        const season = media.seasons?.find((candidate) => candidate.providerId === String(record.tmdbSeasonId));
        if (!season || (record.seasonNumber !== undefined && record.seasonNumber !== season.seasonNumber)) return { record, match: { confidence: "unmatched", candidates: [] }, decision: "review" };
        resolvedRecord = { ...record, seasonNumber: season.seasonNumber };
        if (record.targetType === "episode") {
          const key = `${showId}:${season.seasonNumber}`;
          if (!seasons.has(key)) seasons.set(key, provider.episodes(showId, season.seasonNumber).catch(() => []));
          const episode = (await seasons.get(key))?.find((candidate) => candidate.episodeNumber === record.episodeNumber && candidate.seasonNumber === season.seasonNumber);
          if (!episode) return { record: resolvedRecord, match: { confidence: "unmatched", candidates: [] }, decision: "review" };
          resolvedRecord = { ...resolvedRecord, episodeTitle: episode.title, episodeProviderId: episode.id };
        }
      }
      // A large export repeats a show's snapshot across many events. Keep its
      // identity/artwork for reconciliation without duplicating heavy detail.
      return reconcileRecord(resolvedRecord, [{ ...media, description: undefined, seasons: undefined }]);
    })));
  }
  return rows;
}
