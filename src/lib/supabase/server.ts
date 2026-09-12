import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnvironment } from "@/lib/config/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const environment = getPublicEnvironment();
  if (environment.dataMode !== "live") {
    throw new Error("Supabase server client is only available in live data mode.");
  }

  const cookieStore = await cookies();
  return createServerClient<Database>(environment.supabaseUrl, environment.supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts owns session refresh.
        }
      },
    },
  });
}
