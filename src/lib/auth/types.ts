export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface AuthResult {
  user?: AuthUser;
  message?: string;
}

export interface AuthGateway {
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, displayName: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(callback: (user: AuthUser | null) => void): () => void;
}
