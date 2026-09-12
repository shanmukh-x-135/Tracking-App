import type { CatalogMedia, CatalogProvider, CatalogSearchResult } from "@/lib/media/types";

function messageFor(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The provider could not be reached.";
}

export async function aggregateProviderSearch(query: string, providers: CatalogProvider[]): Promise<CatalogSearchResult> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(query)));
  const items: CatalogMedia[] = [];
  const failures: CatalogSearchResult["failures"] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else failures.push({ provider: providers[index].name, message: messageFor(result.reason) });
  });
  return { items, failures };
}
