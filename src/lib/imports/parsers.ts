import { parseGenericCsv } from "@/lib/imports/generic-parser";
import { parseLetterboxdExport } from "@/lib/imports/letterboxd-parser";
import type { ImportParser, ImportSource } from "@/lib/imports/types";

const genericSources = ["generic_movies", "generic_series", "generic_games", "generic_books"] as const;
const fallbackSources = { serializd: "generic_series", backloggd: "generic_games", fable: "generic_books" } as const;

function genericParser(source: (typeof genericSources)[number]): ImportParser {
  return {
    source,
    accepts(filename, mimeType) {
      const safeMime = !mimeType || mimeType === "text/csv" || mimeType === "application/csv" || mimeType === "application/vnd.ms-excel";
      return safeMime && filename.toLowerCase().endsWith(".csv");
    },
    parse(contents) { return parseGenericCsv(source, contents); },
  };
}

const letterboxdParser: ImportParser = {
  source: "letterboxd",
  accepts(filename, mimeType) {
    const safeMime = !mimeType || ["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(mimeType);
    return safeMime && filename.toLowerCase().endsWith(".zip");
  },
  parse: parseLetterboxdExport,
};

function fallbackParser(source: keyof typeof fallbackSources): ImportParser {
  const genericSource = fallbackSources[source];
  return {
    source,
    accepts: genericParser(genericSource).accepts,
    parse(contents) {
      const result = parseGenericCsv(genericSource, contents);
      const label = source === "serializd" ? "Serializd" : source === "backloggd" ? "Backloggd" : "Fable";
      return {
        ...result,
        records: result.records.map((record) => ({
          ...record,
          source,
          sourceRecordKey: record.sourceRecordKey.replace(`${genericSource}:`, `${source}:`),
        })),
        warnings: [`${label} does not publish a stable native export schema; this file was interpreted using Mosaic's ${genericSource.replace("generic_", "")} template.`, ...result.warnings],
      };
    },
  };
}

const parsers = new Map<ImportSource, ImportParser>([
  ["letterboxd", letterboxdParser],
  ...(Object.keys(fallbackSources) as (keyof typeof fallbackSources)[]).map((source) => [source, fallbackParser(source)] as const),
  ...genericSources.map((source) => [source, genericParser(source)] as const),
]);

export function importParserFor(source: ImportSource): ImportParser | undefined {
  return parsers.get(source);
}
