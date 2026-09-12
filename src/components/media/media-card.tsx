import Image from "next/image";
import Link from "next/link";
import { BookmarkPlus, Plus, Star } from "lucide-react";
import type { Media } from "@/types/media";

export const mediaHref = (media: Media) => `/${media.mediaType === "tv" ? "series" : media.mediaType}/${media.id}`;

export function MediaCard({ media, showType = false, priority = false }: { media: Media; showType?: boolean; priority?: boolean }) {
  return <article className="media-card"><Link href={mediaHref(media)} aria-label={`View ${media.title}`}><div className="poster-wrap"><Image src={media.posterUrl} alt="" fill sizes="(max-width: 560px) 42vw, (max-width: 1100px) 20vw, 15vw" priority={priority}/><div className="poster-overlay"><div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>{showType && <span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span>}<div className="card-actions" style={{marginLeft:"auto"}}><button aria-label={`Add ${media.title} to list`}><Plus size={15}/></button><button aria-label={`Log ${media.title}`}><BookmarkPlus size={14}/></button></div></div><span className="rating"><Star size={12} fill="currentColor"/> {media.averageRating.toFixed(1)}</span></div></div><div className="card-info"><div className="card-title">{media.title}</div><div className="card-meta"><span>{media.releaseYear}</span><span className="rating">★ {media.averageRating.toFixed(1)}</span></div></div></Link></article>;
}

export function MediaShelf({ items, showType = false }: { items: Media[]; showType?: boolean }) { return <div className="shelf">{items.map((media)=><MediaCard key={media.id} media={media} showType={showType}/>)}</div>; }
