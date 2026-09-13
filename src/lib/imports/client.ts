"use client";

import { getPublicEnvironment } from "@/lib/config/env";
import { applyMockImportToStorage, readMockImportHistory, undoMockImport } from "@/lib/persistence/mock-gateway";
import type { ImportApplyResult } from "@/lib/imports/apply-mock";
import type { ImportConflictPolicy, ImportPreview } from "@/lib/imports/types";
import type { ImportHistoryItem, ImportUndoResult } from "@/lib/imports/history";

export async function applyImportPreview(userId: string, preview: ImportPreview, conflictPolicy: ImportConflictPolicy): Promise<ImportApplyResult> {
  if (getPublicEnvironment().dataMode === "mock") return applyMockImportToStorage(userId, preview.rows, conflictPolicy, { id: preview.jobId ?? `mock-${Date.now()}`, source: preview.source, filename: preview.filename });
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

export async function loadImportHistory(userId: string): Promise<ImportHistoryItem[]> {
  if (getPublicEnvironment().dataMode === "mock") return readMockImportHistory(userId);
  const response = await fetch("/api/me/imports");
  const body = await response.json().catch(() => null) as { jobs?: ImportHistoryItem[]; error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "Import history could not be loaded.");
  return body?.jobs ?? [];
}

export async function undoImport(userId: string, jobId: string): Promise<ImportUndoResult> {
  if (getPublicEnvironment().dataMode === "mock") return undoMockImport(userId, jobId);
  const response = await fetch(`/api/me/imports/${encodeURIComponent(jobId)}/undo`, { method: "POST" });
  const body = await response.json().catch(() => null) as (ImportUndoResult & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? "This import could not be undone.");
  return body;
}
