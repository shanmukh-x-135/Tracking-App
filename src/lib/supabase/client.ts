"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnvironment } from "@/lib/config/env";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  const environment = getPublicEnvironment();
  if (environment.dataMode !== "live") {
    throw new Error("Supabase browser client is only available in live data mode.");
  }

  browserClient ??= createBrowserClient<Database>(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
  );
  return browserClient;
}
