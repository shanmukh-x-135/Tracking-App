"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Clock3, Download, FileArchive, FileSpreadsheet, LoaderCircle, RotateCcw, Search, ShieldCheck, SkipForward, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { applyImportPreview, loadImportHistory, undoImport } from "@/lib/imports/client";
import type { ImportApplyResult } from "@/lib/imports/apply-mock";
import type { ImportHistoryItem } from "@/lib/imports/history";
import { acceptHighConfidence, previewCounts, selectCandidate, skipReconciliationRow } from "@/lib/imports/reconciliation";
import type { ImportConflictPolicy, ImportPreview, ImportSource, ReconciliationRow } from "@/lib/imports/types";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { AuthUser } from "@/lib/auth/types";
import { createMosaicExportArchive, mosaicDataFromState, mosaicExportFilename } from "@/lib/exports/mosaic-export";

const sources: { value: ImportSource; label: string; detail: string; native: boolean }[] = [
  { value: "letterboxd", label: "Letterboxd", detail: "Official account export (.zip)", native: true },
  { value: "generic_movies", label: "Movies CSV", detail: "Mosaic movie template", native: false },
  { value: "serializd_normalized_v1", label: "Serializd JSON", detail: "Recommended: prepared normalized export v1", native: false },
  { value: "serializd", label: "Serializd CSV", detail: "Legacy / limited: Mosaic series template", native: false },
  { value: "backloggd", label: "Backloggd", detail: "Use Mosaic's games CSV template", native: false },
  { value: "fable", label: "Fable", detail: "Use Mosaic's books CSV template", native: false },
];

function storageKey(userId: string): string { return `mosaic:import-preview:${userId}`; }

function Candidate({ media, onChoose }: { media: CatalogMedia; onChoose(): void }) {
  return <button className="import-candidate" type="button" onClick={onChoose}>
    <span className="import-poster"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="48px"/></span>
    <span><strong>{media.title}</strong><small>{media.releaseYear ?? "Year unavailable"} · {media.mediaType === "tv" ? "Series" : media.mediaType}</small></span>
    <Check size={15}/>
  </button>;
}

function ReconciliationItem({ row, onChange }: { row: ReconciliationRow; onChange(row: ReconciliationRow): void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  async function search() {
    if (query.trim().length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json() as CatalogSearchResult;
      setResults((body.items ?? []).filter((media) => media.mediaType === row.record.mediaType).slice(0, 4));
    } finally { setIsSearching(false); }
  }
  if (row.record.source === "serializd_normalized_v1") return <article className={`reconcile-row ${row.decision}`}><div className="reconcile-source"><span className="type-badge">Series</span><strong>{row.selected?.title ?? row.record.title}</strong><small>{row.record.mediaType === "tv" ? [row.record.recordKind?.replaceAll("_", " "),row.record.targetType,row.record.isRewatch ? "Rewatch" : undefined].filter(Boolean).join(" · ") : ""}</small></div><div className="reconcile-match"><strong>{row.decision === "skipped" ? "Skipped duplicate / source record" : row.match.confidence === "exact" ? "Resolved from exact TMDB ID" : "Provider target unresolved — retry preview or skip"}</strong><small>{row.record.providerIdentity?.providerId}</small></div>{row.decision !== "skipped" && <button className="button ghost" type="button" onClick={() => onChange(skipReconciliationRow(row))}>Skip</button>}</article>;
  return <article className={`reconcile-row ${row.decision}`}>
    <div className="reconcile-source"><span className="type-badge">{row.record.mediaType === "tv" ? "Series" : row.record.mediaType}</span><strong>{row.record.title}</strong><small>{[row.record.year, row.record.rating ? `${row.record.rating}★` : undefined].filter(Boolean).join(" · ") || "No extra metadata"}</small></div>
    <div className="reconcile-match">
      {row.selected ? <Candidate media={row.selected} onChoose={() => onChange({ ...row, decision: "review", selected: undefined })}/> : <>
        {row.match.candidates.slice(0, 3).map((candidate) => <Candidate key={`${candidate.media.provider}:${candidate.media.providerId}`} media={candidate.media} onChoose={() => onChange(selectCandidate(row, candidate.media))}/>)}
        <form className="manual-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label><span className="sr-only">Search manually for {row.record.title}</span><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search manually"/></label><button className="button ghost" type="submit" disabled={isSearching}>{isSearching ? <LoaderCircle className="spin" size={14}/> : "Search"}</button></form>
        {results.map((media) => <Candidate key={`${media.provider}:${media.providerId}`} media={media} onChoose={() => onChange(selectCandidate(row, media))}/>)}
      </>}
    </div>
    <button className="icon-button" type="button" aria-label={`Skip ${row.record.title}`} title="Skip this row" onClick={() => onChange(skipReconciliationRow(row))}><SkipForward size={16}/></button>
  </article>;
}

export function DataSettings() {
  const { user, isLoading: authLoading } = useAuth();
  if (authLoading) return <div className="page"><div className="data-loading"><LoaderCircle className="spin"/>Loading your data settings…</div></div>;
  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><ShieldCheck size={28}/><h1>Sign in to manage your data</h1><p>Imports, history, and exports are private to your Mosaic account.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;
  return <AuthenticatedDataSettings key={user.id} user={user}/>;
}

function restoredPreview(userId: string): ImportPreview | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = window.localStorage.getItem(storageKey(userId));
    return saved ? JSON.parse(saved) as ImportPreview : undefined;
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return undefined;
  }
}

