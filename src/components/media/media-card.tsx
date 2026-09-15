"use client";

import Image from "next/image";
import Link from "next/link";
import { BookmarkCheck, BookmarkPlus, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { createProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import type { CatalogMedia } from "@/lib/media/types";
import { defaultLibraryStatus, mediaKey } from "@/lib/persistence/domain";
import type { Media } from "@/types/media";

type CardMedia = Media | CatalogMedia;

function isCatalogMedia(media: CardMedia): media is CatalogMedia { return "providerId" in media; }
function asCatalogMedia(media: CardMedia): CatalogMedia { return isCatalogMedia(media) ? media : normalizeMock(media); }
function ratingFor(media: CardMedia): number | undefined { return isCatalogMedia(media) ? media.communityRating : media.averageRating; }

export function mediaHref(media: CardMedia): string {
  const type = media.mediaType === "tv" ? "series" : media.mediaType;
  if (!isCatalogMedia(media)) return `/${type}/${media.id}`;
  return `/${type}/${encodeURIComponent(createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId }))}`;
}

export function MediaCard({ media, showType = false, priority = false }: { media: CardMedia; showType?: boolean; priority?: boolean }) {
  const catalogMedia = asCatalogMedia(media);
  const rating = ratingFor(media);
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const router = useRouter();
  const isSaved = state.library.some((entry) => mediaKey(entry.media) === mediaKey(catalogMedia));

  async function save(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) { router.push("/login"); return; }
    await mutate({ type: "library.upsert", media: catalogMedia, status: defaultLibraryStatus(catalogMedia) });
  }

  const isBook = media.mediaType === "book";
  const author = media.mediaType === "book" ? media.authors.join(", ") : undefined;
  return <article className={`media-card ${isBook ? "book-card" : ""}`}><Link href={mediaHref(media)} aria-label={`View ${media.title}`}><div className="poster-wrap"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="(max-width: 560px) 42vw, (max-width: 1100px) 20vw, 15vw" priority={priority}/><div className="poster-overlay"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>{showType && <span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span>}<div className="card-actions" style={{ marginLeft: "auto" }}><button aria-label={isSaved ? `${media.title} is in your library` : `Add ${media.title} to library`} onClick={(event) => void save(event)}>{isSaved ? <BookmarkCheck size={15}/> : <Plus size={15}/>}</button><button aria-label={`Log ${media.title}`}><BookmarkPlus size={14}/></button></div></div>{rating !== undefined && <span className="rating"><Star size={12} fill="currentColor"/> {rating.toFixed(1)}</span>}</div></div><div className="card-info"><div className="card-title">{media.title}</div>{author && <div className="book-author">{author}</div>}<div className="card-meta"><span>{media.releaseYear ?? "Year unknown"}</span>{rating !== undefined && <span className="rating">★ {rating.toFixed(1)}</span>}</div></div></Link></article>;
}

export function MediaShelf({ items, showType = false }: { items: CardMedia[]; showType?: boolean }) {
  return <div className="shelf">{items.map((media) => <MediaCard key={isCatalogMedia(media) ? mediaKey(media) : media.id} media={media} showType={showType}/>)}</div>;
}
