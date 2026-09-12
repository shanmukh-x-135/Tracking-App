"use client";

import { getPublicEnvironment } from "@/lib/config/env";
import { mockAuthGateway } from "@/lib/auth/mock-gateway";
import { supabaseAuthGateway } from "@/lib/auth/supabase-gateway";

export function getAuthGateway() {
  return getPublicEnvironment().dataMode === "live" ? supabaseAuthGateway : mockAuthGateway;
}
