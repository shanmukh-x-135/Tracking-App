"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getPersistenceGateway } from "@/lib/persistence/gateway";
import { emptyMosaicState, type MosaicState, type PersistenceMutation } from "@/lib/persistence/types";

interface MosaicStateContextValue {
  state: MosaicState;
  isLoading: boolean;
  error?: string;
  /** Set only when the saved data itself could not be loaded (not when a single update fails). */
  loadError?: string;
  mutate(mutation: PersistenceMutation): Promise<void>;
  refresh(): Promise<void>;
}

const MosaicStateContext = createContext<MosaicStateContextValue | null>(null);

export function MosaicStateProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [loaded, setLoaded] = useState<{ userId: string; state: MosaicState }>();
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const gateway = useMemo(() => getPersistenceGateway(), []);

  useEffect(() => {
    if (!user) return;
    let isActive = true;
    void gateway.load(user.id).then((state) => {
      if (isActive) { setLoaded({ userId: user.id, state }); setError(undefined); setLoadError(undefined); }
    }).catch((cause) => {
      if (!isActive) return;
      const message = cause instanceof Error ? cause.message : "Your saved data could not be loaded.";
      setError(message); setLoadError(message);
    });
    return () => { isActive = false; };
  }, [gateway, user]);

  const mutate = useCallback(async (mutation: PersistenceMutation) => {
    if (!user) throw new Error("Sign in to save this update.");
    try {
      const state = await gateway.mutate(user.id, mutation);
      setLoaded({ userId: user.id, state });
      setError(undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Your update could not be saved.";
      setError(message);
      throw new Error(message);
    }
  }, [gateway, user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoadError(undefined);
    try {
      const state = await gateway.load(user.id);
      setLoaded({ userId: user.id, state });
      setError(undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Your saved data could not be loaded.";
      setError(message); setLoadError(message);
      throw new Error(message);
    }
  }, [gateway, user]);

  const state = loaded && user && loaded.userId === user.id ? loaded.state : emptyMosaicState();
  const value = useMemo<MosaicStateContextValue>(() => ({
    state, error, loadError, mutate, refresh,
    isLoading: isAuthLoading || Boolean(user && loaded?.userId !== user?.id && !loadError),
  }), [error, isAuthLoading, loadError, loaded?.userId, mutate, refresh, state, user]);

  return <MosaicStateContext.Provider value={value}>{children}</MosaicStateContext.Provider>;
}

export function useMosaicState(): MosaicStateContextValue {
  const context = useContext(MosaicStateContext);
  if (!context) throw new Error("useMosaicState must be used within MosaicStateProvider.");
  return context;
}
