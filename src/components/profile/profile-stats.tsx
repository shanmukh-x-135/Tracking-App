"use client";

import Link from "next/link";
import { type CSSProperties, type KeyboardEvent, useMemo, useState } from "react";
import { mediaHref } from "@/components/media/media-card";
import { Reveal } from "@/components/motion/motion";
import { Artwork } from "@/components/profile/profile-overview";
import { type ActivitySeries, type DatedMedium, deriveProfileStats, type ProfileStats, type StatsMedium, type StatsPeriod, statsYears } from "@/lib/analytics/stats";
import type { CatalogMedia } from "@/lib/media/types";
import type { MosaicState } from "@/lib/persistence/types";

const mediumLabels: Record<StatsMedium, string> = { movie: "Movies", series: "Series", game: "Games", book: "Books" };
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en")} ${count === 1 ? singular : pluralForm}`;
}

function stars(value: number): string {
  return `★ ${value.toFixed(1)}`;
}

function PosterFan({ media, label }: { media: CatalogMedia[]; label: string }) {
  if (!media.length) return <span className="stats-fan is-empty" aria-hidden="true"/>;
  return <span className="stats-fan" aria-label={label} role="img">{media.slice(0, 4).map((item, index) => <span key={`${item.provider}:${item.providerId}`} style={{ "--i": index } as CSSProperties}><Artwork media={item} sizes="72px"/></span>)}</span>;
}

function PosterRow({ items, caption }: { items: { media: CatalogMedia; note: string }[]; caption: string }) {
  return <ol className="stats-posters" aria-label={caption}>{items.map(({ media, note }) => <li key={`${media.provider}:${media.providerId}`}>
    <Link href={mediaHref(media)} className="stats-poster">
      <span className="stats-poster-art"><Artwork media={media} sizes="(max-width: 720px) 30vw, 150px"/></span>
      <strong>{media.title}</strong>
      <small>{note}</small>
    </Link>
  </li>)}</ol>;
}

function Switch<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange(value: T): void }) {
  return <div className="stats-switch" role="radiogroup" aria-label={label}>{options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

/** Bars with hover and arrow-key inspection; values are also available as a table for screen readers. */
function ActivityChart({ series, periodLabel, singular }: { series: ActivitySeries; periodLabel: string; singular: string }) {
  const [active, setActive] = useState<number>();
  const largest = Math.max(1, ...series.buckets.map(({ count }) => count));
  const shown = active !== undefined ? series.buckets[active] : undefined;
  if (!series.total) return <p className="stats-quiet">No {series.unit} recorded {periodLabel}.</p>;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const last = series.buckets.length - 1;
    setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? last : Math.min(last, Math.max(0, (current ?? (event.key === "ArrowRight" ? -1 : last + 1)) + (event.key === "ArrowRight" ? 1 : -1))));
  };
  return <figure className="stats-chart">
    <div className={`stats-bars ${series.buckets.length > 7 ? "is-dense" : ""}`} tabIndex={0} role="group" aria-label={`${series.unit} by ${series.granularity}, ${periodLabel}. Use the arrow keys to read each ${series.granularity}.`} onKeyDown={onKeyDown} onMouseLeave={() => setActive(undefined)} onBlur={() => setActive(undefined)} style={{ "--columns": series.buckets.length } as CSSProperties}>
      {series.buckets.map((bucket, index) => <span key={bucket.key} className={`stats-bar ${bucket === series.peak ? "is-peak" : ""} ${index === active ? "is-active" : ""}`} onMouseEnter={() => setActive(index)} aria-hidden="true">
        <i style={{ "--h": bucket.count / largest } as CSSProperties}/>
        <small>{series.buckets.length > 14 && index % Math.ceil(series.buckets.length / 12) !== 0 ? "" : bucket.label}</small>
      </span>)}
    </div>
    <figcaption className="stats-chart-readout" aria-live="polite">{shown ? <><b>{shown.label}</b> {plural(shown.count, singular, series.unit)}</> : <span>{series.peak ? <>Busiest {series.granularity}: <b>{series.peak.label}</b> · {plural(series.peak.count, singular, series.unit)}</> : null}</span>}</figcaption>
    <table className="sr-only"><caption>{series.unit} by {series.granularity}</caption><tbody>{series.buckets.map((bucket) => <tr key={bucket.key}><th scope="row">{bucket.label}</th><td>{bucket.count}</td></tr>)}</tbody></table>
  </figure>;
}

