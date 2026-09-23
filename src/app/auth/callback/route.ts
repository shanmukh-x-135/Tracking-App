import type { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/auth/callback";
import { isLiveMode } from "@/lib/config/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    isLive: isLiveMode(),
    exchangeCodeForSession: async (code) => (await createClient()).auth.exchangeCodeForSession(code),
  });
}
