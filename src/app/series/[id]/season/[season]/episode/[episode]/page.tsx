import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EpisodeDetailPage } from "@/components/detail/series-hierarchy-pages";
import { resolveSeriesEpisode } from "@/lib/media/detail";

type Props = { params: Promise<{ id: string; season: string; episode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, season, episode } = await params;
  const resolved = await resolveSeriesEpisode(id, Number(season), Number(episode));
  if (!resolved) return {};
  return { title: `${resolved.series.title} — S${String(resolved.seasonNumber).padStart(2, "0")}E${String(resolved.episode.episodeNumber).padStart(2, "0")} ${resolved.episode.title}`, description: resolved.episode.overview || `${resolved.episode.title}, an episode of ${resolved.series.title}.`, alternates: { canonical: `/series/${encodeURIComponent(id)}/season/${resolved.seasonNumber}/episode/${resolved.episode.episodeNumber}` } };
}

export default async function Page({ params }: Props) {
  const { id, season, episode } = await params;
  const resolved = await resolveSeriesEpisode(id, Number(season), Number(episode));
  if (!resolved) notFound();
  return <EpisodeDetailPage {...resolved}/>;
}