function Intro({ stats, years, onPeriod }: { stats: ProfileStats; years: number[]; onPeriod(period: StatsPeriod): void }) {
  const period = stats.period;
  const parts = [
    stats.movie.watchLogs ? plural(stats.movie.watchLogs, "film watch", "film watches") : "",
    stats.series.episodeLogs ? plural(stats.series.episodeLogs, "episode") + " logged" : "",
  ].filter(Boolean);
  const sentence = parts.length
    ? `${parts.join(" and ")}${period.kind === "year" ? ` in ${period.year}` : " so far"}. Games and books are shown as they stand today.`
    : period.kind === "year" ? `Nothing dated was logged in ${period.year}.` : "Your stats appear here as you log what you watch, play and read.";
  return <header className="stats-intro">
    <div>
      <span className="eyebrow">{period.kind === "year" ? `Your ${period.year}` : "All time"}</span>
      <h2>{period.kind === "year" ? `${period.year}, in stories` : "Your story, in numbers"}</h2>
      <p>{sentence}</p>
    </div>
    {years.length ? <Switch label="Period" value={period.kind === "all" ? "all" : String(period.year)} onChange={(value) => onPeriod(value === "all" ? { kind: "all" } : { kind: "year", year: Number(value) })} options={[{ value: "all", label: "All time" }, ...years.map((year) => ({ value: String(year), label: String(year) }))]}/> : null}
  </header>;
}

