import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { getCurrentMedia } from "@/lib/services/mosaic";

const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = limitSchema.safeParse(new URL(request.url).searchParams.get("limit") ?? undefined);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Limit must be between 1 and 100.", 400);
  try {
    return NextResponse.json({ items: await getCurrentMedia(user.client, user.id, parsed.data) });
  } catch {
    return apiError("INTERNAL_ERROR", "Your current media could not be loaded.", 500);
  }
}
