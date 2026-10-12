"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUp, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { statusLabels } from "@/components/explore/library-card";
import { mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { askMosaic, AssistantRequestError, plainAnswer } from "@/lib/assistant/client";
import type { AssistantRef } from "@/lib/assistant/contract";
import { getPublicEnvironment } from "@/lib/config/env";
import { parseProviderKey } from "@/lib/media/identity";
import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { LibraryStatus, MosaicState } from "@/lib/persistence/types";
import "./assistant.css";

interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  status?: string;
  cited: string[];
  scope: { tool: string; summary: string }[];
  error?: string;
  truncated?: boolean;
  done?: boolean;
  question?: string;
}

const noticeKey = "mosaic:ai-notice:v1";
const mediumLabels = { movie: "Movie", tv: "Series", game: "Game", book: "Book" } as const;

function readNotice(): boolean {
  try { return window.localStorage.getItem(noticeKey) === "accepted"; } catch { return false; }
}

function refHref(ref: AssistantRef): string {
  return mediaHref({ ...ref.media, genres: [] } as CatalogMedia);
}

function trackedTitle(state: MosaicState, key: string): string | undefined {
  const all = [...state.library.map(({ media }) => media), ...state.movieWatches.map(({ media }) => media), ...state.episodeWatches.map(({ series }) => series), ...state.gamePlaythroughs.map(({ media }) => media), ...state.bookReadings.map(({ media }) => media)];
  return all.find((media) => mediaKey(media) === key)?.title;
}

function starters(state: MosaicState, about?: string): string[] {
  if (about) return ["How far am I with this?", "What's similar that I haven't tracked?", "When did I last log this?"];
  const has = (type: string) => state.library.some(({ media }) => media.mediaType === type);
  return [
    has("movie") || has("tv") ? "What should I watch next from my watchlist?" : undefined,
    has("book") ? "Which books have I started but not finished?" : undefined,
    has("game") ? "What games am I currently playing?" : undefined,
    "Which movies did I rate highest?",
    "What did I log this month?",
    state.lists.length ? "What's on my lists?" : "Recommend something based on what I rated highly",
  ].filter((item): item is string => Boolean(item)).slice(0, 5);
}

