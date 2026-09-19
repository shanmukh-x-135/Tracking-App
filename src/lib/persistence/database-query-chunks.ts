export const DATABASE_IN_QUERY_CHUNK_SIZE = 100;

type QueryResult<Row> = { data: Row[] | null; error: { message: string } | null };

function assertQueryResult(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// PostgREST encodes `in` values in the request URL. Keeping each request small
// prevents a large episode history from turning a normal state read into a 414.
export function chunkDatabaseInValues(values: readonly string[]): string[][] {
  const uniqueValues = [...new Set(values)];
  const chunks: string[][] = [];
  for (let index = 0; index < uniqueValues.length; index += DATABASE_IN_QUERY_CHUNK_SIZE) {
    chunks.push(uniqueValues.slice(index, index + DATABASE_IN_QUERY_CHUNK_SIZE));
  }
  return chunks;
}

export async function fetchRowsInDatabaseChunks<Row>(
  values: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<QueryResult<Row>>,
): Promise<Row[]> {
  const results = await Promise.all(chunkDatabaseInValues(values).map(fetchChunk));
  results.forEach(({ error }) => assertQueryResult(error));
  return results.flatMap(({ data }) => data ?? []);
}

/** Optional historical projections cannot make a whole account unreadable. */
export async function fetchOptionalRowsInDatabaseChunks<Row>(
  values: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<QueryResult<Row>>,
  report: (cause: unknown) => void,
): Promise<Row[]> {
  try { return await fetchRowsInDatabaseChunks(values, fetchChunk); }
  catch (cause) { report(cause); return []; }
}
