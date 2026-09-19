import assert from "node:assert/strict";
import test from "node:test";
import { DATABASE_IN_QUERY_CHUNK_SIZE, fetchOptionalRowsInDatabaseChunks, fetchRowsInDatabaseChunks } from "../src/lib/persistence/database-query-chunks";

test("database IN reads split a normalized-import-scale episode history", async () => {
  const ids = Array.from({ length: 632 }, (_, index) => `episode-${index}`);
  const calls: string[][] = [];
  const rows = await fetchRowsInDatabaseChunks(ids, async (chunk) => {
    calls.push(chunk);
    return { data: chunk.map((id) => ({ id })), error: null };
  });

  assert.equal(DATABASE_IN_QUERY_CHUNK_SIZE, 100);
  assert.deepEqual(calls.map((chunk) => chunk.length), [100, 100, 100, 100, 100, 100, 32]);
  assert.deepEqual(rows.map(({ id }) => id), ids);
});

test("database IN reads deduplicate keys and surface chunk errors", async () => {
  const calls: string[][] = [];
  await assert.rejects(
    fetchRowsInDatabaseChunks(["episode-1", "episode-1", "episode-2"], async (chunk) => {
      calls.push(chunk);
      return { data: null, error: { message: "synthetic database failure" } };
    }),
    /synthetic database failure/,
  );
  assert.deepEqual(calls, [["episode-1", "episode-2"]]);
});

test("a failed optional large-TV projection degrades without failing account state", async () => {
  const ids = Array.from({ length: 931 }, (_, index) => `episode-${index}`);
  const reports: unknown[] = [];
  const rows = await fetchOptionalRowsInDatabaseChunks(ids, async () => ({ data: null, error: { message: "legacy projection unavailable" } }), (cause) => reports.push(cause));
  assert.deepEqual(rows, []);
  assert.equal(reports.length, 1);
});
