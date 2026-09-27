import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { persistenceMutationSchema } from "@/lib/persistence/validation";
import { applyMosaicMutation, getMosaicState } from "@/lib/services/mosaic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try { return NextResponse.json(await getMosaicState(user.client, user.id)); }
  catch (error) {
    console.error("Mosaic state could not be loaded.", { message: error instanceof Error ? error.message : "Unknown error" });
    return apiError("INTERNAL_ERROR", "Your Mosaic data could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const parsed = persistenceMutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "The update was invalid.", 400);
  try {
    return NextResponse.json(await applyMosaicMutation(user.client, user.id, parsed.data));
  } catch {
    return apiError("INTERNAL_ERROR", "Your update could not be saved.", 500);
  }
}
