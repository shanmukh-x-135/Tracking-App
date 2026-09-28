import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { getCurrentMedia } from "@/lib/services/mosaic";
import { createContinueGetHandler } from "@/lib/api/continue-route";

export const GET = createContinueGetHandler({ getAuthenticatedUser, getCurrentMedia });
