"use client";
import { Grid2X2, List as ListIcon, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { allMedia } from "@/data/media";
import { MediaCard } from "@/components/media/media-card";
import type { MediaType } from "@/types/media";

const filters:[string,MediaType|null][]=[["All",null],["Movies","movie"],["Series","tv"],["Games","game"],["Books","book"]];
export function CollectionPage({mode}:{mode:"discover"|"library"}) {
 const [type,setType]=useState<MediaType|null>(null); const [sort,setSort]=useState("Trending");
 const items=useMemo(()=>allMedia.filter(m=>!type||m.mediaType===type).sort((a,b)=>sort==="Top Rated"?b.averageRating-a.averageRating:b.releaseYear-a.releaseYear),[type,sort]);
 return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">{mode==="discover"?"Find your next obsession":"Your collection"}</span><h1>{mode==="discover"?"Discover":"Library"}</h1><p>{mode==="discover"?"Stories are better when the format doesn’t get in the way. Browse what’s resonating across screens, pages, and worlds.":"Everything you’ve watched, played, read, and saved — organized around how each medium actually works."}</p></header><div className="toolbar"><div className="filter-bar glass" style={{marginTop:0}}>{filters.map(([label,value])=><button key={label} className={`filter-button ${type===value?"active":""}`} onClick={()=>setType(value)}>{label}</button>)}</div><div className="toolbar-right">{mode==="discover"?["Trending","Popular","New","Top Rated"].map(value=><button key={value} className={`filter-button ${sort===value?"active":""}`} onClick={()=>setSort(value)}>{value}</button>):<><button className="button"><SlidersHorizontal size={14}/>Filter</button><button className="icon-button glass" aria-label="Grid view"><Grid2X2 size={17}/></button><button className="icon-button" aria-label="List view"><ListIcon size={17}/></button></>}</div></div>{mode==="library"&&<div className="filter-bar" style={{marginTop:14}}>{(type==="movie"?["Watched","Watchlist"]:type==="tv"?["Watching","Completed","Paused","Dropped"]:type==="game"?["Playing","Backlog","Completed","Dropped"]:type==="book"?["Reading","Want to Read","Finished"]:["In progress","Completed","Saved"]).map((s,i)=><button key={s} className={`filter-button ${i===0?"active":""}`}>{s}</button>)}</div>}<div className="media-grid">{items.map((media,i)=><MediaCard key={media.id} media={media} showType={!type} priority={i<6}/>)}</div></div></div>;
}
