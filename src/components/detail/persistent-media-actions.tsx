"use client";

import { Check, Heart, ListPlus, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import type { CatalogMedia } from "@/lib/media/types";
import { defaultLibraryStatus, mediaKey } from "@/lib/persistence/domain";
import { RatingInput } from "@/components/ui/rating-input";

declare global {
  interface Window { __mosaicQuickLogContext?: CatalogMedia }
}

export function PersistentMediaActions({ media }: { media: CatalogMedia }) {
  const { user } = useAuth();
  const { state, mutate, error: stateError } = useMosaicState();
  const router = useRouter();
  const [showReview, setShowReview] = useState(false);
  const [showLists, setShowLists] = useState(false);
  const [message, setMessage] = useState<string>();
  const key = mediaKey(media);
  const entry = state.library.find((item) => mediaKey(item.media) === key);
  const rating = state.ratings.find((item) => item.mediaKey === key)?.value;
  const review = state.reviews.find((item) => mediaKey(item.media) === key);
  const isMovie = media.mediaType === "movie";
  const isWatchlisted = entry?.status === "watchlist";

  // Keep the global Quick Log aware of the current detail route. This is cleared
  // on unmount, so opening Log after navigation cannot reuse a previous title.
  useEffect(() => {
    window.__mosaicQuickLogContext = media;
    window.dispatchEvent(new CustomEvent<CatalogMedia | undefined>("mosaic:log-context", { detail: media }));
    return () => {
      if (window.__mosaicQuickLogContext === media) window.__mosaicQuickLogContext = undefined;
      window.dispatchEvent(new CustomEvent<CatalogMedia | undefined>("mosaic:log-context", { detail: undefined }));
    };
  }, [media]);

  async function authenticatedMutation(action: () => Promise<void>, success: string) {
    if (!user) { router.push("/login"); return; }
    setMessage(undefined);
    await action();
    setMessage(success);
  }

  function openQuickLog() {
    window.dispatchEvent(new CustomEvent<CatalogMedia>("mosaic:quick-log", { detail: media }));
  }

  return <div className="persistent-actions">
    <div className="actions">
      <button className="button accent" onClick={openQuickLog}><Plus size={16}/>Log</button>
      {isMovie ? <button className={`button ${isWatchlisted ? "accent" : ""}`} onClick={() => void authenticatedMutation(() => mutate(isWatchlisted ? { type: "library.remove", media } : { type: "library.upsert", media, status: "watchlist" }), isWatchlisted ? "Removed from your watchlist." : "Added to your watchlist.")}>{isWatchlisted ? <Check size={16}/> : <Plus size={16}/>} {isWatchlisted ? "Watchlisted" : "Watchlist"}</button> : <button className={`button ${entry ? "accent" : ""}`} onClick={() => void authenticatedMutation(() => mutate({ type: "library.upsert", media, status: entry?.status ?? defaultLibraryStatus(media) }), "Library updated.")}>{entry ? <Check size={16}/> : <Plus size={16}/>} {entry ? "In library" : "Add to library"}</button>}
      <button className="button" onClick={() => setShowReview((value) => !value)}><Star size={16}/>{review ? "Edit review" : "Review"}</button>
      <button className="button" onClick={() => setShowLists((value) => !value)}><ListPlus size={16}/>Add to list</button>
      <button className={`icon-button glass ${entry?.isFavorite ? "active" : ""}`} aria-label="Favourite" onClick={() => void authenticatedMutation(() => mutate({ type: "library.upsert", media, status: entry?.status ?? defaultLibraryStatus(media), isFavorite: !entry?.isFavorite }), "Favourite updated.")}><Heart size={17} fill={entry?.isFavorite ? "currentColor" : "none"}/></button>
    </div>
    <RatingInput value={rating} onChange={(value) => void authenticatedMutation(() => mutate({ type: "rating.set", media, value }), "Rating saved.")}/>
    {showReview && <form className="inline-form" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void authenticatedMutation(() => mutate({ type: "review.save", id: review?.id, media, body: String(form.get("body") ?? ""), containsSpoilers: form.get("spoilers") === "on", rating }), "Review saved.").then(() => setShowReview(false));
    }}><label className="field full">Your review<textarea name="body" required defaultValue={review?.body} placeholder="What stayed with you?"/></label><label className="check-field"><input type="checkbox" name="spoilers" defaultChecked={review?.containsSpoilers}/> Contains spoilers</label><button className="button accent" type="submit">Save review</button>{review && <button className="button" type="button" onClick={() => void authenticatedMutation(() => mutate({ type: "review.delete", id: review.id }), "Review deleted.")}>Delete review</button>}</form>}
    {showLists && <div className="inline-form"><strong>Add to one of your lists</strong>{state.lists.length ? state.lists.map((list) => <button className="button" key={list.id} onClick={() => void authenticatedMutation(() => mutate({ type: "list.add", listId: list.id, media }), `Added to ${list.title}.`).then(() => setShowLists(false))}>{list.title}</button>) : <p className="muted">Create a list from the Lists page first.</p>}</div>}
    {(message || stateError) && <p className={stateError ? "form-error" : "form-success"} role="status">{stateError ?? message}</p>}
  </div>;
}
