"use client";
import Image from "next/image";
import Link from "next/link";
import { Bell, Compass, Home, Plus, Search, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchDialog } from "@/components/search/search-dialog";
import { QuickLogDialog } from "@/components/log/quick-log-dialog";

const links = [{href:"/",label:"Home"},{href:"/discover?type=movie",label:"Movies"},{href:"/discover?type=tv",label:"Series"},{href:"/discover?type=game",label:"Games"},{href:"/discover?type=book",label:"Books"},{href:"/lists",label:"Lists"}];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen,setSearchOpen] = useState(false);
  const [logOpen,setLogOpen] = useState(false);
  useEffect(()=>{ const key=(event:KeyboardEvent)=>{ if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearchOpen(true);} }; window.addEventListener("keydown",key); return()=>window.removeEventListener("keydown",key); },[]);
  const active=(href:string)=>href==="/"?pathname===href:pathname.startsWith(href.split("?")[0]);
  return <><header className="desktop-nav glass"><Link href="/" className="brand"><span className="brand-mark"/>Mosaic</Link><nav className="desktop-links" aria-label="Main navigation">{links.map(link=><Link key={link.label} href={link.href} className={`nav-link ${active(link.href)?"active":""}`}>{link.label}</Link>)}</nav><div className="nav-actions"><button className="search-trigger" onClick={()=>setSearchOpen(true)}><Search size={16}/><span>Search everything</span><kbd>⌘ K</kbd></button><button className="button" onClick={()=>setLogOpen(true)}><Plus size={15}/>Log</button><Link className="icon-button" href="/activity" aria-label="Activity"><Bell size={18}/></Link><Link href="/profile" aria-label="Your profile"><Image className="avatar" src="https://i.pravatar.cc/160?img=12" width={38} height={38} alt="Alex Chen"/></Link></div></header>
  <main className="app-main">{children}</main>
  <nav className="mobile-nav glass" aria-label="Mobile navigation"><Link className={`mobile-link ${pathname==="/"?"active":""}`} href="/"><Home size={19}/>Home</Link><Link className={`mobile-link ${pathname.startsWith("/discover")?"active":""}`} href="/discover"><Compass size={19}/>Discover</Link><button className="mobile-link log" onClick={()=>setLogOpen(true)}><Plus size={22}/>Log</button><Link className={`mobile-link ${pathname.startsWith("/activity")?"active":""}`} href="/activity"><Bell size={19}/>Activity</Link><Link className={`mobile-link ${pathname.startsWith("/profile")?"active":""}`} href="/profile"><UserRound size={19}/>Profile</Link></nav>
  <button className="sr-only" onClick={()=>setLogOpen(true)} aria-label="Open quick log">Log media</button><SearchDialog open={searchOpen} onOpenChange={setSearchOpen}/><QuickLogDialog open={logOpen} onOpenChange={setLogOpen}/></>;
}
