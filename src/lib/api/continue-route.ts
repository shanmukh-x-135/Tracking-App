import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import type { ContinueItem } from "@/lib/current-media/projection";

const limitSchema = z.coerce.number().int().min(1).max(100).optional();

interface ContinueUser<Client> {
  id: string;
  client: Client;
}

/** HTTP-only adapter for the current-media domain service. */
export function createContinueGetHandler<Client>(dependencies: {
  getAuthenticatedUser(request: Request): Promise<ContinueUser<Client> | undefined>;
  getCurrentMedia(client: Client, userId: string, limit?: number): Promise<ContinueItem[]>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const user = await dependencies.getAuthenticatedUser(request);
    if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
    const parsed = limitSchema.safeParse(new URL(request.url).searchParams.get("limit") ?? undefined);
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Limit must be between 1 and 100.", 400);
    try {
      return NextResponse.json({ items: await dependencies.getCurrentMedia(user.client, user.id, parsed.data) });
    } catch {
      return apiError("INTERNAL_ERROR", "Your current media could not be loaded.", 500);
    }
  };
}
