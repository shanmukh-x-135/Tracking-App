import type { ImportSource } from "@/lib/imports/types";

export type ImportHistoryStatus = "uploaded" | "needs_review" | "ready" | "importing" | "completed" | "failed" | "undone" | "partially_undone";

export interface ImportHistoryItem {
  id: string;
  source: ImportSource;
  filename: string;
  status: ImportHistoryStatus;
  totalRecords: number;
  importedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  createdAt: string;
  completedAt?: string;
  errorSummary?: string;
}

export interface ImportUndoResult {
  removed: number;
  preserved: number;
  missing: number;
}
