import { parseGenericCsv } from "@/lib/imports/generic-parser";
import { parseLetterboxdExport } from "@/lib/imports/letterboxd-parser";
import type { ImportParser, ImportSource } from "@/lib/imports/types";

const genericSources = ["generic_movies", "generic_series", "generic_games", "generic_books"] as const;

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

const parsers = new Map<ImportSource, ImportParser>([
  ["letterboxd", letterboxdParser],
  ...genericSources.map((source) => [source, genericParser(source)] as const),
]);

export function importParserFor(source: ImportSource): ImportParser | undefined {
  return parsers.get(source);
}
