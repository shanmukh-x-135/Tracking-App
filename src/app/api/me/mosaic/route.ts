import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { periodFor } from "@/lib/mosaic/snapshot";
import { getMosaicSnapshot } from "@/lib/services/mosaic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try { return NextResponse.json(await getMosaicSnapshot(user.client, user.id, periodFor(new URL(request.url).searchParams.get("period")))); }
  catch (error) { return apiError("VALIDATION_ERROR", error instanceof Error ? error.message : "Your Mosaic could not be loaded.", 400); }
}
