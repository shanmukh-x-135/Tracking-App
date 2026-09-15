import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { createMosaicExportArchive, exportSections, mosaicDataFromState, neutralizeSpreadsheetCell, recordsToCsv } from "@/lib/exports/mosaic-export";
import { applyMutation } from "@/lib/persistence/domain";
import { emptyMosaicState } from "@/lib/persistence/types";

const movie = { provider: "mock" as const, providerId: "dune-part-two", mediaType: "movie" as const, title: "Dune: Part Two", releaseYear: 2024, genres: ["Science Fiction"] };

test("Mosaic export contains a versioned manifest and every portable section", () => {
  const user = { id: "user-1", email: "reader@example.com", displayName: "River Quinn" };
  const state = applyMutation(emptyMosaicState(), { type: "library.upsert", media: movie, status: "watched" }, "2026-09-14T00:00:00.000Z");
  const archive = unzipSync(createMosaicExportArchive(mosaicDataFromState(user, state), "2026-09-14T01:02:03.000Z"));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"])) as { mosaicExportVersion: number; exportedAt: string; files: string[] };

  assert.equal(manifest.mosaicExportVersion, 2);
  assert.equal(manifest.exportedAt, "2026-09-14T01:02:03.000Z");
  for (const section of exportSections) {
    assert.ok(archive[`json/${section}.json`]);
    assert.ok(archive[`csv/${section}.csv`]);
  }
  assert.match(strFromU8(archive["json/media.json"]), /Dune: Part Two/);
  assert.match(strFromU8(archive["json/library.json"]), /mock:movie:dune-part-two/);
});

test("exported CSV neutralizes formula prefixes and preserves quoted content", () => {
  assert.equal(neutralizeSpreadsheetCell("=1+1"), "'=1+1");
  assert.equal(neutralizeSpreadsheetCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(neutralizeSpreadsheetCell("ordinary"), "ordinary");
  const csv = recordsToCsv([{ title: "=IMPORTXML(example)", note: "A comma, a quote \" and\na newline" }]);
  assert.match(csv, /'=IMPORTXML/);
  assert.match(csv, /"A comma, a quote "" and\na newline"/);
});
