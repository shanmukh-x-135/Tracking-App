"use client";

import Image from "next/image";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { mediaHref } from "@/components/media/media-card";
import { activities, reviews } from "@/data/media";
import { isLiveMode } from "@/lib/config/env";

function diaryDate(value: string): { year: string; month: string; day: string } {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return { year: "Unknown date", month: "", day: value };
  return { year: String(date.getFullYear()), month: new Intl.DateTimeFormat("en", { month: "long" }).format(date), day: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date) };
}

export function ActivityPage() {
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const showFixtureActivity = !isLiveMode();
  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Your circle</span><h1>Activity</h1><p>New ratings, reviews, completions, and progress from you and the people you follow.</p></header>
    {user && <section className="section"><div className="section-head"><div><span className="eyebrow">Movie history</span><h2>Watches</h2></div></div>{state.movieWatches.length ? <div className="diary-list">{state.movieWatches.slice().sort((first, second) => second.watchedAt.localeCompare(first.watchedAt)).map((watch, index, all) => { const date = diaryDate(watch.watchedAt); const previous = all[index - 1] ? diaryDate(all[index - 1].watchedAt) : undefined; const showYear = !previous || previous.year !== date.year; const showMonth = !previous || previous.year !== date.year || previous.month !== date.month; return <div key={watch.id}>{showYear && <h3 className="diary-year">{date.year}</h3>}{showMonth && <h4 className="diary-month">{date.month}</h4>}<article className="diary-entry"><time>{date.day}</time><Link className="diary-poster" href={mediaHref(watch.media)}><Image src={watch.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="64px"/></Link><div className="diary-copy"><Link href={mediaHref(watch.media)}><strong>{watch.media.title}</strong></Link><span>{watch.media.releaseYear ?? ""}{watch.isRewatch ? " · Rewatch" : ""}{watch.rating ? ` · ★ ${watch.rating}` : ""}</span>{watch.review && <p>“{watch.review}”</p>}</div><div className="diary-actions"><Link className="icon-button" href={mediaHref(watch.media)} aria-label={`Edit ${watch.media.title}`}><Pencil size={15}/></Link><button className="icon-button danger" onClick={() => void mutate({ type: "movie.delete", watchId: watch.id })} aria-label={`Delete watch log for ${watch.media.title}`}><Trash2 size={15}/></button></div></article></div>; })}</div> : <div className="empty-state"><h2>Your movie diary starts here</h2><p>Log a watch to build your personal history.</p></div>}</section>}
    <section className="section"><div className="section-head"><h2>From friends</h2></div>{showFixtureActivity ? <div className="feed-grid"><div className="panel">{activities.map((activity) => <div className="activity-row" key={activity.id}><Image className="avatar" src={activity.user.avatarUrl} width={42} height={42} alt=""/><div className="activity-copy"><strong>{activity.user.displayName}</strong> shared an update about<br/><strong>{activity.media?.title}</strong> {activity.rating && <span className="rating">★ {activity.rating}</span>}</div><span className="activity-time">{activity.createdAt}</span></div>)}</div><div className="panel" style={{ padding: 20 }}>{reviews.map((review) => <blockquote key={review.id} style={{ margin: "0 0 24px", color: "var(--foreground-secondary)", lineHeight: 1.6 }}>“{review.body}”<footer className="muted" style={{ marginTop: 8, fontSize: 12 }}>{review.user.displayName} · <span className="rating">★ {review.rating}</span></footer></blockquote>)}</div></div> : <div className="empty-state"><h2>Nothing from your circle yet</h2><p>Follow people to see their ratings, reviews, and progress here.</p></div>}</section>
  </div></div>;
}
