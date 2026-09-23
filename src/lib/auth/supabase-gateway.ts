import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createOAuthCallbackUrl } from "@/lib/auth/return-path";
import type { AuthGateway, AuthResult, AuthUser, ProfileUpdate } from "@/lib/auth/types";

function normalizeUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : user.email?.split("@")[0] ?? "Mosaic member",
    avatarUrl: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : undefined,
  };
}

async function profileFor(user: User): Promise<AuthUser> {
  const fallback = normalizeUser(user);
  const { data, error } = await createClient().from("profiles").select("username,display_name,bio,avatar_url").eq("id", user.id).maybeSingle();
  // A session must still be usable if a legacy account's profile trigger has
  // not completed yet. Profile editing gives the owner a clear retry path.
  if (error || !data) return fallback;
  return { ...fallback, username: data.username, displayName: data.display_name || fallback.displayName, bio: data.bio ?? undefined, avatarUrl: data.avatar_url ?? fallback.avatarUrl };
}

export const supabaseAuthGateway: AuthGateway = {
  async getUser() {
    const { data, error } = await createClient().auth.getUser();
    if (error) return null;
    return data.user ? profileFor(data.user) : null;
  },
  async signIn(email, password): Promise<AuthResult> {
    const { data, error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { user: data.user ? await profileFor(data.user) : undefined };
  },
  async signUp(email, password, displayName): Promise<AuthResult> {
    const { data, error } = await createClient().auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) throw new Error(error.message);
    return data.session
      ? { user: data.user ? await profileFor(data.user) : undefined }
      : { message: "Check your email to confirm your Mosaic account." };
  },
  async signInWithGoogle(returnTo) {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: createOAuthCallbackUrl(window.location.origin, returnTo ?? null) },
    });
    if (error) throw new Error(error.message);
  },
  async updateProfile(profile: ProfileUpdate) {
    const client = createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Sign in to edit your profile.");
    const username = profile.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error("Use a username with 3–30 lowercase letters, numbers, or underscores.");
    const displayName = profile.displayName.trim();
    if (!displayName || displayName.length > 80) throw new Error("Display names must be between 1 and 80 characters.");
    if ((profile.bio?.length ?? 0) > 500) throw new Error("Bios can be at most 500 characters.");
    const { data, error } = await client.from("profiles").update({
      username,
      display_name: displayName,
      bio: profile.bio?.trim() || null,
      avatar_url: profile.avatarUrl?.trim() || null,
    }).eq("id", auth.user.id).select("username,display_name,bio,avatar_url").single();
    if (error) throw new Error(error.code === "23505" ? "That username is already taken." : error.message);
    const { error: metadataError } = await client.auth.updateUser({ data: { display_name: data.display_name, avatar_url: data.avatar_url } });
    if (metadataError) throw new Error(metadataError.message);
    return { ...normalizeUser(auth.user), username: data.username, displayName: data.display_name, bio: data.bio ?? undefined, avatarUrl: data.avatar_url ?? undefined };
  },
  async signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) throw new Error(error.message);
  },
  subscribe(callback) {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => { void (session?.user ? profileFor(session.user) : Promise.resolve(null)).then(callback); });
    return () => data.subscription.unsubscribe();
  },
};
