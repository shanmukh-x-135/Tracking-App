"use client";

import Link from "next/link";
import Image from "next/image";
import { Bell, Compass, Library, LogIn, Plus, Search, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { QuickLogDialog } from "@/components/log/quick-log-dialog";
import { SearchDialog } from "@/components/search/search-dialog";
import { MosaicMotion, PageTransition } from "@/components/motion/motion";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { CatalogMedia } from "@/lib/media/types";

declare global {
  interface Window { __mosaicQuickLogContext?: CatalogMedia }
}

const links = [
  { href: "/home", label: "Home" }, { href: "/discover", label: "Discover" },
  { href: "/library", label: "Library" }, { href: "/lists", label: "Lists" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logMedia, setLogMedia] = useState<CatalogMedia>();
  const openLog = () => {
    setLogMedia(window.__mosaicQuickLogContext);
    setLogOpen(true);
  };

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
    const setContext = (event: Event) => setLogMedia((event as CustomEvent<CatalogMedia | undefined>).detail);
    window.addEventListener("mosaic:log-context", setContext);
    return () => window.removeEventListener("mosaic:log-context", setContext);
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
  const active = (href: string) => pathname.startsWith(href.split("?")[0]);

  return <MosaicMotion>
    <header className="desktop-nav glass">
      <Link href="/home" className="brand" aria-label="Mosaic home">
        <Image className="brand-wordmark" src="/brand/mosaic/wordmark.png" width={132} height={44} priority alt="Mosaic"/>
      </Link>
      <nav className="desktop-links" aria-label="Main navigation">{links.map((link) => <Link key={link.label} href={link.href} className={`nav-link ${active(link.href) ? "active" : ""}`}>{link.label}</Link>)}</nav>
      <div className="nav-actions">
        <button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={16}/><span>Search everything</span><kbd>⌘ K</kbd></button>
        <button className="button" onClick={openLog}><Plus size={15}/>Log</button>
        <Link className="icon-button" href="/activity" aria-label="Activity"><Bell size={18}/></Link>
        {!isLoading && (user ? <Link href="/profile" aria-label="Your profile"><UserAvatar name={user.displayName} avatarUrl={user.avatarUrl}/><span className="sr-only">{user.displayName.slice(0, 1)}</span></Link> : <Link className="button" href="/login"><LogIn size={15}/>Sign in</Link>)}
      </div>
    </header>
    <main className="app-main"><PageTransition routeKey={pathname}>{children}</PageTransition></main>
    <footer className="app-footer"><span>Track every story in one place.</span><Link href="/credits">Data sources & credits</Link></footer>
    <nav className="mobile-nav glass" aria-label="Mobile navigation">
      <Link className={`mobile-link ${pathname === "/home" ? "active" : ""}`} href="/home"><Image className="mobile-brand-emblem" src="/brand/mosaic/emblem.png" width={21} height={21} alt=""/>Home</Link>
      <Link className={`mobile-link ${pathname.startsWith("/discover") ? "active" : ""}`} href="/discover"><Compass size={19}/>Discover</Link>
      <button className="mobile-link log" onClick={openLog}><Plus size={22}/>Log</button>
      <Link className={`mobile-link ${pathname.startsWith("/library") ? "active" : ""}`} href="/library"><Library size={19}/>Library</Link>
      <Link className={`mobile-link ${pathname.startsWith("/profile") ? "active" : ""}`} href={user ? "/profile" : "/login"}><UserRound size={19}/>Profile</Link>
    </nav>
    <SearchDialog open={searchOpen} onOpenChange={setSearchOpen}/>
    <QuickLogDialog open={logOpen} onOpenChange={(value) => { setLogOpen(value); if (!value) setLogMedia(undefined); }} initialMedia={logMedia}/>
  </MosaicMotion>;
}
