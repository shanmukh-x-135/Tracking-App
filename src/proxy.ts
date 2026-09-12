import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Framework assets and the development HMR socket never need an auth refresh.
  matcher: ["/((?!_next/|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
