import type { CatalogBook, CatalogMedia, CatalogProvider } from "@/lib/media/types";
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

export function normalizeGoogleBook(item: GoogleBookVolume): CatalogBook {
  const info = item.volumeInfo ?? {};
  const releaseYear = info.publishedDate?.match(/^\d{4}/)?.[0];
  return {
    providerId: item.id, provider: "googlebooks", mediaType: "book", title: info.title || "Untitled book",
    subtitle: info.subtitle, authors: info.authors ?? [], description: info.description,
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
}
