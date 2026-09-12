import Image from "next/image";
import { AccountActions } from "@/components/auth/account-actions";
import { MediaShelf } from "@/components/media/media-card";
import { activities, books, games, movies, reviews, series, users } from "@/data/media";

export const metadata = { title: "Alex Chen" };

export default function Page() {
  const user = users[0];
  const favourites = [["Favourite movies", movies], ["Favourite series", series], ["Favourite games", games], ["Favourite books", books]] as const;

  return <div className="page"><div className="page-narrow">
    <header className="profile-header">
      <Image className="avatar" src={user.avatarUrl} alt={user.displayName} width={96} height={96}/>
      <div><h1>{user.displayName}</h1><span className="muted">@{user.username}</span><p>{user.bio}</p></div>
      <AccountActions/>
      <div className="profile-counts"><div><strong>384</strong><span>Followers</span></div><div><strong>271</strong><span>Following</span></div><div><strong>68</strong><span>Lists</span></div></div>
    </header>
    <div className="stats">{[["46", "Movies watched"], ["312", "Episodes watched"], ["7", "Games completed"], ["18", "Books read"]].map(([number, label]) => <div className="stat" key={label}><strong>{number}</strong><span>{label} · 2026</span></div>)}</div>
    {favourites.map(([title, items]) => <section className="section" key={title}><div className="section-head"><h2>{title}</h2></div><MediaShelf items={[...items]}/></section>)}
    <section className="section"><div className="section-head"><h2>Recent activity</h2></div><div className="panel">{activities.map((activity) => <div className="activity-row" key={activity.id}><Image className="avatar" src={activity.user.avatarUrl} width={42} height={42} alt=""/><div className="activity-copy"><strong>{activity.user.displayName}</strong> shared an update about <strong>{activity.media?.title}</strong>{activity.rating && <span className="rating"> ★ {activity.rating}</span>}</div><span className="activity-time">{activity.createdAt}</span></div>)}</div></section>
    <section className="section"><div className="section-head"><h2>Recent reviews</h2></div><div className="panel" style={{ padding: 18 }}>{reviews.slice(0, 2).map((review) => <blockquote key={review.id} style={{ margin: "0 0 18px", color: "var(--foreground-secondary)" }}>“{review.body}” <span className="rating">★ {review.rating}</span></blockquote>)}</div></section>
  </div></div>;
}
