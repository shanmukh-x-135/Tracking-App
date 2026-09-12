import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { AuthGateway, AuthResult, AuthUser } from "@/lib/auth/types";

function normalizeUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : user.email?.split("@")[0] ?? "Mosaic member",
    avatarUrl: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : undefined,
  };
}

export const supabaseAuthGateway: AuthGateway = {
  async getUser() {
    const { data, error } = await createClient().auth.getUser();
    if (error) return null;
    return data.user ? normalizeUser(data.user) : null;
  },
  async signIn(email, password): Promise<AuthResult> {
    const { data, error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { user: data.user ? normalizeUser(data.user) : undefined };
  },
  async signUp(email, password, displayName): Promise<AuthResult> {
    const { data, error } = await createClient().auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) throw new Error(error.message);
    return data.session
      ? { user: data.user ? normalizeUser(data.user) : undefined }
      : { message: "Check your email to confirm your Mosaic account." };
  },
  async signInWithGoogle() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  },
  async signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) throw new Error(error.message);
  },
  subscribe(callback) {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => callback(session?.user ? normalizeUser(session.user) : null));
    return () => data.subscription.unsubscribe();
  },
};
