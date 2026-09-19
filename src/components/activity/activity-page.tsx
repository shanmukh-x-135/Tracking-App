"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { RatingInput } from "@/components/ui/rating-input";
import { activityLabel, projectActivity } from "@/lib/activity/projection";
import type { CatalogMedia } from "@/lib/media/types";
import type { MovieWatch } from "@/lib/persistence/types";
import type { MediaType } from "@/types/media";
import { AnimatePresence, motion, motionTokens } from "@/components/motion/motion";

type ActivityItem = { media: CatalogMedia; date: string; action: string; detail?: string; movieWatch?: MovieWatch };
const filters: [string, MediaType | null][] = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function DiaryEdit({ watch, onCancel }: { watch: MovieWatch; onCancel(): void }) {
  const { mutate } = useMosaicState();
  const [rating, setRating] = useState(watch.rating ?? 0);
  return <form className="inline-form diary-edit" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const viewingContext = String(form.get("viewingContext") || "") || undefined;
    void mutate({ type: "movie.update", watchId: watch.id, media: watch.media, watchedAt: String(form.get("watchedAt")), isRewatch: form.get("rewatch") === "on", rating: rating || undefined, review: String(form.get("review") || "") || undefined, viewingContext: viewingContext as MovieWatch["viewingContext"], streamingService: viewingContext === "streaming" ? String(form.get("streamingService") || "") || undefined : undefined }).then(onCancel).catch(() => undefined);
  }}><label className="field">Watched date<input name="watchedAt" type="date" defaultValue={watch.watchedAt}/></label><label className="field">Viewing context<select name="viewingContext" defaultValue={watch.viewingContext ?? ""}><option value="">Not specified</option><option value="theater">Theater</option><option value="streaming">Streaming</option><option value="television">TV / Broadcast</option><option value="physical">Blu-ray / DVD</option><option value="digital">Digital purchase/rental</option><option value="other">Other</option></select></label><label className="field">Streaming service<input name="streamingService" defaultValue={watch.streamingService} placeholder="Optional"/></label><div className="field"><RatingInput value={rating} onChange={setRating}/></div><label className="check-field"><input name="rewatch" type="checkbox" defaultChecked={watch.isRewatch}/> Rewatch</label><label className="field full">Review (optional)<textarea name="review" defaultValue={watch.review}/></label><button className="button accent" type="submit">Save watch</button><button className="button" type="button" onClick={onCancel}>Cancel</button></form>;
}

export function ActivityPage() {
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const searchParams = useSearchParams();
  const isDiary = searchParams.get("view") === "diary";
  const requestedType = searchParams.get("type");
  const type = isDiary ? "movie" : filters.find(([, value]) => value === requestedType)?.[1] ?? null;
  const [editingWatch, setEditingWatch] = useState<MovieWatch>();
  const activity = useMemo<ActivityItem[]>(() => {
    const movies = new Map(state.movieWatches.map((watch) => [watch.id, watch]));
    return projectActivity(state)
      .filter((event) => !type || event.mediaType === type)
      .map((event) => ({
        media: event.media,
        date: event.occurredAt,
        action: activityLabel(event),
        detail: [event.detail, event.rating ? `★ ${event.rating}` : undefined].filter(Boolean).join(" · ") || undefined,
        movieWatch: event.eventType === "movie_watch" ? movies.get(event.eventId.replace("movie-watch:", "")) : undefined,
      }));
  }, [state, type]);

  function selectType(value: MediaType | null) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    if (value) next.set("type", value); else next.delete("type");
    window.history.pushState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your history is private to you</h1><p>Sign in to see every watch, episode, playthrough, and reading update in one place.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Personal history</span><h1>{isDiary ? "Movie diary" : "Activity"}</h1><p>{isDiary ? "Every movie watch, rewatch, rating, and review in one chronological record." : "A chronological record of the stories you have watched, played, and read."}</p>{isDiary ? <Link className="text-link" href="/activity">View all activity →</Link> : <Link className="text-link" href="/activity?view=diary">Open movie diary →</Link>}</header>
    {!isDiary && <div className="filter-bar glass" aria-label="Activity media type">{filters.map(([label, value]) => <button key={label} className={`filter-button ${type === value ? "active" : ""}`} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>)}</div>}
    {activity.length ? isDiary ? <motion.div layout className="diary-list">{activity.map((item) => { const watch = item.movieWatch!; return <motion.div layout key={watch.id}><article className="diary-entry"><time>{displayDate(item.date)}</time><Link className="diary-poster" href={mediaHref(item.media)}><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="64px"/></Link><Link className="diary-copy" href={mediaHref(item.media)}><strong>{item.media.title}</strong><span>{item.action}{item.detail ? ` · ${item.detail}` : ""}</span>{watch.review && <p>{watch.review}</p>}</Link><div className="diary-actions"><button className="button" type="button" onClick={() => setEditingWatch(watch)}>Edit</button><button className="button" type="button" onClick={() => { if (window.confirm(`Delete this ${watch.isRewatch ? "rewatch" : "watch"} of ${watch.media.title}?`)) void mutate({ type: "movie.delete", watchId: watch.id }).catch(() => undefined); }}>Delete</button></div></article>{editingWatch?.id === watch.id && <DiaryEdit watch={watch} onCancel={() => setEditingWatch(undefined)}/>}</motion.div>; })}</motion.div> : <motion.div layout className="activity-timeline"><AnimatePresence mode="popLayout">{activity.map((item, index) => <motion.div layout key={`${item.media.provider}:${item.media.providerId}:${item.date}:${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTokens.fast}><Link className="history-card" href={mediaHref(item.media)}><span className="history-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</small><strong>{item.media.title}</strong><em>{item.action}{item.detail ? ` · ${item.detail}` : ""}</em></span><time>{displayDate(item.date)}</time></Link></motion.div>)}</AnimatePresence></motion.div> : <div className="empty-state"><h2>No {isDiary ? "movie watches" : type === "tv" ? "series" : type ?? "activity"} yet</h2><p>Use Quick Log to add the next moment to your Mosaic history.</p><Link className="button primary" href="/discover">Discover stories</Link></div>}
  </div></div>;
}
