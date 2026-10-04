import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonDetailPage } from "@/components/detail/series-hierarchy-pages";
import { resolveSeriesSeason } from "@/lib/media/detail";

type Props = { params: Promise<{ id: string; season: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, season } = await params;
  const resolved = await resolveSeriesSeason(id, Number(season));
  if (!resolved) return {};
  const title = resolved.series.seasons?.find((item) => item.seasonNumber === resolved.seasonNumber)?.name || (resolved.seasonNumber === 0 ? "Specials" : `Season ${resolved.seasonNumber}`);
  return { title: `${resolved.series.title} — ${title}`, description: `${title} episode guide for ${resolved.series.title}.`, alternates: { canonical: `/series/${encodeURIComponent(id)}/season/${resolved.seasonNumber}` } };
}

export default async function Page({ params }: Props) {
  const { id, season } = await params;
  const resolved = await resolveSeriesSeason(id, Number(season));
  if (!resolved) notFound();
  return <SeasonDetailPage {...resolved}/>;
}
