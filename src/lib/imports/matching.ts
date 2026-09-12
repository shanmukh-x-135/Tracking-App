import type { MatchCandidate, MatchResult, NormalizedImportRecord } from "@/lib/imports/types";
import type { CatalogMedia } from "@/lib/media/types";

function normalizedTitle(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
}

function contextualScore(record: NormalizedImportRecord, media: CatalogMedia): MatchCandidate | null {
  if (record.mediaType !== media.mediaType) return null;
  const reasons: string[] = [];
  let score = 0;
  if (record.providerIdentity && record.providerIdentity.provider === media.provider && record.providerIdentity.providerId === media.providerId) {
    return { media, score: 100, reasons: ["Provider identifier matches"] };
  }
  const sourceTitles = [record.title, record.originalTitle].filter((value): value is string => Boolean(value)).map(normalizedTitle);
  const candidateTitles = [media.title, media.originalTitle].filter((value): value is string => Boolean(value)).map(normalizedTitle);
  if (sourceTitles.some((title) => candidateTitles.includes(title))) { score += 60; reasons.push("Title matches"); }
  else return null;
  if (record.year !== undefined && media.releaseYear !== undefined) {
    if (record.year === media.releaseYear) { score += 25; reasons.push("Release year matches"); }
    else if (Math.abs(record.year - media.releaseYear) === 1) { score += 8; reasons.push("Release year is close"); }
    else score -= 20;
  }
  if (record.mediaType === "book" && record.author && media.mediaType === "book") {
    if (media.authors.some((author) => normalizedTitle(author) === normalizedTitle(record.author!))) { score += 15; reasons.push("Author matches"); }
  }
  if (record.mediaType === "game" && record.platform && media.mediaType === "game") {
    if (media.platforms.some((platform) => normalizedTitle(platform) === normalizedTitle(record.platform!))) { score += 5; reasons.push("Platform matches"); }
  }
  return { media, score, reasons };
}

export function matchImportRecord(record: NormalizedImportRecord, catalog: CatalogMedia[]): MatchResult {
  const candidates = catalog.map((media) => contextualScore(record, media)).filter((candidate): candidate is MatchCandidate => candidate !== null).sort((first, second) => second.score - first.score).slice(0, 5);
  if (!candidates.length) return { confidence: "unmatched", candidates: [] };
  const first = candidates[0];
  const tied = candidates.length > 1 && candidates[1].score >= first.score - 5;
  if (tied) return { confidence: "ambiguous", candidates };
  if (first.score === 100) return { confidence: "exact", resolved: first.media, candidates };
  if (first.score >= 85) return { confidence: "high", resolved: first.media, candidates };
  return { confidence: "medium", candidates };
}
