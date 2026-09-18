import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicEnvironment } from "@/lib/config/env";
import { importParserFor } from "@/lib/imports/parsers";
import { previewCounts } from "@/lib/imports/reconciliation";
import { reconcileImportRecords } from "@/lib/imports/resolver";
import type { ImportPreview, ImportSource } from "@/lib/imports/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const maxDuration = 300;
const sourceSchema = z.enum(["letterboxd", "backloggd", "serializd", "serializd_normalized_v1", "fable", "generic_movies", "generic_series", "generic_games", "generic_books"]);

function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

async function readLimitedBody(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw new Error("too_large");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new Error("too_large"); }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

async function liveIdentity() {
  if (getPublicEnvironment().dataMode === "mock") return undefined;
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : undefined;
  return { client, userId };
}

export async function POST(request: Request) {
  const live = await liveIdentity();
  if (live && !live.userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const sourceResult = sourceSchema.safeParse(request.headers.get("x-import-source"));
  const encodedFilename = request.headers.get("x-file-name") ?? "";
  let filename = "";
  try { filename = decodeURIComponent(encodedFilename).split(/[\\/]/).pop()?.slice(0, 255) ?? ""; } catch { /* handled below */ }
  if (!sourceResult.success || !filename) return NextResponse.json({ error: "Choose a supported source and file." }, { status: 400 });
  const source = sourceResult.data as ImportSource;
  const parser = importParserFor(source);
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0];
  if (!parser?.accepts(filename, mimeType)) return NextResponse.json({ error: "That file type does not match the selected source." }, { status: 415 });

  let contents: Uint8Array;
  try { contents = await readLimitedBody(request); }
  catch { return NextResponse.json({ error: "Import files must be 12 MB or smaller." }, { status: 413 }); }
  if (!contents.byteLength) return NextResponse.json({ error: "The selected file is empty." }, { status: 400 });

  const started = Date.now();
  const parsed = parser.parse(contents, filename);
  if (source === "serializd_normalized_v1" && parsed.errors.length) return NextResponse.json({ error: "The normalized Serializd v1 file failed validation.", errors: parsed.errors }, { status: 422 });
  const rows = await reconcileImportRecords(parsed.records);
  if (parsed.normalizedSummary) {
    Object.assign(parsed.normalizedSummary, {
      exact_resolved_records: rows.filter((row) => row.decision === "accepted").length,
      unresolved_show_records: rows.filter((row) => row.decision === "review" && row.record.mediaType === "tv" && row.record.recordKind === "show_state").length,
      unresolved_season_records: rows.filter((row) => row.decision === "review" && row.record.mediaType === "tv" && (row.record.recordKind === "season_state" || row.record.targetType === "season")).length,
      unresolved_episode_records: rows.filter((row) => row.decision === "review" && row.record.mediaType === "tv" && row.record.targetType === "episode").length,
      already_imported_records: 0,
    });
    if (live?.userId) {
      const importedKeys = new Set<string>();
      for (let offset = 0; offset < 20000; offset += 500) {
        const { data, error } = await live.client.from("import_provenance").select("source_record_key").eq("user_id", live.userId).eq("source", source).in("undo_status", ["active", "preserved_modified"]).order("id").range(offset, offset + 499);
        if (error) return NextResponse.json({ error: "Existing import provenance could not be checked. Please retry." }, { status: 500 });
        for (const row of data ?? []) importedKeys.add(row.source_record_key);
        if ((data?.length ?? 0) < 500) break;
      }
      parsed.normalizedSummary.already_imported_records = rows.filter((row) => importedKeys.has(row.record.sourceRecordKey)).length;
    }
  }
  const counts = previewCounts(rows, parsed.duplicateCount, parsed.errors.length);
  const preview: ImportPreview = { source, filename, rows, counts, errors: parsed.errors, warnings: parsed.warnings, normalizedSummary: parsed.normalizedSummary };
  // Authenticated, stateless Preview acceptance checks must never stage or apply
  // personal exports against the shared hosted database.
  if (new URL(request.url).searchParams.get("dryRun") === "1") return NextResponse.json(preview);
  if (!live?.userId) return NextResponse.json(preview);
  const userId = live.userId;

  const fileHash = createHash("sha256").update(contents).digest("hex");
  const status = counts.needsReview ? "needs_review" : "ready";
  const { data: job, error: jobError } = await live.client.from("import_jobs").insert({
    user_id: userId, source, status, original_filename: filename, file_sha256: fileHash,
    total_records: counts.total, matched_records: counts.automaticMatches, ambiguous_records: counts.needsReview,
    skipped_records: 0, failed_records: counts.invalid, duplicate_records: counts.duplicates,
    duration_ms: Date.now() - started, metadata: jsonValue({ warnings: parsed.warnings, normalizedSummary: parsed.normalizedSummary }),
  }).select("id").single();
  if (jobError || !job) return NextResponse.json({ error: "Mosaic could not create the import job." }, { status: 500 });

  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200).map((row) => ({
      user_id: userId, import_job_id: job.id, source_record_key: row.record.sourceRecordKey,
      media_type: row.record.mediaType, source_title: row.record.title, source_year: row.record.year ?? null,
      source_metadata: jsonValue(row.record.sourceMetadata), normalized_payload: jsonValue(row.record),
      resolution_status: row.match.confidence === "ambiguous" ? "ambiguous" : row.match.confidence === "unmatched" ? "unmatched" : "pending",
      confidence: row.match.confidence, candidate_payload: jsonValue(row.match.candidates),
    }));
    const { error } = await live.client.from("import_records").insert(batch);
    if (error) {
      await live.client.from("import_jobs").update({ status: "failed", error_summary: "Parsed records could not be saved." }).eq("id", job.id);
      return NextResponse.json({ error: "Mosaic could not save the parsed import." }, { status: 500 });
    }
  }
  return NextResponse.json({ ...preview, jobId: job.id });
}