function errorText(error: unknown): string {
  if (error instanceof AssistantRequestError) {
    if (error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
      const at = new Date(Date.now() + error.retryAfterSeconds * 1000);
      return `${error.message} Try again after ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    }
    return error.message;
  }
  return "Mosaic AI couldn't answer right now. Check your connection and try again.";
}

function AnswerText({ text, refs }: { text: string; refs: Map<string, AssistantRef> }) {
  const parts = text.split(/(\[\[r\d+\]\])/g);
  return <p className="ask-answer-text">{parts.map((part, index) => {
    const id = /^\[\[(r\d+)\]\]$/.exec(part)?.[1];
    if (!id) return <Fragment key={index}>{part}</Fragment>;
    const ref = refs.get(id);
    return ref ? <Link key={index} className={`ask-chip ${ref.origin}`} href={refHref(ref)}>{ref.media.title}</Link> : null;
  })}</p>;
}

function factLine(ref: AssistantRef): string {
  const facts = ref.facts ?? {};
  const parts = [mediumLabels[ref.media.mediaType], ref.media.releaseYear ? String(ref.media.releaseYear) : undefined];
  if (ref.origin === "your_mosaic") {
    if (typeof facts.status === "string" && facts.status in statusLabels) parts.push(statusLabels[facts.status as LibraryStatus]);
    if (typeof facts.userRating === "number") parts.push(`Your rating ★ ${facts.userRating}`);
  } else if (typeof facts.source === "string") parts.push(`via ${facts.source}`);
  return parts.filter(Boolean).join(" · ");
}

function RefCards({ refs, label, note }: { refs: AssistantRef[]; label: string; note?: string }) {
  if (!refs.length) return null;
  return <section className="ask-cards" aria-label={label}>
    <h3><span>{label}</span>{note && <small>{note}</small>}</h3>
    <div className="ask-card-row">{refs.map((ref) => <Link key={ref.id} className={`ask-card ${ref.origin}`} href={refHref(ref)}>
      <span className="ask-card-art"><Image src={ref.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="64px"/></span>
      <span className="ask-card-copy"><strong>{ref.media.title}</strong><em>{factLine(ref)}</em>{ref.reason && <small>{ref.reason}</small>}</span>
    </Link>)}</div>
  </section>;
}

export function AskPage() {
  const { user, isLoading } = useAuth();
  const { state } = useMosaicState();
  const params = useSearchParams();
  const aboutParam = params.get("about") ?? undefined;
  const [about, setAbout] = useState(aboutParam && parseProviderKey(aboutParam) ? aboutParam : undefined);
  const [draft, setDraft] = useState(params.get("q") ?? "");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [refs, setRefs] = useState<Map<string, AssistantRef>>(new Map());
  const [busy, setBusy] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const isMock = getPublicEnvironment().dataMode === "mock";

  useEffect(() => { setNoticeAccepted(readNotice()); }, []);
  useEffect(() => () => controller.current?.abort(), []);
  // Return focus to the composer after every answer (the clicked starter may have unmounted).
  useEffect(() => { if (!busy && turns.length) composer.current?.focus(); }, [busy, turns.length]);
  const aboutTitle = useMemo(() => (about ? trackedTitle(state, about) ?? "this title" : undefined), [about, state]);

  const update = useCallback((id: number, change: (turn: Turn) => Turn) => setTurns((current) => current.map((turn) => (turn.id === id ? change(turn) : turn))), []);

  const send = useCallback(async (question: string) => {
    const message = question.trim();
    if (!message || busy) return;
    // Earlier turns go back as plain text; refs are re-derived from the user's records each time.
    const history = turns.filter((turn) => turn.done !== false && !turn.error).slice(-8).map((turn) => ({ role: turn.role, text: plainAnswer(turn.text, refs).slice(0, 4000) }));
    const userTurn: Turn = { id: nextId.current++, role: "user", text: message, cited: [], scope: [] };
    const answerId = nextId.current++;
    setTurns((current) => [...current, userTurn, { id: answerId, role: "assistant", text: "", cited: [], scope: [], status: "Thinking", done: false, question: message }]);
    setDraft("");
    setBusy(true);
    setAnnouncement("Mosaic AI is answering");
    const abort = new AbortController();
    controller.current = abort;
    try {
      await askMosaic({
        message, history, about, mockState: isMock ? state : undefined, signal: abort.signal,
        onEvent(event) {
          if (event.type === "text") update(answerId, (turn) => ({ ...turn, text: turn.text + event.delta, status: undefined }));
          else if (event.type === "status") { update(answerId, (turn) => ({ ...turn, status: event.label })); setAnnouncement(event.label); }
          else if (event.type === "refs") setRefs((current) => { const next = new Map(current); event.refs.forEach((ref) => next.set(ref.id, ref)); return next; });
          else if (event.type === "scope") update(answerId, (turn) => ({ ...turn, scope: event.items }));
          else if (event.type === "done") update(answerId, (turn) => ({ ...turn, cited: event.cited, truncated: event.truncated, done: true, status: undefined }));
          else update(answerId, (turn) => ({ ...turn, error: event.message, done: true, status: undefined }));
        },
      });
      update(answerId, (turn) => (turn.done ? turn : { ...turn, done: true, status: undefined, error: turn.text ? undefined : "Mosaic AI stopped before answering." }));
      setAnnouncement("Answer ready");
    } catch (error) {
      if (abort.signal.aborted) {
        update(answerId, (turn) => ({ ...turn, done: true, status: undefined, error: turn.text ? undefined : "Stopped.", truncated: Boolean(turn.text) }));
        setAnnouncement("Stopped");
      } else {
        update(answerId, (turn) => ({ ...turn, done: true, status: undefined, error: errorText(error) }));
        setAnnouncement("Mosaic AI couldn't answer");
      }
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }, [about, busy, isMock, refs, state, turns, update]);

  const stop = () => controller.current?.abort();
  const acceptNotice = () => {
    try { window.localStorage.setItem(noticeKey, "accepted"); } catch { /* still accepted for this visit */ }
    setNoticeAccepted(true);
    composer.current?.focus();
  };

  if (isLoading) return <main className="page ask-page" aria-busy="true"/>;
  if (!user) return <main className="page ask-page"><div className="ask-shell"><div className="empty-state"><h2>Sign in to ask your Mosaic</h2><p>Mosaic AI answers from your own library, ratings and history.</p><Link className="button primary" href="/login?returnTo=%2Fask">Sign in</Link></div></div></main>;

  return <main className="page ask-page">
    <div className="ask-shell">
      <header className="ask-head">
        <span className="eyebrow"><Sparkles size={13}/> Mosaic AI</span>
        <h1>Ask your Mosaic</h1>
        <p>Questions about your library, progress, ratings, lists and history. Answers come from your own records; suggestions are always labelled. Mosaic AI can read, never change.</p>
      </header>

      {about && <div className="ask-about"><span>Asking about <strong>{aboutTitle}</strong></span><button type="button" className="icon-button" aria-label="Stop asking about this title" onClick={() => setAbout(undefined)}><X size={15}/></button></div>}

      <ol className="ask-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
        {turns.map((turn) => {
          if (turn.role === "user") return <li key={turn.id} className="ask-turn user"><p>{turn.text}</p></li>;
          const cited = turn.cited.map((id) => refs.get(id)).filter((ref): ref is AssistantRef => Boolean(ref));
          return <li key={turn.id} className="ask-turn assistant" aria-busy={!turn.done}>
            {turn.status && <p className="ask-status"><span className="ask-pulse" aria-hidden="true"/>{turn.status}…</p>}
            {turn.text && <AnswerText text={turn.text} refs={refs}/>}
            {turn.truncated && <p className="ask-note">This answer was cut short.</p>}
            {turn.error && <div className="ask-error" role="alert"><span>{turn.error}</span>{turn.question && <button type="button" className="button compact" onClick={() => void send(turn.question!)} disabled={busy}><RotateCcw size={13}/>Retry</button>}</div>}
            {turn.done && <>
              <RefCards refs={cited.filter((ref) => ref.origin === "your_mosaic")} label="From your Mosaic" note="Your records"/>
              <RefCards refs={cited.filter((ref) => ref.origin === "catalog")} label="Suggestions" note="Suggested by Mosaic AI · catalog data"/>
              {turn.scope.length > 0 && <details className="ask-scope"><summary>What I looked at</summary><ul>{turn.scope.map((item, index) => <li key={index}>{item.summary}</li>)}</ul></details>}
            </>}
          </li>;
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {!turns.length && noticeAccepted && <div className="ask-starters" aria-label="Suggested questions">{starters(state, about).map((question) => <button key={question} type="button" className="ask-starter" onClick={() => void send(question)}>{question}</button>)}</div>}

      {!noticeAccepted ? <section className="ask-notice glass" aria-labelledby="ask-notice-title">
        <h2 id="ask-notice-title">Before you ask</h2>
        <p>Your question and the minimum Mosaic data needed to answer it (titles, statuses, ratings, progress and dates — never reviews or notes) are sent to an AI model through OpenRouter, using zero-data-retention routing. Mosaic doesn&apos;t save your conversation; it disappears when you leave this page.</p>
        <button type="button" className="button primary" onClick={acceptNotice}>I understand</button>
      </section> : <form className="ask-composer glass" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <label className="sr-only" htmlFor="ask-input">Ask about your Mosaic</label>
        <textarea id="ask-input" ref={composer} value={draft} maxLength={1000} rows={1} autoFocus placeholder={about ? `Ask about ${aboutTitle}` : "Ask about your library, progress or history"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
            if (event.key === "Escape" && busy) { event.preventDefault(); stop(); }
          }}/>
        {busy ? <button type="button" className="ask-send" aria-label="Stop answering" onClick={stop}><Square size={15} fill="currentColor"/></button>
          : <button type="submit" className="ask-send" aria-label="Send question" disabled={!draft.trim()}><ArrowUp size={18}/></button>}
      </form>}
      <p className="ask-footnote">Read-only · Answers can be wrong; your Library is the record. <Link href="/library">Open Library</Link></p>
    </div>
  </main>;
}
