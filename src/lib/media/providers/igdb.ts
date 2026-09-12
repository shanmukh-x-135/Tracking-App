import type { CatalogGame, CatalogMedia, CatalogProvider } from "@/lib/media/types";
import { providerJson, ProviderUnavailableError } from "@/lib/media/providers/errors";

interface IgdbNamed { name: string }
interface IgdbCompany { company?: IgdbNamed; developer?: boolean; publisher?: boolean }
export interface IgdbGame {
  id: number; name?: string; summary?: string; first_release_date?: number; rating?: number;
  cover?: { image_id?: string }; artworks?: Array<{ image_id?: string }>;
  genres?: IgdbNamed[]; platforms?: IgdbNamed[]; involved_companies?: IgdbCompany[];
}

interface TokenResponse { access_token: string; expires_in: number }
let cachedToken: { value: string; expiresAt: number } | undefined;

function igdbImage(imageId: string | undefined, size: "cover_big" | "screenshot_big"): string | undefined {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : undefined;
}

export function normalizeIgdb(item: IgdbGame): CatalogGame {
  const releaseDate = item.first_release_date ? new Date(item.first_release_date * 1000).toISOString().slice(0, 10) : undefined;
  const companies = item.involved_companies ?? [];
  return {
    providerId: String(item.id), provider: "igdb", mediaType: "game", title: item.name || "Untitled game",
    description: item.summary || undefined, posterUrl: igdbImage(item.cover?.image_id, "cover_big"),
    backdropUrl: igdbImage(item.artworks?.[0]?.image_id, "screenshot_big"), releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
    genres: (item.genres ?? []).map(({ name }) => name), communityRating: item.rating ? item.rating / 20 : undefined,
    platforms: (item.platforms ?? []).map(({ name }) => name),
    developer: companies.find((entry) => entry.developer)?.company?.name,
    publisher: companies.find((entry) => entry.publisher)?.company?.name,
  };
}

function safeSearchQuery(value: string): string {
  return value.replace(/["\\;]/g, " ").trim();
}

export class IgdbProvider implements CatalogProvider {
  readonly name = "igdb" as const;
  constructor(
    private readonly clientId: string | undefined,
    private readonly clientSecret: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async token(): Promise<string> {
    if (!this.clientId || !this.clientSecret) throw new ProviderUnavailableError(this.name);
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
    const url = new URL("https://id.twitch.tv/oauth2/token");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("client_secret", this.clientSecret);
    url.searchParams.set("grant_type", "client_credentials");
    const token = await providerJson<TokenResponse>(this.name, await this.fetcher(url, { method: "POST", cache: "no-store" }));
    cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
    return cachedToken.value;
  }

  private async request(body: string): Promise<IgdbGame[]> {
    if (!this.clientId) throw new ProviderUnavailableError(this.name);
    return providerJson<IgdbGame[]>(this.name, await this.fetcher("https://api.igdb.com/v4/games", {
      method: "POST", headers: { "Client-ID": this.clientId, Authorization: `Bearer ${await this.token()}`, Accept: "application/json" },
      body, cache: "no-store",
    }));
  }

  async search(query: string): Promise<CatalogMedia[]> {
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher";
    return (await this.request(`search "${safeSearchQuery(query)}"; fields ${fields}; where version_parent = null; limit 8;`)).map(normalizeIgdb);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType && mediaType !== "game") return null;
    if (!/^\d+$/.test(providerId)) return null;
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher";
    const [item] = await this.request(`fields ${fields}; where id = ${providerId}; limit 1;`);
    return item ? normalizeIgdb(item) : null;
  }
}
