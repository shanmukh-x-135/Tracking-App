import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveAnalytics, type MosaicAnalytics } from "@/lib/analytics/derive";
import { projectActivity, type ActivityEvent } from "@/lib/activity/projection";
import { projectContinueItems, type ContinueItem } from "@/lib/current-media/projection";
import { applySupabaseMutation, readSupabaseState } from "@/lib/persistence/supabase-state";
import { projectLibraryEntries, type LibraryProjectionOptions, type MobileLibraryEntry } from "@/lib/library/projection";
import { deriveMosaicSnapshot, type MosaicPeriod, type MosaicSnapshot } from "@/lib/mosaic/snapshot";
import type { MosaicState, PersistenceMutation, UserList } from "@/lib/persistence/types";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export async function getMosaicState(client: Client, userId: string): Promise<MosaicState> {
  return readSupabaseState(client, userId);
}

export async function applyMosaicMutation(client: Client, userId: string, mutation: PersistenceMutation): Promise<MosaicState> {
  await applySupabaseMutation(client, userId, mutation);
  return getMosaicState(client, userId);
}

export async function getCurrentMedia(client: Client, userId: string, limit?: number): Promise<ContinueItem[]> {
  return projectContinueItems(await getMosaicState(client, userId), limit === undefined ? {} : { limit });
}

export async function getLibrary(client: Client, userId: string, options: LibraryProjectionOptions = {}): Promise<MobileLibraryEntry[]> {
  return projectLibraryEntries(await getMosaicState(client, userId), options);
}

export async function getActivity(client: Client, userId: string, limit: number): Promise<ActivityEvent[]> {
  return projectActivity(await getMosaicState(client, userId)).slice(0, limit);
}

export async function getStats(client: Client, userId: string): Promise<MosaicAnalytics> {
  return deriveAnalytics(await getMosaicState(client, userId));
}

export async function getMosaicSnapshot(client: Client, userId: string, period: MosaicPeriod): Promise<MosaicSnapshot> {
  return deriveMosaicSnapshot(await getMosaicState(client, userId), period);
}

export async function getLists(client: Client, userId: string): Promise<UserList[]> {
  return (await getMosaicState(client, userId)).lists;
}

export interface MosaicProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  watchRegion: string | null;
}

export async function getProfile(client: Client, userId: string): Promise<MosaicProfile | undefined> {
  const { data, error } = await client
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,watch_region")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Profile could not be loaded.");
  if (!data) return undefined;
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    watchRegion: data.watch_region,
  };
}
