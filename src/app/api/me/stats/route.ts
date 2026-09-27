import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { getStats } from "@/lib/services/mosaic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try {
    return NextResponse.json(await getStats(user.client, user.id));
  } catch {
    return apiError("INTERNAL_ERROR", "Your stats could not be loaded.", 500);
  }
}
