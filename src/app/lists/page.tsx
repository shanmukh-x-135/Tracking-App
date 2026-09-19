"use client";

import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { lists, mediaById } from "@/data/media";
import { isLiveMode } from "@/lib/config/env";
import { AnimatePresence, motion, motionTokens } from "@/components/motion/motion";

export default function Page() {
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const showDevelopmentSamples = !isLiveMode();

  return <div className="page"><div className="page-narrow">
    <header className="page-hero"><span className="eyebrow">Your collections</span><h1>Lists</h1><p>Mix films, series, games, and books into collections that say something about you.</p></header>
    <div className="toolbar"><span className="muted">Cross-media by design</span><button className="button primary" onClick={() => user ? setIsCreating(true) : router.push("/login")}><Plus size={16}/>Create list</button></div>
    <AnimatePresence>{isCreating && <motion.form className="inline-form list-create" initial={{ opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -8 }} transition={motionTokens.normal} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void mutate({ type: "list.create", title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), visibility: String(form.get("visibility")) as "public" | "unlisted" | "private" }).then(() => setIsCreating(false));
    }}><button type="button" className="icon-button" aria-label="Cancel creating list" onClick={() => setIsCreating(false)}><X size={16}/></button><label className="field">Title<input name="title" required maxLength={120} placeholder="A collection with a point of view"/></label><label className="field full">Description<textarea name="description" maxLength={1000} placeholder="What connects these stories?"/></label><label className="field">Visibility<select name="visibility"><option value="private">Private</option><option value="public">Public</option><option value="unlisted">Unlisted</option></select></label><button className="button accent" type="submit">Create list</button></motion.form>}</AnimatePresence>
    {state.lists.length > 0 ? <section className="section"><div className="section-head"><h2>Your lists</h2></div><motion.div layout className="list-grid">{state.lists.map((list) => <motion.div layout key={list.id} transition={motionTokens.normal}><Link className="list-card" href={`/lists/${encodeURIComponent(list.id)}`}><div className="list-covers">{list.items.slice(0, 4).map((item) => <div key={item.id}><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt={item.media.title} fill sizes="160px"/></div>)}</div><div className="list-copy"><h3>{list.title}</h3><p>{list.description || "A new cross-media collection."}</p><span className="muted" style={{ fontSize: 11 }}>{list.items.length} stories</span>{list.visibility === "private" && <LockKeyhole size={12}/>}</div></Link></motion.div>)}</motion.div></section> : <div className="empty-state"><h2>No lists yet</h2><p>Create a cross-media collection for the stories you want to keep together.</p><button className="button primary" onClick={() => user ? setIsCreating(true) : router.push("/login")}>Create your first list</button></div>}
    {showDevelopmentSamples && <section className="section"><div className="section-head"><div><span className="eyebrow">Mock mode</span><h2>Sample public lists</h2></div></div><div className="list-grid">{lists.map((list) => <Link className="list-card" href={`/lists/${list.id}`} key={list.id}><div className="list-covers">{list.mediaIds.slice(0, 4).map((id) => { const media = mediaById(id)!; return <div key={id}><Image src={media.posterUrl} alt="" fill sizes="160px"/></div>; })}</div><div className="list-copy"><h3>{list.title}</h3><p>{list.description}</p><div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}><Image className="avatar" src={list.owner.avatarUrl} width={24} height={24} alt=""/><span className="muted" style={{ fontSize: 11 }}>{list.owner.displayName} · {list.mediaIds.length} stories</span>{list.isPrivate && <LockKeyhole size={12}/>}</div></div></Link>)}</div></section>}
  </div></div>;
}
