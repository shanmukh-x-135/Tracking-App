import { applyMutation } from "@/lib/persistence/domain";
import { emptyMosaicState, type MosaicState, type PersistenceGateway } from "@/lib/persistence/types";
import { applyMockImport, type ImportApplyResult } from "@/lib/imports/apply-mock";
import type { ImportConflictPolicy, ReconciliationRow } from "@/lib/imports/types";
import type { ImportHistoryItem, ImportUndoResult } from "@/lib/imports/history";

function storageKey(userId: string): string { return `mosaic:state:${userId}`; }
function importHistoryKey(userId: string): string { return `mosaic:import-history:${userId}`; }

interface StoredMockImport extends ImportHistoryItem {
  beforeState: MosaicState;
  afterState: MosaicState;
}

function read(userId: string): MosaicState {
  const value = window.localStorage.getItem(storageKey(userId));
  if (!value) return emptyMosaicState();
  try { return { ...emptyMosaicState(), ...JSON.parse(value) as MosaicState }; } catch { return emptyMosaicState(); }
}

export const mockPersistenceGateway: PersistenceGateway = {
  async load(userId) { return read(userId); },
  async mutate(userId, mutation) {
    const state = applyMutation(read(userId), mutation);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
    return state;
  },
};

export async function applyMockImportToStorage(userId: string, rows: ReconciliationRow[], policy: ImportConflictPolicy, details: { id: string; source: ImportHistoryItem["source"]; filename: string }): Promise<ImportApplyResult> {
  const beforeState = read(userId);
  const applied = applyMockImport(beforeState, rows, policy);
  window.localStorage.setItem(storageKey(userId), JSON.stringify(applied.state));
  const history = readMockImportHistoryRecords(userId);
  const completedAt = new Date().toISOString();
  const entry: StoredMockImport = {
    id: details.id, source: details.source, filename: details.filename, status: "completed",
    totalRecords: rows.length, importedRecords: applied.result.imported, skippedRecords: applied.result.skipped,
    failedRecords: 0, createdAt: completedAt, completedAt, beforeState, afterState: applied.state,
  };
  const next = [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, 20);
  window.localStorage.setItem(importHistoryKey(userId), JSON.stringify(next));
  return applied.result;
}

function readMockImportHistoryRecords(userId: string): StoredMockImport[] {
  try { return JSON.parse(window.localStorage.getItem(importHistoryKey(userId)) ?? "[]") as StoredMockImport[]; }
  catch { return []; }
}

export function readMockImportHistory(userId: string): ImportHistoryItem[] {
  return readMockImportHistoryRecords(userId).map((item) => ({
    id: item.id, source: item.source, filename: item.filename, status: item.status,
    totalRecords: item.totalRecords, importedRecords: item.importedRecords,
    skippedRecords: item.skippedRecords, failedRecords: item.failedRecords,
    createdAt: item.createdAt, completedAt: item.completedAt, errorSummary: item.errorSummary,
  }));
}

export function undoMockImport(userId: string, jobId: string): ImportUndoResult {
  const history = readMockImportHistoryRecords(userId);
  const job = history.find(({ id }) => id === jobId);
  if (!job || job.status !== "completed") throw new Error("That import cannot be undone.");
  const current = read(userId);
  if (JSON.stringify(current) !== JSON.stringify(job.afterState)) {
    job.status = "partially_undone";
    job.errorSummary = "Later edits were preserved, so Mosaic did not remove this import automatically.";
    window.localStorage.setItem(importHistoryKey(userId), JSON.stringify(history));
    return { removed: 0, preserved: job.importedRecords, missing: 0 };
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(job.beforeState));
  job.status = "undone";
  window.localStorage.setItem(importHistoryKey(userId), JSON.stringify(history));
  return { removed: job.importedRecords, preserved: 0, missing: 0 };
}
