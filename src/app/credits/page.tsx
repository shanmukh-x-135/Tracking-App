import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = { title: "Data sources & credits" };

export default function CreditsPage() {
  return <div className="page"><div className="page-narrow">
    <header className="page-hero"><span className="eyebrow">Data sources & credits</span><h1>The stories behind the stories.</h1><p>Mosaic combines provider metadata with the ratings, reviews, lists, and progress you create. Provider data remains attributed to its source.</p></header>
    <section className="credits-grid" aria-label="Catalog data providers">
      <article className="credit-card"><div className="credit-brand"><Image className="tmdb-logo" src="/provider-logos/tmdb.svg" alt="The Movie Database (TMDB)" width={185} height={133} unoptimized/></div><h2>Movies and series</h2><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a className="text-link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">Visit TMDB ↗</a></article>
      <article className="credit-card"><div className="credit-brand"><span className="credit-wordmark">IGDB</span></div><h2>Video games</h2><p>Game metadata, platforms, covers, and artwork are provided by IGDB.com.</p><a className="text-link" href="https://www.igdb.com" target="_blank" rel="noreferrer">Visit IGDB ↗</a></article>
      <article className="credit-card"><div className="credit-brand"><Image src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" width={62} height={30} unoptimized/></div><h2>Books</h2><p>Book metadata and cover images are supplied through the Google Books API Family.</p><a className="text-link" href="https://books.google.com" target="_blank" rel="noreferrer">Visit Google Books ↗</a></article>
    </section>
    <p className="credits-note">Provider names and marks belong to their respective owners. Their appearance identifies data sources and does not imply sponsorship or endorsement of Mosaic.</p>
  </div></div>;
}
