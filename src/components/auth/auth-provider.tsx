"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAuthGateway } from "@/lib/auth/gateway";
import type { AuthUser, ProfileUpdate } from "@/lib/auth/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refresh(): Promise<void>;
  updateProfile(profile: ProfileUpdate): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const gateway = useMemo(() => getAuthGateway(), []);

  const refresh = useCallback(async () => {
    setUser(await gateway.getUser());
    setIsLoading(false);
  }, [gateway]);

  const updateProfile = useCallback(async (profile: ProfileUpdate) => {
    const nextUser = await gateway.updateProfile(profile);
    setUser(nextUser);
  }, [gateway]);

  useEffect(() => {
    let isActive = true;
    void gateway.getUser().then((nextUser) => {
      if (isActive) { setUser(nextUser); setIsLoading(false); }
    });
    const unsubscribe = gateway.subscribe((nextUser) => { setUser(nextUser); setIsLoading(false); });
    return () => { isActive = false; unsubscribe(); };
  }, [gateway]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    refresh,
    updateProfile,
    async signOut() { await gateway.signOut(); setUser(null); },
  }), [gateway, isLoading, refresh, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
