import { NextResponse } from "next/server";
import { z } from "zod";
import { catalogMediaSchema } from "@/lib/persistence/validation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const requestSchema = z.object({
  conflictPolicy: z.enum(["keep_mosaic", "use_imported", "review"]),
  resolutions: z.array(z.object({
    sourceRecordKey: z.string().min(1).max(512),
    decision: z.enum(["accepted", "review", "skipped"]),
    selected: catalogMediaSchema.optional(),
  }).refine((value) => value.decision !== "accepted" || Boolean(value.selected), { message: "Accepted records require a selection." })).max(20_000),
});

function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success) return NextResponse.json({ error: "Invalid import job." }, { status: 400 });
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : undefined;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The import decisions were invalid." }, { status: 400 });
  if (parsed.data.resolutions.some((resolution) => resolution.decision === "review")) return NextResponse.json({ error: "Resolve or skip every import row before continuing." }, { status: 409 });

  const { data: job, error: jobError } = await client.from("import_jobs").select("id,status").eq("id", jobId).eq("user_id", userId).single();
  if (jobError || !job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (!["needs_review", "ready", "failed", "completed"].includes(String(job.status))) return NextResponse.json({ error: "This import job cannot be applied right now." }, { status: 409 });

  const { data: records, error: recordsError } = await client.from("import_records").select("id,source_record_key,media_type").eq("import_job_id", jobId).eq("user_id", userId);
  if (recordsError) return NextResponse.json({ error: "Import records could not be loaded." }, { status: 500 });
  const recordByKey = new Map((records ?? []).map((record) => [String(record.source_record_key), record]));
  const seen = new Set<string>();
  for (const resolution of parsed.data.resolutions) {
    if (seen.has(resolution.sourceRecordKey)) return NextResponse.json({ error: "An import decision was repeated." }, { status: 400 });
    seen.add(resolution.sourceRecordKey);
    const record = recordByKey.get(resolution.sourceRecordKey);
    if (!record) return NextResponse.json({ error: "An import decision did not belong to this job." }, { status: 400 });
    if (resolution.selected && resolution.selected.mediaType !== record.media_type) return NextResponse.json({ error: "A selected media type did not match its source row." }, { status: 400 });
  }
  if (seen.size !== recordByKey.size) return NextResponse.json({ error: "Resolve or skip every import row before continuing." }, { status: 409 });

  await client.from("import_jobs").update({ status: "importing", conflict_policy: parsed.data.conflictPolicy, started_at: new Date().toISOString(), error_summary: null }).eq("id", jobId).eq("user_id", userId);
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  let wasReimport = false;
  let failed = 0;
  for (const resolution of parsed.data.resolutions) {
    const record = recordByKey.get(resolution.sourceRecordKey)!;
    if (resolution.decision !== "accepted" || !resolution.selected) {
      await client.from("import_records").update({ resolution_status: "skipped" }).eq("id", record.id).eq("user_id", userId);
      skipped += 1;
      continue;
    }
    const { data, error } = await client.rpc("apply_import_record", {
      p_import_record_id: String(record.id), p_selected_media: jsonValue(resolution.selected), p_conflict_policy: parsed.data.conflictPolicy,
    });
    if (error) {
      failed += 1;
      await client.from("import_records").update({ resolution_status: "failed", error_summary: "This record could not be applied." }).eq("id", record.id).eq("user_id", userId);
      continue;
    }
    const result = data as { changes?: number; conflicts?: number; reimport?: boolean } | null;
    if ((result?.changes ?? 0) > 0) imported += 1;
    else skipped += 1;
    conflicts += result?.conflicts ?? 0;
    wasReimport ||= result?.reimport ?? false;
  }
  const completedAt = new Date();
  await client.from("import_jobs").update({
    status: failed ? "failed" : "completed", completed_at: completedAt.toISOString(),
    skipped_records: skipped, failed_records: failed,
    error_summary: failed ? `${failed} record${failed === 1 ? "" : "s"} could not be applied. Retry is safe.` : null,
  }).eq("id", jobId).eq("user_id", userId);
  return NextResponse.json({ imported, skipped, conflicts, wasReimport, failed }, { status: failed ? 207 : 200 });
}
