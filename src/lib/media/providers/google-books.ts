import type { CatalogBook, CatalogDiscoverySection, CatalogMedia, CatalogProvider } from "@/lib/media/types";
import { providerJson } from "@/lib/media/providers/errors";

interface GoogleBookVolume {
  id: string;
  volumeInfo?: {
    title?: string; subtitle?: string; authors?: string[]; description?: string; publisher?: string;
    publishedDate?: string; pageCount?: number; categories?: string[];
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    averageRating?: number;
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

export function normalizeGoogleBook(item: GoogleBookVolume): CatalogBook {
  const info = item.volumeInfo ?? {};
  const releaseYear = info.publishedDate?.match(/^\d{4}/)?.[0];
  return {
    providerId: item.id, provider: "googlebooks", mediaType: "book", title: info.title || "Untitled book",
    subtitle: info.subtitle, authors: info.authors ?? [], description: plainTextDescription(info.description),
    posterUrl: secureImage(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    releaseDate: info.publishedDate, releaseYear: releaseYear ? Number(releaseYear) : undefined,
    genres: info.categories ?? [], communityRating: info.averageRating, publisher: info.publisher,
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

  private async volumeSearch(query: string): Promise<{ items?: GoogleBookVolume[] }> {
    const url = this.url("volumes");
    url.searchParams.set("q", query);
    url.searchParams.set("printType", "books");
    url.searchParams.set("maxResults", "8");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(url, { next: { revalidate: 3600 } });
      if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) {
        return providerJson<{ items?: GoogleBookVolume[] }>(this.name, response);
      }
      // Google Books intermittently returns 503 under concurrent discovery load.
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    throw new Error("Google Books search retries were exhausted.");
  }

  async search(query: string): Promise<CatalogMedia[]> {
    const data = await this.volumeSearch(query);
    return (data.items ?? []).map(normalizeGoogleBook);
  }

  async getById(providerId: string, mediaType?: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia | null> {
    if (mediaType && mediaType !== "book") return null;
    const response = await this.fetcher(this.url(`volumes/${encodeURIComponent(providerId)}`), { next: { revalidate: 86_400 } });
    if (response.status === 404) return null;
    return normalizeGoogleBook(await providerJson<GoogleBookVolume>(this.name, response));
  }

  async discover(mediaType: "movie" | "tv" | "game" | "book"): Promise<CatalogMedia[]> {
    return mediaType === "book" ? this.search("subject:fiction") : [];
  }

  async discoverSections(): Promise<CatalogDiscoverySection[]> {
    try {
      // Keep book discovery to one resilient request. Google Books throttles the
      // previous parallel subject fan-out, which made Home look unavailable.
      return [{ id: "googlebooks-fiction", label: "Fiction books", mediaType: "book", items: await this.search("subject:fiction") }];
    } catch {
      try {
        return [{ id: "googlebooks-fiction", label: "Fiction books", mediaType: "book", items: await this.search("fiction") }];
      } catch {
        return [{ id: "googlebooks-fiction", label: "Fiction books", mediaType: "book", items: [], error: "This provider section is temporarily unavailable." }];
      }
    }
  }

  async related(media: CatalogMedia): Promise<CatalogMedia[]> {
    if (media.mediaType !== "book") return [];
    const book = media as CatalogBook;
    const query = book.authors[0] ? `inauthor:${book.authors[0]}` : book.genres[0] ? `subject:${book.genres[0]}` : media.title;
    return (await this.search(query)).filter((item) => item.providerId !== media.providerId).slice(0, 12);
  }
}
