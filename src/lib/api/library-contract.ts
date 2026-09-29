import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import type { LibraryProjectionOptions, MobileLibraryEntry } from "@/lib/library/projection";

const mediaTypeSchema = z.enum(["movie", "tv", "game", "book"]);
const statusSchema = z.enum(["watchlist", "watched", "watching", "completed", "paused", "dropped", "backlog", "playing", "want_to_read", "reading", "finished", "dnf"]);
const sortSchema = z.enum(["updated", "title", "rating", "release"]);

export function parseLibraryRequest(request: Request): LibraryProjectionOptions | Response {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const sort = url.searchParams.get("sort");
  const parsedType = type === null ? undefined : mediaTypeSchema.safeParse(type);
  if (parsedType && !parsedType.success) return apiError("VALIDATION_ERROR", "Type must be movie, tv, game, or book.", 400);
  const parsedStatus = status === null ? undefined : statusSchema.safeParse(status);
  if (parsedStatus && !parsedStatus.success) return apiError("VALIDATION_ERROR", "Status is not supported by Mosaic Library.", 400);
  const parsedSort = sort === null ? undefined : sortSchema.safeParse(sort);
  if (parsedSort && !parsedSort.success) return apiError("VALIDATION_ERROR", "Sort must be updated, title, rating, or release.", 400);
  return { mediaType: parsedType?.data, status: parsedStatus?.data, sort: parsedSort?.data };
}

interface LibraryUser<Client> { id: string; client: Client; }

/** HTTP adapter only; projection and persistence rules remain outside the route. */
export function createLibraryGetHandler<Client>(dependencies: {
  getAuthenticatedUser(request: Request): Promise<LibraryUser<Client> | undefined>;
  getLibrary(client: Client, userId: string, options: LibraryProjectionOptions): Promise<MobileLibraryEntry[]>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const user = await dependencies.getAuthenticatedUser(request);
    if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);
    const options = parseLibraryRequest(request);
    if (options instanceof Response) return options;
    try {
      return NextResponse.json({ items: await dependencies.getLibrary(user.client, user.id, options) });
    } catch {
      return apiError("INTERNAL_ERROR", "Your library could not be loaded.", 500);
    }
  };
}
