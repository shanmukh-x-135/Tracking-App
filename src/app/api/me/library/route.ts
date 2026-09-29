import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { getLibrary } from "@/lib/services/mosaic";
import { createLibraryGetHandler } from "@/lib/api/library-contract";

export const GET = createLibraryGetHandler({ getAuthenticatedUser, getLibrary });
