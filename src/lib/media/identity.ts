import type { MediaProvider } from "./types";
import type { MediaType } from "@/types/media";

export interface ProviderIdentity {
  provider: MediaProvider;
  mediaType: MediaType;
  providerId: string;
}

const mediaTypes = new Set<MediaType>(["movie", "tv", "game", "book"]);

export function createProviderKey(identity: ProviderIdentity): string {
  if (!identity.providerId.trim() || identity.providerId.includes(":")) {
    throw new Error("Provider IDs must be non-empty and cannot contain colons.");
  }
  if (identity.provider === "tmdb" && identity.mediaType !== "movie" && identity.mediaType !== "tv") {
    throw new Error("TMDB identities must be movies or TV series.");
  }
  if (identity.provider === "igdb" && identity.mediaType !== "game") {
    throw new Error("IGDB identities must be games.");
  }
  if (identity.provider === "googlebooks" && identity.mediaType !== "book") {
    throw new Error("Google Books identities must be books.");
  }
  return `${identity.provider}:${identity.mediaType}:${identity.providerId}`;
}

export function parseProviderKey(value: string): ProviderIdentity | null {
  const [provider, mediaType, providerId, extra] = value.split(":");
  if (extra || !providerId || !mediaTypes.has(mediaType as MediaType)) return null;
  if (!new Set(["tmdb", "igdb", "googlebooks", "mock"]).has(provider)) return null;
  try {
    const identity = { provider: provider as MediaProvider, mediaType: mediaType as MediaType, providerId };
    createProviderKey(identity);
    return identity;
  } catch {
    return null;
  }
}

export function isProviderKey(value: string): boolean {
  return parseProviderKey(value) !== null;
}
