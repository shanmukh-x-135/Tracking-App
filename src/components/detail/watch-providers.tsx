"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import type { CatalogMedia, WatchAvailability, WatchProviderKind } from "@/lib/media/types";

const regions = [{ code: "IN", label: "India" }, { code: "US", label: "United States" }, { code: "GB", label: "United Kingdom" }, { code: "CA", label: "Canada" }, { code: "AU", label: "Australia" }];
const labels: Record<WatchProviderKind, string> = { flatrate: "Stream", free: "Free", ads: "Free with ads", rent: "Rent", buy: "Buy" };
const regionStorageKey = "mosaic.watch-region";

export function WatchProviders({ media }: { media: Extract<CatalogMedia, { mediaType: "movie" | "tv" }> }) {
  const { state, mutate } = useMosaicState();
  const [availability, setAvailability] = useState<WatchAvailability | null>();
  const [failed, setFailed] = useState(false);
  // The first client render must match SSR. Read the browser-only fallback
  // after hydration; the authenticated account region remains authoritative.
  const [localRegion, setLocalRegion] = useState("");
  useEffect(() => {
    queueMicrotask(() => setLocalRegion(window.localStorage.getItem(regionStorageKey) ?? ""));
  }, []);
  const region = state.watchRegion ?? localRegion;
  useEffect(() => {
    if (!region) return;
    const controller = new AbortController();
    void fetch(`/api/catalog/${media.provider}/${media.mediaType}/${encodeURIComponent(media.providerId)}/watch-providers?country=${region}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<WatchAvailability | null> : Promise.reject(new Error("Unavailable")))
      .then((data) => { if (!controller.signal.aborted) { setFailed(false); setAvailability(data); } })
      .catch(() => { if (!controller.signal.aborted) { setFailed(true); setAvailability(null); } });
    return () => controller.abort();
  }, [media.mediaType, media.provider, media.providerId, region]);
  const chooseRegion = (next: string) => {
    setLocalRegion(next);
    if (next) window.localStorage.setItem(regionStorageKey, next);
    else window.localStorage.removeItem(regionStorageKey);
    void mutate({ type: "settings.watchRegion", value: next || null }).catch(() => undefined);
  };
  const grouped = availability?.providers.reduce<Partial<Record<WatchProviderKind, WatchAvailability["providers"]>>>((all, provider) => ({ ...all, [provider.kind]: [...(all[provider.kind] ?? []), provider] }), {}) ?? {};
  const availabilityTitle = media.mediaType === "tv" ? "Where to watch this series" : "Where to watch";
  const availabilityHint = media.mediaType === "tv" ? "Availability is reported for the series; individual season availability can vary by provider." : "Choose your region to see local streaming, rental, and purchase availability.";
  return <section className="section watch-providers"><div className="section-head"><div><span className="eyebrow">Availability</span><h2>{availabilityTitle}</h2></div><label className="region-select">Watch region<select value={region} onChange={(event) => chooseRegion(event.target.value)}><option value="">Choose a region</option>{regions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label></div>
    {!region ? <p className="muted">{availabilityHint}</p> : failed ? <p className="muted">Watch-provider data is temporarily unavailable.</p> : availability === undefined ? <p className="muted">Checking availability…</p> : !availability?.providers.length ? <p className="muted">No watch-provider data is available for your selected region.</p> : <><div className="provider-groups">{(["flatrate", "free", "ads", "rent", "buy"] as const).map((kind) => grouped[kind]?.length ? <div className="provider-group" key={kind}><h3>{labels[kind]}</h3><div>{grouped[kind].map((provider) => <span className="provider" key={`${kind}-${provider.id}`}>{provider.logoUrl && <Image src={provider.logoUrl} alt="" width={28} height={28}/>}<span>{provider.name}</span></span>)}</div></div> : null)}</div>
      <div className="watch-attribution"><span>Availability data by JustWatch</span>{availability.link && <a href={availability.link} target="_blank" rel="noreferrer">View watch options <ExternalLink size={13}/></a>}</div></>}
  </section>;
}
