import type { CatalogBook, CatalogDiscoverySection, CatalogMedia, CatalogProvider } from "@/lib/media/types";
import { providerJson } from "@/lib/media/providers/errors";
import type { MediaTheme } from "@/lib/media/themes";

interface GoogleBookVolume {
  id: string;
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; description?: string; publisher?: string;
    publishedDate?: string; pageCount?: number; categories?: string[];
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    averageRating?: number;
    ratingsCount?: number;
  };
}

function secureImage(url: string | undefined): string | undefined {
  return url?.replace(/^http:/, "https:");
}

function plainTextDescription(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withoutMarkup = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|ul|ol)>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const decoded = withoutMarkup.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    const normalized = code.toLowerCase();
    if (normalized in named) return named[normalized];
    const point = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
  return decoded.replace(/\s+/g, " ").trim() || undefined;
}

const fictionQueries = ["subject:fiction", "fiction novel"] as const;

/** A volume needs a string ID and a non-empty title; everything else is optional and never invented. */
export function isUsableVolume(value: unknown): value is GoogleBookVolume {
  const volume = value as GoogleBookVolume | null;
  return typeof volume?.id === "string" && volume.id.trim() !== "" && typeof volume.volumeInfo?.title === "string" && volume.volumeInfo.title.trim() !== "";
}

/** Google's own category says fiction ("Fiction", "Juvenile Fiction", "English fiction"), not non-fiction. */
export function isFiction(book: CatalogBook): boolean {
  return book.genres.some((category) => /fiction/i.test(category) && !/non-?fiction/i.test(category));
}

/** Keeps only non-empty strings from a provider array field that may be missing or malformed. */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "") : [];
}

export function normalizeGoogleBook(item: GoogleBookVolume): CatalogBook {
  const info = item.volumeInfo ?? {};
  const publishedDate = typeof info.publishedDate === "string" && info.publishedDate.trim() ? info.publishedDate : undefined;
  const releaseYear = publishedDate?.match(/^\d{4}/)?.[0];
  return {
    providerId: item.id, provider: "googlebooks", mediaType: "book", title: info.title || "Untitled book",
    subtitle: info.subtitle, authors: strings(info.authors), description: plainTextDescription(info.description),
    posterUrl: secureImage(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    releaseDate: publishedDate, releaseYear: releaseYear ? Number(releaseYear) : undefined,
    genres: strings(info.categories), communityRating: info.averageRating, communityRatingCount: info.ratingsCount, publisher: info.publisher,
    pageCount: info.pageCount && info.pageCount > 0 ? info.pageCount : undefined,
    isbn: info.industryIdentifiers?.find(({ type }) => type === "ISBN_13")?.identifier
      ?? info.industryIdentifiers?.find(({ type }) => type === "ISBN_10")?.identifier,
  };
}

export class GoogleBooksProvider implements CatalogProvider {
  readonly name = "googlebooks" as const;
  constructor(private readonly apiKey: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  private url(path: string): URL {
    const url = new URL(`https://www.googleapis.com/books/v1/${path}`);
    if (this.apiKey) url.searchParams.set("key", this.apiKey);
    return url;
  }

  private async volumeSearch(query: string, maxResults: number): Promise<{ items?: unknown }> {
    const url = this.url("volumes");
    url.searchParams.set("q", query);
    url.searchParams.set("printType", "books");
    url.searchParams.set("maxResults", String(maxResults));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10_000) });
      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) {
        return providerJson<{ items?: unknown }>(this.name, response);
      }
      // Google Books intermittently returns 503 under concurrent discovery load.
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    throw new Error("Google Books search retries were exhausted.");
  }

  async search(query: string, maxResults = 8): Promise<CatalogBook[]> {
    const data = await this.volumeSearch(query, maxResults);
    return (Array.isArray(data.items) ? data.items : []).filter(isUsableVolume).map(normalizeGoogleBook);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType && mediaType !== "book") return null;
    const response = await this.fetcher(this.url(`volumes/${encodeURIComponent(providerId)}`), { next: { revalidate: 86_400 } });
    if (response.status === 404) return null;
    const volume = await providerJson<unknown>(this.name, response);
    return isUsableVolume(volume) ? normalizeGoogleBook(volume) : null;
  }

  async discover(mediaType: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia[]> {
    return mediaType === "book" ? (await this.discoverSections())[0].items : [];
  }

  /**
   * Google Books often answers `subject:fiction` with HTTP 200 and zero items, so an empty success moves on
   * to a plain-text query instead of ending as an empty shelf. Only volumes Google categorizes as fiction are
   * kept, because plain "fiction" text matches catalogues, magazines and criticism. Queries run one at a
   * time: Google throttles parallel fan-out.
   */
  async discoverSections(): Promise<CatalogDiscoverySection[]> {
    const section = { id: "googlebooks-fiction", label: "Fiction books", mediaType: "book" as const };
    let failures = 0;
    for (const query of fictionQueries) {
      try {
        const items = (await this.search(query, 20)).filter(isFiction).slice(0, 12);
        if (items.length) return [{ ...section, items }];
      } catch {
        failures += 1;
      }
    }
    // A provider failure is reported as an error; a successful answer with no fiction stays an honest empty shelf.
    return [{ ...section, items: [], ...(failures === fictionQueries.length ? { error: "This provider section is temporarily unavailable." } : {}) }];
  }

  async discoverByTheme(mediaType: "movie" | "tv" | "game" | "book", theme: MediaTheme): Promise<CatalogMedia[]> {
    if (mediaType !== "book" || !theme.rules.bookQuery) return [];
    return (await this.search(theme.rules.bookQuery, 20)).filter(isFiction).slice(0, 18);
  }

  async related(media: CatalogMedia): Promise<CatalogMedia[]> {
    if (media.mediaType !== "book") return [];
    const book = media as CatalogBook;
    const query = book.authors[0] ? `inauthor:${book.authors[0]}` : book.genres[0] ? `subject:${book.genres[0]}` : media.title;
    return (await this.search(query)).filter((item) => item.providerId !== media.providerId).slice(0, 12);
  }
}