function AuthenticatedDataSettings({ user }: { user: AuthUser }) {
  const { state, refresh } = useMosaicState();
  const [source, setSource] = useState<ImportSource>("letterboxd");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [error, setError] = useState<string>();
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [conflictPolicy, setConflictPolicy] = useState<ImportConflictPolicy>("review");
  const [importFavorites, setImportFavorites] = useState(true);
  const [result, setResult] = useState<ImportApplyResult>();
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [undoingId, setUndoingId] = useState<string>();
  const [isExporting, setIsExporting] = useState(false);
  const [visibleRecords, setVisibleRecords] = useState(50);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreview(restoredPreview(user.id)), 0);
    return () => window.clearTimeout(timer);
  }, [user.id]);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await loadImportHistory(user.id)); } catch { /* Import remains usable when history is temporarily unavailable. */ }
  }, [user.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshHistory]);

  function savePreview(next: ImportPreview) {
    setPreview(next);
    try { window.localStorage.setItem(storageKey(user.id), JSON.stringify(next)); } catch { /* The server-side job remains resumable in live mode. */ }
  }

  function updateRow(index: number, row: ReconciliationRow) {
    if (!preview) return;
    const rows = preview.rows.map((current, currentIndex) => currentIndex === index ? row : current);
    savePreview({ ...preview, rows, counts: previewCounts(rows, preview.counts.duplicates, preview.counts.invalid) });
  }

  async function parseFile() {
    if (!file) return;
    setIsParsing(true); setError(undefined);
    try {
      const response = await fetch("/api/me/imports/preview", { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-import-source": source, "x-file-name": encodeURIComponent(file.name) }, body: file });
      const body = await response.json() as ImportPreview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Mosaic could not read that export.");
      savePreview(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mosaic could not read that export."); }
    finally { setIsParsing(false); }
  }

  async function applyImport() {
    if (!preview) return;
    setIsImporting(true); setError(undefined);
    try {
      const applied = await applyImportPreview(user.id, preview, conflictPolicy, importFavorites);
      await refresh();
      await refreshHistory();
      setResult(applied);
      window.localStorage.removeItem(storageKey(user.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mosaic could not apply this import."); }
    finally { setIsImporting(false); }
  }

  async function undo(job: ImportHistoryItem) {
    if (!window.confirm(`Undo the unchanged rows created by ${job.filename}? Later edits will be preserved.`)) return;
    setUndoingId(job.id); setError(undefined);
    try { await undoImport(user.id, job.id); await refresh(); await refreshHistory(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This import could not be undone."); }
    finally { setUndoingId(undefined); }
  }

  async function downloadExport() {
    setIsExporting(true); setError(undefined);
    try {
      const isLive = process.env.NEXT_PUBLIC_DATA_MODE === "live";
      const blob = isLive
        ? await fetch("/api/me/export").then(async (response) => {
            if (!response.ok) throw new Error("Your Mosaic export could not be prepared.");
            return response.blob();
          })
        : (() => {
            const archive = createMosaicExportArchive(mosaicDataFromState(user, state));
            const bytes = new Uint8Array(archive.byteLength);
            bytes.set(archive);
            return new Blob([bytes.buffer], { type: "application/zip" });
          })();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = mosaicExportFilename();
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your Mosaic export could not be prepared."); }
    finally { setIsExporting(false); }
  }

  const counts = preview?.counts;
  const canImport = Boolean(preview && counts && counts.invalid === 0 && counts.needsReview === 0 && preview.rows.some((row) => row.decision === "accepted"));
  const selectedSource = sources.find((item) => item.value === source)!;
  const isNormalized = source === "serializd_normalized_v1";
  const template = source === "serializd" ? "series" : source === "backloggd" ? "games" : source === "fable" ? "books" : source.replace("generic_", "");
  const summary = useMemo(() => counts ? [
    ["Records", counts.total], ["Matched", counts.automaticMatches], ["Needs review", counts.needsReview], ["Watch history", counts.movieWatches + counts.episodeWatches],
    ["Ratings", counts.ratings], ["Reviews", counts.reviews], ["Lists", counts.lists], ["Invalid", counts.invalid],
  ] : [], [counts]);

  if (result) return <div className="page data-page"><div className="page-narrow"><div className="import-result"><span className="result-check"><Check size={30}/></span><span className="eyebrow">Import complete</span><h1>Your history is home.</h1><p>{result.imported} record{result.imported === 1 ? "" : "s"} applied, {result.skipped} safely skipped{result.conflicts ? `, and ${result.conflicts} conflict${result.conflicts === 1 ? " was" : "s were"} handled by your policy` : ""}.</p>{result.wasReimport && <p className="import-idempotent"><ShieldCheck size={15}/>Mosaic recognized previously imported rows and did not duplicate them.</p>}<div className="actions"><Link className="button primary" href="/library">View your library</Link><Link className="button" href="/profile">See updated stats</Link><button className="button ghost" type="button" onClick={() => { setResult(undefined); setPreview(undefined); setFile(undefined); }}>Manage imports</button></div></div></div></div>;

  return <div className="page data-page"><div className="page-narrow">
    <header className="page-hero data-hero"><span className="eyebrow">Your data, in your hands</span><h1>Bring your history with you.</h1><p>Preview every match before Mosaic changes your library. Your original upload is processed transiently and is not exposed to other members.</p></header>
    <section className="export-panel glass"><span className="export-icon"><Download size={19}/></span><div><span className="eyebrow">Data portability</span><h2>Take your Mosaic data with you.</h2><p>Download a versioned ZIP with JSON and spreadsheet-safe CSV copies of your profile, library, history, ratings, reviews, and lists.</p></div><button className="button" type="button" disabled={isExporting} onClick={() => void downloadExport()}>{isExporting ? <LoaderCircle className="spin" size={15}/> : <Download size={15}/>}Download Mosaic data</button></section>
    <ol className="import-steps" aria-label="Import progress"><li className="active">1 <span>Choose</span></li><li className={preview ? "active" : ""}>2 <span>Reconcile</span></li><li>3 <span>Import</span></li></ol>

    {!preview ? <><div className="import-layout">
      <section><div className="section-head"><div><h2>Choose a source</h2><p>Native where a trustworthy export exists; templates everywhere else.</p></div></div><div className="source-grid">{sources.map((item) => <button type="button" key={item.value} className={`source-card ${source === item.value ? "selected" : ""}`} onClick={() => { setSource(item.value); setFile(undefined); }}><span className="source-icon">{item.native ? <FileArchive/> : <FileSpreadsheet/>}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{source === item.value && <Check size={17}/>}</button>)}</div></section>
      <section className="upload-panel glass"><span className="eyebrow">{selectedSource.label}</span><h2>Drop in your {source === "letterboxd" ? "export" : isNormalized ? "normalized JSON" : "CSV"}</h2><p>{selectedSource.detail}. Mosaic accepts files up to 12 MB and shows a dry run first.</p>{source !== "letterboxd" && !isNormalized && <a className="text-link template-link" href={`/templates/${template}.csv`} download>Download the {template} template ↓</a>}<button className="upload-drop" type="button" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files[0]); }}><Upload size={25}/><strong>{file?.name ?? "Choose a file or drop it here"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB` : source === "letterboxd" ? ".zip" : isNormalized ? ".json" : ".csv"}</small></button><input ref={input} className="sr-only" type="file" accept={source === "letterboxd" ? ".zip,application/zip" : isNormalized ? ".json,application/json" : ".csv,text/csv"} onChange={(event) => setFile(event.target.files?.[0])}/>{error && <p className="form-error"><AlertCircle size={14}/>{error}</p>}<button className="button accent import-continue" type="button" disabled={!file || isParsing} onClick={() => void parseFile()}>{isParsing ? <><LoaderCircle className="spin" size={16}/>Parsing securely…</> : <>Preview import<ArrowRight size={16}/></>}</button></section>
    </div><section className="import-history"><div className="section-head"><div><h2>Import history</h2><p>Undo removes only unchanged rows created by that job.</p></div></div>{history.length ? <div className="history-list">{history.map((job) => <article className="history-row" key={job.id}><span className="history-icon"><Clock3 size={17}/></span><div><strong>{job.filename}</strong><small>{job.source.replace("generic_", "")} · {new Date(job.createdAt).toLocaleDateString()} · {job.totalRecords} records</small>{job.errorSummary && <small className="history-error">{job.errorSummary}</small>}</div><span className={`history-status ${job.status}`}>{job.status.replaceAll("_", " ")}</span>{job.status === "completed" && <button className="button ghost" type="button" disabled={undoingId === job.id} onClick={() => void undo(job)}>{undoingId === job.id ? <LoaderCircle className="spin" size={14}/> : <RotateCcw size={14}/>}Undo</button>}</article>)}</div> : <div className="history-empty">No imports yet. Your completed jobs will appear here.</div>}</section></> : <>
      <section className="preview-head"><div><span className="eyebrow">Dry run · {preview.filename}</span><h2>Review the matches</h2><p>High-confidence matches are selected. Ambiguous and unmatched rows wait for you.</p></div><div className="actions"><button className="button ghost" type="button" onClick={() => { setPreview(undefined); window.localStorage.removeItem(storageKey(user.id)); }}>Start over</button><button className="button" type="button" onClick={() => { const rows = acceptHighConfidence(preview.rows); savePreview({ ...preview, rows, counts: previewCounts(rows, preview.counts.duplicates, preview.counts.invalid) }); }}><Check size={15}/>Accept safe matches</button></div></section>
      <div className="preview-stats">{summary.map(([label, value]) => <div className="preview-stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      {preview.normalizedSummary && <section aria-label="Serializd source reconciliation"><h3>Recognized: Mosaic Serializd Normalized Export v1</h3><div className="preview-stats">{Object.entries(preview.normalizedSummary).map(([label,value]) => <div className="preview-stat" key={label}><strong>{value}</strong><span>{label.replaceAll("_", " ")}</span></div>)}</div><p className="muted">Completed seasons create watched state without fabricated episode dates. Event likes stay in provenance. Existing Mosaic data is preserved by the default conflict policy.</p></section>}
      {(preview.warnings.length > 0 || preview.errors.length > 0) && <div className="import-notices">{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}{preview.errors.slice(0, 5).map((item) => <p className="error" key={`${item.row}:${item.field}:${item.message}`}>Row {item.row}: {item.message}</p>)}</div>}
      {preview.source === "serializd_normalized_v1" && <label><input type="checkbox" checked={importFavorites} onChange={(event) => setImportFavorites(event.target.checked)}/> Import explicit show favorites (never event likes)</label>}
      <section className="reconcile-list" aria-label="Imported records">{preview.rows.slice(0,visibleRecords).map((row, index) => <ReconciliationItem key={row.record.sourceRecordKey} row={row} onChange={(next) => updateRow(index, next)}/>)}</section>{visibleRecords < preview.rows.length && <button className="button" type="button" onClick={() => setVisibleRecords((value) => value + 50)}>Show more records ({preview.rows.length - visibleRecords} remaining)</button>}
      <div className="import-footer glass"><div><strong>{counts?.needsReview ? `${counts.needsReview} record${counts.needsReview === 1 ? "" : "s"} still need review` : "Ready to import"}</strong><small>Nothing has been written to your library yet.</small></div><label className="conflict-policy">On conflicts<select value={conflictPolicy} onChange={(event) => setConflictPolicy(event.target.value as ImportConflictPolicy)}><option value="review">Keep Mosaic and report</option><option value="keep_mosaic">Keep Mosaic</option><option value="use_imported">Use imported</option></select></label><button className="button accent" type="button" disabled={!canImport || isImporting} onClick={() => void applyImport()}>{isImporting ? <><LoaderCircle className="spin" size={15}/>Importing…</> : <>Import selected records<ArrowRight size={16}/></>}</button></div>{error && <p className="form-error import-apply-error"><AlertCircle size={14}/>{error}</p>}
    </>}
  </div></div>;
}
