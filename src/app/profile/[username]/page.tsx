import Image from "next/image";
import { notFound } from "next/navigation";
import { users } from "@/data/media";
import { getPublicEnvironment } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  ratings: number;
  reviews: number;
  lists: number;
}

async function findProfile(username: string): Promise<PublicProfile | null> {
  if (getPublicEnvironment().dataMode === "mock") {
    const user = users.find((candidate) => candidate.username === username);
    return user ? { ...user, ratings: 18, reviews: 7, lists: 3 } : null;
  }

  const client = await createClient();
  const { data: profile, error } = await client.from("profiles").select("id,username,display_name,bio,avatar_url").eq("username", username).maybeSingle();
  if (error || !profile) return null;
  const [ratings, reviews, lists] = await Promise.all([
    client.from("ratings").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    client.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    client.from("lists").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("visibility", "public"),
  ]);
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    bio: profile.bio ?? undefined,
    avatarUrl: profile.avatar_url ?? undefined,
    ratings: ratings.count ?? 0,
    reviews: reviews.count ?? 0,
    lists: lists.count ?? 0,
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await findProfile(decodeURIComponent(username).toLowerCase());
  if (!profile) notFound();

  return <div className="page"><div className="page-narrow">
    <header className="profile-header">
      {profile.avatarUrl ? <Image className="avatar" src={profile.avatarUrl} alt={profile.displayName} width={96} height={96}/> : <span className="avatar avatar-fallback profile-avatar">{profile.displayName.slice(0, 1).toUpperCase()}</span>}
      <div><h1>{profile.displayName}</h1><span className="muted">@{profile.username}</span><p>{profile.bio ?? "Tracking stories across every medium."}</p></div>
      <div className="profile-counts"><div><strong>{profile.ratings}</strong><span>Ratings</span></div><div><strong>{profile.reviews}</strong><span>Reviews</span></div><div><strong>{profile.lists}</strong><span>Public lists</span></div></div>
    </header>
    <section className="section"><div className="empty-state"><strong>Public activity is coming next</strong><p>Mosaic keeps private library progress protected while exposing only intentionally public contributions.</p></div></section>
  </div></div>;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · Profile` };
}
