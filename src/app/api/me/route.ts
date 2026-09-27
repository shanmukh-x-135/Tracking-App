import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { getProfile } from "@/lib/services/mosaic";

/** A compact authenticated identity and profile DTO for browser and native clients. */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try {
    const profile = await getProfile(user.client, user.id);
    return NextResponse.json({ id: user.id, profile: profile ?? null });
  } catch {
    return apiError("INTERNAL_ERROR", "Your profile could not be loaded.", 500);
  }
}
