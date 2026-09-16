import type { CatalogDiscoverySection, CatalogGame, CatalogMedia, CatalogProvider } from "@/lib/media/types";
import { providerJson, ProviderUnavailableError } from "@/lib/media/providers/errors";

interface IgdbNamed { name: string; logo?: { image_id?: string } }
interface IgdbCompany { company?: IgdbNamed; developer?: boolean; publisher?: boolean }
export interface IgdbGame {
  id: number; name?: string; summary?: string; first_release_date?: number; rating?: number;
  cover?: { image_id?: string }; artworks?: Array<{ image_id?: string }>;
  genres?: IgdbNamed[]; platforms?: IgdbNamed[]; involved_companies?: IgdbCompany[]; similar_games?: IgdbGame[];
}

interface TokenResponse { access_token: string; expires_in: number }
let cachedToken: { value: string; expiresAt: number } | undefined;

function igdbImage(imageId: string | undefined, size: "cover_big" | "screenshot_big" | "logo_med"): string | undefined {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : undefined;
}

export function normalizeIgdb(item: IgdbGame): CatalogGame {
  const releaseDate = item.first_release_date ? new Date(item.first_release_date * 1000).toISOString().slice(0, 10) : undefined;
  const companies = item.involved_companies ?? [];
  const developer = companies.find((entry) => entry.developer)?.company;
  const publisher = companies.find((entry) => entry.publisher)?.company;
  return {
    providerId: String(item.id), provider: "igdb", mediaType: "game", title: item.name || "Untitled game",
    description: item.summary || undefined, posterUrl: igdbImage(item.cover?.image_id, "cover_big"),
    backdropUrl: igdbImage(item.artworks?.[0]?.image_id, "screenshot_big"), releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
    genres: (item.genres ?? []).map(({ name }) => name), communityRating: item.rating ? item.rating / 20 : undefined,
    platforms: (item.platforms ?? []).map(({ name }) => name),
    developer: developer?.name, publisher: publisher?.name,
    developerLogoUrl: igdbImage(developer?.logo?.image_id, "logo_med"), publisherLogoUrl: igdbImage(publisher?.logo?.image_id, "logo_med"),
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
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.company.logo.image_id,involved_companies.developer,involved_companies.publisher";
    return (await this.request(`search "${safeSearchQuery(query)}"; fields ${fields}; where version_parent = null; limit 8;`)).map(normalizeIgdb);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType && mediaType !== "game") return null;
    if (!/^\d+$/.test(providerId)) return null;
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.company.logo.image_id,involved_companies.developer,involved_companies.publisher";
    const [item] = await this.request(`fields ${fields}; where id = ${providerId}; limit 1;`);
    return item ? normalizeIgdb(item) : null;
  }

  async discover(mediaType: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia[]> {
    if (mediaType !== "game") return [];
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.company.logo.image_id,involved_companies.developer,involved_companies.publisher";
    return (await this.request(`fields ${fields}; where version_parent = null & rating != null; sort rating_count desc; limit 12;`)).map(normalizeIgdb);
  }

  async discoverSections(): Promise<CatalogDiscoverySection[]> {
    const fields = "id,name,summary,first_release_date,rating,cover.image_id,artworks.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.company.logo.image_id,involved_companies.developer,involved_companies.publisher";
    const now = Math.floor(Date.now() / 1000);
    const definitions = [
      ["popular", "Popular on IGDB", `where version_parent = null & rating != null; sort rating_count desc; limit 12;`],
      ["recent", "Recently released", `where version_parent = null & first_release_date != null & first_release_date < ${now} & first_release_date > ${now - 31_536_000}; sort first_release_date desc; limit 12;`],
      ["upcoming", "Upcoming games", `where version_parent = null & first_release_date != null & first_release_date >= ${now}; sort first_release_date asc; limit 12;`],
      ["top-rated", "Highly rated", `where version_parent = null & rating != null; sort rating desc; limit 12;`],
    ] as const;
    const settled = await Promise.allSettled(definitions.map(async ([id, label, query]) => ({ id: `igdb-${id}`, label, mediaType: "game" as const, items: (await this.request(`fields ${fields}; ${query}`)).map(normalizeIgdb) } satisfies CatalogDiscoverySection)));
    return settled.map((outcome, index) => outcome.status === "fulfilled" ? outcome.value : {
      id: `igdb-${definitions[index][0]}`, label: definitions[index][1], mediaType: "game", items: [], error: "This provider section is temporarily unavailable.",
    });
  }

  async related(media: CatalogMedia): Promise<CatalogMedia[]> {
    if (media.provider !== this.name || media.mediaType !== "game" || !/^\d+$/.test(media.providerId)) return [];
    const fields = "similar_games.id,similar_games.name,similar_games.summary,similar_games.first_release_date,similar_games.rating,similar_games.cover.image_id,similar_games.artworks.image_id,similar_games.genres.name,similar_games.platforms.name,similar_games.involved_companies.company.name,similar_games.involved_companies.company.logo.image_id,similar_games.involved_companies.developer,similar_games.involved_companies.publisher";
    const [game] = await this.request(`fields ${fields}; where id = ${media.providerId}; limit 1;`);
    return (game?.similar_games ?? []).filter((item) => item.id !== Number(media.providerId)).map(normalizeIgdb).slice(0, 12);
  }
}
