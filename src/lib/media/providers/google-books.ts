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

  async search(query: string): Promise<CatalogMedia[]> {
    const url = this.url("volumes");
    url.searchParams.set("q", query);
    url.searchParams.set("printType", "books");
    url.searchParams.set("maxResults", "8");
    const data = await providerJson<{ items?: GoogleBookVolume[] }>(this.name, await this.fetcher(url, { next: { revalidate: 3600 } }));
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
    const definitions = [["fiction", "Fiction books", "subject:fiction"], ["fantasy", "Fantasy books", "subject:fantasy"], ["mystery", "Mystery books", "subject:mystery"]] as const;
    const settled = await Promise.allSettled(definitions.map(async ([id, label, query]) => ({ id: `googlebooks-${id}`, label, mediaType: "book" as const, items: await this.search(query) } satisfies CatalogDiscoverySection)));
    return settled.map((outcome, index) => outcome.status === "fulfilled" ? outcome.value : {
      id: `googlebooks-${definitions[index][0]}`, label: definitions[index][1], mediaType: "book", items: [], error: "This provider section is temporarily unavailable.",
    });
  }

  async related(media: CatalogMedia): Promise<CatalogMedia[]> {
    if (media.mediaType !== "book") return [];
    const book = media as CatalogBook;
    const query = book.authors[0] ? `inauthor:${book.authors[0]}` : book.genres[0] ? `subject:${book.genres[0]}` : media.title;
    return (await this.search(query)).filter((item) => item.providerId !== media.providerId).slice(0, 12);
  }
}
