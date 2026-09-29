import { configuredCatalogProviders, searchCatalog } from "@/lib/media/catalog";
import { getPublicEnvironment } from "@/lib/config/env";
import { users } from "@/data/media";
import { createClient } from "@/lib/supabase/server";
import type { CatalogProfile } from "@/lib/media/types";
import { catalogSearchResponse, filterCatalogSearchItems, parseCatalogSearchRequest } from "@/lib/api/catalog-contract";

export async function GET(request: Request) {
  const parsed = parseCatalogSearchRequest(request);
  if (parsed instanceof Response) return parsed;
  const result = await searchCatalog(parsed.query);
  // An empty successful result is normal; only report a 503 when every catalog
  // provider failed before the optional media-type presentation filter runs.
  const allCatalogProvidersFailed = result.items.length === 0 && result.failures.length === configuredCatalogProviders().length;
  result.items = filterCatalogSearchItems(result.items, parsed.mediaType);
  let profiles: CatalogProfile[];
  if (getPublicEnvironment().dataMode === "mock") {
    const query = parsed.query.toLowerCase();
    profiles = users.filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }));
  } else {
    const client = await createClient();
    const pattern = `%${parsed.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [names, handles] = await Promise.all([
      client.from("profiles").select("id,username,display_name,avatar_url").ilike("display_name", pattern).limit(5),
      client.from("profiles").select("id,username,display_name,avatar_url").ilike("username", pattern).limit(5),
    ]);
    const rows = [...(names.data ?? []), ...(handles.data ?? [])];
    profiles = [...new Map(rows.map((row) => [row.id, row])).values()].slice(0, 5).map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url ?? undefined }));
    if (names.error || handles.error) result.failures.push({ provider: "profiles", message: "Profile search is temporarily unavailable." });
  }
  return catalogSearchResponse({ ...result, profiles }, allCatalogProvidersFailed);
}
