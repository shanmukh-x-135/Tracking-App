"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Compass, Home, LogIn, Plus, Search, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { QuickLogDialog } from "@/components/log/quick-log-dialog";
import { SearchDialog } from "@/components/search/search-dialog";
import type { CatalogMedia } from "@/lib/media/types";

const links = [
  { href: "/", label: "Home" }, { href: "/discover?type=movie", label: "Movies" },
  { href: "/discover?type=tv", label: "Series" }, { href: "/discover?type=game", label: "Games" },
  { href: "/discover?type=book", label: "Books" }, { href: "/lists", label: "Lists" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logMedia, setLogMedia] = useState<CatalogMedia>();

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    const openContextualLog = (event: Event) => {
      const media = (event as CustomEvent<CatalogMedia>).detail;
      if (media) setLogMedia(media);
      setLogOpen(true);
    };
    window.addEventListener("mosaic:quick-log", openContextualLog);
    return () => window.removeEventListener("mosaic:quick-log", openContextualLog);
  }, []);

  if (pathname === "/login" || pathname === "/signup") return <>{children}</>;
  const active = (href: string) => href === "/" ? pathname === href : pathname.startsWith(href.split("?")[0]);

  return <>
    <header className="desktop-nav glass">
      <Link href="/" className="brand"><span className="brand-mark"/>Mosaic</Link>
      <nav className="desktop-links" aria-label="Main navigation">{links.map((link) => <Link key={link.label} href={link.href} className={`nav-link ${active(link.href) ? "active" : ""}`}>{link.label}</Link>)}</nav>
      <div className="nav-actions">
        <button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={16}/><span>Search everything</span><kbd>⌘ K</kbd></button>
        <button className="button" onClick={() => { setLogMedia(undefined); setLogOpen(true); }}><Plus size={15}/>Log</button>
        <Link className="icon-button" href="/activity" aria-label="Activity"><Bell size={18}/></Link>
        {!isLoading && (user ? <Link href="/profile" aria-label="Your profile">{user.avatarUrl ? <Image className="avatar" src={user.avatarUrl} width={38} height={38} alt={user.displayName}/> : <span className="avatar avatar-fallback">{user.displayName.slice(0, 1).toUpperCase()}</span>}</Link> : <Link className="button" href="/login"><LogIn size={15}/>Sign in</Link>)}
      </div>
    </header>
    <main className="app-main">{children}</main>
    <footer className="app-footer"><span>Track every story in one place.</span><Link href="/credits">Data sources & credits</Link></footer>
    <nav className="mobile-nav glass" aria-label="Mobile navigation">
      <Link className={`mobile-link ${pathname === "/" ? "active" : ""}`} href="/"><Home size={19}/>Home</Link>
      <Link className={`mobile-link ${pathname.startsWith("/discover") ? "active" : ""}`} href="/discover"><Compass size={19}/>Discover</Link>
      <button className="mobile-link log" onClick={() => { setLogMedia(undefined); setLogOpen(true); }}><Plus size={22}/>Log</button>
      <Link className={`mobile-link ${pathname.startsWith("/activity") ? "active" : ""}`} href="/activity"><Bell size={19}/>Activity</Link>
      <Link className={`mobile-link ${pathname.startsWith("/profile") ? "active" : ""}`} href={user ? "/profile" : "/login"}><UserRound size={19}/>Profile</Link>
    </nav>
    <SearchDialog open={searchOpen} onOpenChange={setSearchOpen}/>
    <QuickLogDialog open={logOpen} onOpenChange={(value) => { setLogOpen(value); if (!value) setLogMedia(undefined); }} initialMedia={logMedia}/>
  </>;
}
