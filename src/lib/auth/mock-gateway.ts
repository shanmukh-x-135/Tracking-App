import type { AuthGateway, AuthResult, AuthUser, ProfileUpdate } from "@/lib/auth/types";

const storageKey = "mosaic:mock-user";

function stableId(email: string): string {
  let hash = 0;
  for (const character of email.toLowerCase()) hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  return `mock-${Math.abs(hash).toString(36)}`;
}

function usernameFor(value: string): string {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  return normalized.length >= 3 ? normalized : "mosaic_member";
}

function readUser(): AuthUser | null {
  const value = window.localStorage.getItem(storageKey);
  if (!value) return null;
  try { return JSON.parse(value) as AuthUser; } catch { return null; }
}

function saveUser(user: AuthUser | null): void {
  if (user) window.localStorage.setItem(storageKey, JSON.stringify(user));
  else window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new CustomEvent("mosaic:auth", { detail: user }));
}

function userFor(email: string, displayName?: string): AuthUser {
  const normalizedEmail = email.trim().toLowerCase();
  return { id: stableId(normalizedEmail), email: normalizedEmail, displayName: displayName?.trim() || normalizedEmail.split("@")[0] || "Mosaic member", username: usernameFor(normalizedEmail.split("@")[0] ?? "") };
}

export const mockAuthGateway: AuthGateway = {
  async getUser() { return readUser(); },
  async signIn(email, password): Promise<AuthResult> {
    if (!email.includes("@") || password.length < 8) throw new Error("Enter a valid email and a password of at least 8 characters.");
    const previous = readUser();
    const user = userFor(email, previous?.email === email.trim().toLowerCase() ? previous.displayName : undefined);
    saveUser(user);
    return { user };
  },
  async signUp(email, password, displayName): Promise<AuthResult> {
    if (!email.includes("@") || password.length < 8 || !displayName.trim()) throw new Error("Complete every field and use a password of at least 8 characters.");
    const user = userFor(email, displayName);
    saveUser(user);
    return { user };
  },
  async signInWithGoogle() {
    saveUser(userFor("alex@mosaic.local", "Alex Chen"));
  },
  async updateProfile(profile: ProfileUpdate) {
    const user = readUser();
    if (!user) throw new Error("Sign in to edit your profile.");
    const displayName = profile.displayName.trim();
    const username = usernameFor(profile.username);
    if (!displayName || profile.username !== username) throw new Error("Use a display name and a username with 3–30 lowercase letters, numbers, or underscores.");
    const next = { ...user, displayName, username, bio: profile.bio?.trim() || undefined, avatarUrl: profile.avatarUrl?.trim() || undefined };
    saveUser(next);
    return next;
  },
  async signOut() { saveUser(null); },
  subscribe(callback) {
    const listener = (event: Event) => callback((event as CustomEvent<AuthUser | null>).detail);
    window.addEventListener("mosaic:auth", listener);
    return () => window.removeEventListener("mosaic:auth", listener);
  },
};
