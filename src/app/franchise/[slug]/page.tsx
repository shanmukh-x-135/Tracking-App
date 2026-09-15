import { notFound } from "next/navigation";
import { MediaShelf } from "@/components/media/media-card";
import { getCatalogItem } from "@/lib/media/catalog";
import { franchiseBySlug } from "@/lib/media/franchises";
import type { CatalogMedia } from "@/lib/media/types";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const franchise = franchiseBySlug((await params).slug);
  if (!franchise) notFound();
  const items = (await Promise.all(franchise.items.map((identity) => getCatalogItem(identity).catch(() => null)))).filter((item): item is CatalogMedia => item !== null);
  const groups = ["movie", "tv", "game", "book"] as const;
  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Cross-media universe</span><h1>{franchise.title}</h1><p>{franchise.overview}</p></header>{groups.map((type) => {
    const group = items.filter((item) => item.mediaType === type);
    if (!group.length) return null;
    const label = type === "tv" ? "Series" : `${type[0].toUpperCase()}${type.slice(1)}s`;
    return <section className="section" key={type}><div className="section-head"><h2>{label}</h2></div><MediaShelf items={group} showType/></section>;
  })}{!items.length && <div className="empty-state"><h2>This universe is temporarily unavailable</h2><p>The mapped provider titles could not be loaded right now.</p></div>}</div></div>;
}
