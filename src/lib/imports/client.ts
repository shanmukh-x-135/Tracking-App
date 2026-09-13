"use client";

import { getPublicEnvironment } from "@/lib/config/env";
import { applyMockImportToStorage } from "@/lib/persistence/mock-gateway";
import type { ImportApplyResult } from "@/lib/imports/apply-mock";
import type { ImportConflictPolicy, ImportPreview } from "@/lib/imports/types";

export async function applyImportPreview(userId: string, preview: ImportPreview, conflictPolicy: ImportConflictPolicy): Promise<ImportApplyResult> {
  if (getPublicEnvironment().dataMode === "mock") return applyMockImportToStorage(userId, preview.rows, conflictPolicy);
  if (!preview.jobId) throw new Error("This import job is missing its server identity. Start the preview again.");
  const response = await fetch(`/api/me/imports/${encodeURIComponent(preview.jobId)}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conflictPolicy,
      resolutions: preview.rows.map((row) => ({ sourceRecordKey: row.record.sourceRecordKey, decision: row.decision, selected: row.selected })),
    }),
  });
  const body = await response.json().catch(() => null) as (ImportApplyResult & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? "Mosaic could not apply this import.");
  return body;
}