function Footprint({ stats }: { stats: ProfileStats }) {
  const year = stats.period.kind === "year";
  const columns: { medium: StatsMedium; value: number; unit: string; facts: string[]; art: CatalogMedia[]; current?: boolean }[] = [
    { medium: "movie", value: stats.movie.watchLogs, unit: stats.movie.watchLogs === 1 ? "film watch" : "film watches", facts: [plural(stats.movie.uniqueTitles, "unique film"), plural(stats.movie.rewatchLogs, "rewatch", "rewatches")], art: stats.movie.recent },
    { medium: "series", value: stats.series.episodeLogs, unit: stats.series.episodeLogs === 1 ? "episode logged" : "episodes logged", facts: [plural(stats.series.uniqueEpisodes, "unique episode"), plural(stats.series.shows, "show")], art: stats.series.recent },
    { medium: "game", value: stats.game.completedPlaythroughs, unit: stats.game.completedPlaythroughs === 1 ? "playthrough completed" : "playthroughs completed", facts: [`${stats.game.statuses.playing} playing now`, ...(stats.game.recordedPlaytimeMinutes ? [`${Math.round(stats.game.recordedPlaytimeMinutes / 60).toLocaleString("en")}h recorded playtime`] : [])], art: stats.game.completed, current: true },
    { medium: "book", value: stats.book.finished, unit: stats.book.finished === 1 ? "book finished" : "books finished", facts: [`${stats.book.statuses.reading} reading now`, ...(stats.book.statuses.dnf ? [`${stats.book.statuses.dnf} did not finish`] : [])], art: stats.book.finishedTitles, current: true },
  ];
  return <section className="stats-footprint" aria-labelledby="stats-footprint-title">
    <h2 id="stats-footprint-title" className="sr-only">Your media footprint</h2>
    {columns.map((column) => <div key={column.medium} className={`stats-medium ${column.value ? "" : "is-empty"}`} data-media={column.medium}>
      <PosterFan media={column.art} label={`Recent ${mediumLabels[column.medium].toLowerCase()} artwork`}/>
      <span className="stats-medium-label">{mediumLabels[column.medium]}{column.current && year ? <em>Current status</em> : null}</span>
      <strong>{column.value.toLocaleString("en")}</strong>
      <span className="stats-medium-unit">{column.unit}</span>
      <ul>{column.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
    </div>)}
  </section>;
}

function Activity({ stats }: { stats: ProfileStats }) {
  const options = (["series", "movie"] as const).filter((medium) => stats.activity[medium].total);
  const [chosen, setChosen] = useState<DatedMedium>();
  const medium = chosen && options.includes(chosen) ? chosen : options[0] ?? "movie";
  const series = stats.activity[medium];
  const periodLabel = stats.period.kind === "year" ? `in ${stats.period.year}` : "so far";
  const weekdayTotal = series.weekdays.reduce((sum, count) => sum + count, 0);
  const busiestDay = series.weekdays.indexOf(Math.max(...series.weekdays));
  return <section className="stats-activity" data-media={medium} aria-labelledby="stats-activity-title">
    <div className="stats-section-head">
      <div><span className="eyebrow">Activity over time</span><h2 id="stats-activity-title">When you watched</h2></div>
      {options.length > 1 ? <Switch<DatedMedium> label="Activity measure" value={medium} onChange={setChosen} options={options.map((value) => ({ value, label: value === "series" ? "Episodes" : "Films" }))}/> : null}
    </div>
    <ActivityChart key={`${medium}-${stats.period.kind === "year" ? stats.period.year : "all"}`} series={series} periodLabel={periodLabel} singular={medium === "series" ? "episode logged" : "film watch"}/>
    <div className="stats-callouts">
      {weekdayTotal >= 5 ? <p><span>Most active day</span><b>{weekdayNames[busiestDay]}</b><small>{Math.round(series.weekdays[busiestDay] / weekdayTotal * 100)}% of {series.unit}</small></p> : null}
      <p className="stats-note">Games and books keep their latest progress rather than dated sessions, so they are not charted over time.</p>
    </div>
  </section>;
}

function Taste({ stats }: { stats: ProfileStats }) {
  const { ratings } = stats;
  const largest = Math.max(1, ...ratings.distribution.map(({ count }) => count));
  const population = ratings.population === "all" ? "every title you have rated" : `rated films and series you logged in ${stats.period.kind === "year" ? stats.period.year : ""}`;
  const media = (Object.keys(ratings.byMedium) as StatsMedium[]).filter((medium) => ratings.byMedium[medium].count > 0);
  return <section className="stats-taste" aria-labelledby="stats-taste-title">
    <div className="stats-ratings">
      <span className="eyebrow">Ratings</span>
      <h2 id="stats-taste-title">How you rate</h2>
      {ratings.count ? <>
        <p className="stats-average"><strong>{stars(ratings.average!)}</strong><span>average across {plural(ratings.count, "rating")} · {population}</span></p>
        <div className="stats-histogram" role="img" aria-label={`Rating distribution: ${ratings.distribution.filter(({ count }) => count).map(({ value, count }) => `${value} stars, ${count}`).join("; ")}`}>
          {ratings.distribution.map(({ value, count }) => <span key={value} className={count ? "" : "is-zero"} title={`${value.toFixed(1)} ★ · ${plural(count, "rating")}`}><i style={{ "--h": count / largest } as CSSProperties}/><small>{Number.isInteger(value) ? `${value}★` : ""}</small></span>)}
        </div>
        {media.length > 1 ? <ul className="stats-medium-averages">{media.map((medium) => <li key={medium} data-media={medium}><span>{mediumLabels[medium]}</span><b>{stars(ratings.byMedium[medium].average!)}</b><small>{plural(ratings.byMedium[medium].count, "rating")}</small></li>)}</ul> : null}
        {ratings.count < 3 ? <p className="stats-quiet">A few more ratings will make this pattern meaningful.</p> : null}
      </> : <p className="stats-quiet">{stats.period.kind === "year" ? `None of the films or series you logged in ${stats.period.year} are rated yet.` : "Rate a story from its page and your rating pattern will appear here."}</p>}
    </div>
    {ratings.top.length ? <div className="stats-top">
      <span className="eyebrow">Highest rated</span>
      <PosterRow caption="Highest rated titles" items={ratings.top.slice(0, 6).map(({ media, value }) => ({ media, note: stars(value) }))}/>
    </div> : null}
  </section>;
}

function Genres({ stats }: { stats: ProfileStats }) {
  const options = (["movie", "series", "game", "book"] as const).filter((medium) => stats.genres[medium].titles > 0);
  const [chosen, setChosen] = useState<StatsMedium>();
  if (!options.length) return null;
  const medium: StatsMedium = chosen && (options as readonly StatsMedium[]).includes(chosen) ? chosen : options[0];
  const summary = stats.genres[medium];
  const largest = Math.max(1, ...summary.top.map(({ count }) => count));
  return <section className="stats-genres" aria-labelledby="stats-genres-title">
    <div className="stats-section-head">
      <div><span className="eyebrow">Taste</span><h2 id="stats-genres-title">What you gravitate to</h2></div>
      {options.length > 1 ? <Switch<StatsMedium> label="Genres for" value={medium} onChange={setChosen} options={options.map((value) => ({ value, label: mediumLabels[value] }))}/> : null}
    </div>
    {summary.top.length ? <ol className="stats-genre-list" data-media={medium}>{summary.top.map(({ name, count }) => <li key={name}><span>{name}</span><i style={{ "--w": count / largest } as CSSProperties}/><b>{plural(count, "title")}</b></li>)}</ol> : <p className="stats-quiet">None of these {mediumLabels[medium].toLowerCase()} include genre information yet.</p>}
    <p className="stats-note">Counted once per title{medium === "movie" || medium === "series" ? (stats.period.kind === "year" ? ` logged in ${stats.period.year}` : " you have logged") : " you track"}; {summary.withGenres} of {plural(summary.titles, "title")} include genre data from the catalog.</p>
  </section>;
}

function MediumDetails({ stats }: { stats: ProfileStats }) {
  const status = stats.series.status;
  const statusEntries = (Object.entries(status) as [keyof typeof status, number][]).filter(([, count]) => count > 0);
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + count, 0);
  const games = (Object.entries(stats.game.statuses) as [string, number][]).filter(([, count]) => count > 0);
  const books = (Object.entries(stats.book.statuses) as [string, number][]).filter(([, count]) => count > 0);
  const bookLabels: Record<string, string> = { reading: "Reading", paused: "Paused", finished: "Finished", dnf: "Did not finish", want_to_read: "Want to read" };
  const period = stats.period.kind === "year" ? `in ${stats.period.year}` : "so far";
  return <section className="stats-media" aria-labelledby="stats-media-title">
    <div className="stats-section-head"><div><span className="eyebrow">Medium by medium</span><h2 id="stats-media-title">The details</h2></div></div>
    <div className="stats-media-grid">
      <article className="stats-panel is-series" data-media="series">
        <h3>Series</h3>
        {statusTotal ? <>
          <p className="stats-panel-kicker">Right now · {plural(statusTotal, "show")}</p>
          <div className="stats-segments" role="img" aria-label={statusEntries.map(([name, count]) => `${name} ${count}`).join(", ")}>{statusEntries.map(([name, count]) => <span key={name} data-status={name} style={{ "--share": count / statusTotal } as CSSProperties}/>)}</div>
          <ul className="stats-legend">{statusEntries.map(([name, count]) => <li key={name} data-status={name}><span>{name}</span><b>{count}</b></li>)}</ul>
        </> : <p className="stats-quiet">No series tracked yet.</p>}
        {stats.series.mostLogged.length ? <><p className="stats-panel-kicker">Most logged {period}</p><PosterRow caption="Most logged series" items={stats.series.mostLogged.slice(0, 6).map(({ media, count }) => ({ media, note: plural(count, "episode log") }))}/></> : null}
      </article>
      <article className="stats-panel" data-media="game">
        <h3>Games</h3>
        <p className="stats-panel-kicker">Playthroughs by status · current</p>
        {games.length ? <ul className="stats-legend is-bars">{games.map(([name, count]) => <li key={name}><span>{name}</span><i style={{ "--w": count / Math.max(...games.map(([, value]) => value)) } as CSSProperties}/><b>{count}</b></li>)}</ul> : <p className="stats-quiet">No games tracked yet.</p>}
        {stats.game.recordedPlaytimeMinutes ? <p className="stats-panel-fact"><b>{Math.round(stats.game.recordedPlaytimeMinutes / 60).toLocaleString("en")}h</b> playtime you have recorded, all time</p> : null}
      </article>
      <article className="stats-panel" data-media="book">
        <h3>Books</h3>
        <p className="stats-panel-kicker">Reading records by status · current</p>
        {books.length ? <ul className="stats-legend is-bars">{books.map(([name, count]) => <li key={name}><span>{bookLabels[name]}</span><i style={{ "--w": count / Math.max(...books.map(([, value]) => value)) } as CSSProperties}/><b>{count}</b></li>)}</ul> : <p className="stats-quiet">No books tracked yet.</p>}
        {stats.book.authors.length ? <><p className="stats-panel-kicker">Most read authors</p><ol className="stats-authors">{stats.book.authors.map(({ name, count }) => <li key={name}><span>{name}</span><b>{plural(count, "book")}</b></li>)}</ol></> : null}
      </article>
      {stats.movie.mostRewatched ? <article className="stats-panel is-revisit" data-media="movie">
        <h3>Most revisited film</h3>
        <Link href={mediaHref(stats.movie.mostRewatched.media)} className="stats-revisit">
          <span className="stats-poster-art"><Artwork media={stats.movie.mostRewatched.media} sizes="120px"/></span>
          <span><strong>{stats.movie.mostRewatched.media.title}</strong><small>{plural(stats.movie.mostRewatched.count, "rewatch", "rewatches")} logged {period}</small></span>
        </Link>
      </article> : null}
    </div>
  </section>;
}

export function ProfileStatsView({ state }: { state: MosaicState }) {
  const years = useMemo(() => statsYears(state), [state]);
  const [year, setYear] = useState<number>();
  // A year disappears if its last dated log is removed; fall back to all time rather than an empty view.
  const activeYear = year !== undefined && years.includes(year) ? year : undefined;
  const stats = useMemo(() => deriveProfileStats(state, activeYear === undefined ? { kind: "all" } : { kind: "year", year: activeYear }), [state, activeYear]);
  return <div className="profile-stats-view">
    <Intro stats={stats} years={years} onPeriod={(period) => setYear(period.kind === "year" ? period.year : undefined)}/>
    <Reveal><Footprint stats={stats}/></Reveal>
    <Reveal delay={.04}><Activity stats={stats}/></Reveal>
    <Reveal delay={.06}><Taste stats={stats}/></Reveal>
    <Reveal delay={.08}><Genres stats={stats}/></Reveal>
    <Reveal delay={.1}><MediumDetails stats={stats}/></Reveal>
  </div>;
}
