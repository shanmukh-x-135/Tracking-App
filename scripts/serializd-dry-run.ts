import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { parseSerializdNormalizedJson } from "../src/lib/imports/serializd-normalized-parser";
import { resolveSerializdRecords } from "../src/lib/imports/serializd-resolution";
import { TmdbProvider } from "../src/lib/media/providers/tmdb";

// Read-only acceptance check: never initializes Auth or writes tracking data.
async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const filename = process.argv[2];
  if (!filename) throw new Error("Provide a normalized JSON file path.");
  const parsed = parseSerializdNormalizedJson(readFileSync(filename));
  if (parsed.errors.length) throw new Error(JSON.stringify(parsed.errors));
  console.log(JSON.stringify({ recognized: "Mosaic Serializd Normalized Export v1", ...parsed.normalizedSummary }));
  if (!process.env.TMDB_API_READ_TOKEN) throw new Error("TMDB_API_READ_TOKEN is required for exact provider verification.");
  const provider = new TmdbProvider(process.env.TMDB_API_READ_TOKEN);
  const rows = await resolveSerializdRecords(parsed.records, {
    show: (id) => provider.getById(id, "tv"),
    episodes: (id, season) => provider.getSeasonEpisodes(id, season),
  });
  const unresolved = rows.filter((row) => row.decision === "review");
  console.log(JSON.stringify({ totalRecords: rows.length, exact: rows.filter((row) => row.match.confidence === "exact").length, skipped: rows.filter((row) => row.decision === "skipped").length, unresolvedCount: unresolved.length, unresolvedShowIds: [...new Set(unresolved.map(({ record }) => record.providerIdentity?.providerId))] }));
  if (unresolved.length) process.exitCode = 1;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Dry-run failed."); process.exitCode = 1; });
