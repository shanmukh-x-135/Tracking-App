import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportHistoryItem } from "@/lib/imports/history";
import type { ImportSource } from "@/lib/imports/types";

export async function GET() {
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : undefined;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await client.from("import_jobs").select("id,source,status,original_filename,total_records,skipped_records,failed_records,created_at,completed_at,error_summary").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Import history could not be loaded." }, { status: 500 });
  const jobs: ImportHistoryItem[] = (data ?? []).map((job) => ({
    id: String(job.id), source: job.source as ImportSource, filename: String(job.original_filename), status: job.status as ImportHistoryItem["status"],
    totalRecords: Number(job.total_records), importedRecords: Math.max(0, Number(job.total_records) - Number(job.skipped_records) - Number(job.failed_records)),
    skippedRecords: Number(job.skipped_records), failedRecords: Number(job.failed_records), createdAt: String(job.created_at),
    completedAt: job.completed_at ? String(job.completed_at) : undefined, errorSummary: job.error_summary ? String(job.error_summary) : undefined,
  }));
  return NextResponse.json({ jobs });
}
