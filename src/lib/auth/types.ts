export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface ProfileUpdate {
  displayName: string;
  username: string;
  bio?: string;
  avatarUrl?: string | null;
}

export interface AuthResult {
  user?: AuthUser;
  message?: string;
}

export interface AuthGateway {
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, displayName: string): Promise<AuthResult>;
  signInWithGoogle(returnTo?: string): Promise<void>;
  updateProfile(profile: ProfileUpdate): Promise<AuthUser>;
  signOut(): Promise<void>;
  subscribe(callback: (user: AuthUser | null) => void): () => void;
}
