import type { CatalogMedia, CatalogProvider, CatalogSearchResult } from "@/lib/media/types";

export async function aggregateProviderSearch(query: string, providers: CatalogProvider[]): Promise<CatalogSearchResult> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(query)));
  const items: CatalogMedia[] = [];
  const failures: CatalogSearchResult["failures"] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    // Provider errors can contain transport or upstream details. The catalog
    // response remains useful without exposing those implementation details.
    else failures.push({ provider: providers[index].name, message: "Search is temporarily unavailable." });
  });
  const unique = [...new Map(items.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()];
  return { items: unique, failures };
}
