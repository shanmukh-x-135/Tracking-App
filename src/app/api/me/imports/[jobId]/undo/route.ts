import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success) return NextResponse.json({ error: "Invalid import job." }, { status: 400 });
  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await client.rpc("undo_import_job", { p_import_job_id: jobId });
  if (error) return NextResponse.json({ error: "This import could not be undone. It may not belong to you or may no longer be eligible." }, { status: 409 });
  return NextResponse.json(data);
}
