"use client";
import Image from "next/image";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { allMedia, users } from "@/data/media";
import { mediaHref } from "@/components/media/media-card";
import { Dialog } from "@/components/ui/dialog";

export function SearchDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}) {
  const [query,setQuery]=useState(""); const router=useRouter();
  const matches=useMemo(()=>{const q=query.trim().toLowerCase();return q?allMedia.filter(m=>`${m.title} ${m.creators.join(" ")}`.toLowerCase().includes(q)):allMedia.slice(0,8)},[query]);
  const groups=["movie","tv","game","book"] as const;
  const go=(href:string)=>{onOpenChange(false);setQuery("");router.push(href)};
  const moveFocus=(event:React.KeyboardEvent<HTMLDivElement>)=>{if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".result-row"));if(!buttons.length)return;const current=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==="ArrowDown"?(current+1)%buttons.length:(current<=0?buttons.length:current)-1;buttons[next].focus();};
  return <Dialog open={open} onOpenChange={onOpenChange} title="Search Mosaic"><div onKeyDown={moveFocus}><div className="dialog-head"><Search size={20} className="muted"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search movies, series, games, books, people…" aria-label="Search all media"/></div><div className="search-results">{groups.map(type=>{const items=matches.filter(m=>m.mediaType===type);if(!items.length)return null;return <section className="result-group" key={type}><div className="result-label">{type==="tv"?"Series":`${type}s`}</div>{items.slice(0,4).map(item=><button className="result-row" key={item.id} onClick={()=>go(mediaHref(item))}><span className="result-image"><Image src={item.posterUrl} alt="" fill sizes="40px"/></span><span><strong>{item.title}</strong><span>{item.releaseYear} · {item.creators[0]}</span></span><span className="rating">★ {item.averageRating}</span></button>)}</section>})}{query&&users.filter(u=>`${u.displayName} ${u.username}`.toLowerCase().includes(query.toLowerCase())).length>0&&<section className="result-group"><div className="result-label">People</div>{users.filter(u=>`${u.displayName} ${u.username}`.toLowerCase().includes(query.toLowerCase())).map(user=><button className="result-row" key={user.id} onClick={()=>go("/profile")}><Image className="avatar" src={user.avatarUrl} alt="" width={40} height={40}/><span><strong>{user.displayName}</strong><span>@{user.username}</span></span></button>)}</section>}{matches.length===0&&<div style={{padding:40,textAlign:"center"}}><strong>No matches yet</strong><p className="muted">Try a title, creator, or author.</p></div>}</div></div></Dialog>;
}
