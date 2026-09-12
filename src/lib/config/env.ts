import { z } from "zod";

const publicSchema = z.discriminatedUnion("dataMode", [
  z.object({ dataMode: z.literal("mock") }),
  z.object({
    dataMode: z.literal("live"),
    supabaseUrl: z.url(),
    supabasePublishableKey: z.string().min(1),
  }),
]);

const serverSchema = z.object({
  tmdbToken: z.string().min(1).optional(),
  igdbClientId: z.string().min(1).optional(),
  igdbClientSecret: z.string().min(1).optional(),
  googleBooksApiKey: z.string().min(1).optional(),
});

export type PublicEnvironment = z.infer<typeof publicSchema>;

export function getPublicEnvironment(): PublicEnvironment {
  const dataMode = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";

  if (dataMode === "mock") return { dataMode };

  return publicSchema.parse({
    dataMode,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function getServerEnvironment() {
  return serverSchema.parse({
    tmdbToken: process.env.TMDB_API_READ_TOKEN || undefined,
    igdbClientId: process.env.IGDB_CLIENT_ID || undefined,
    igdbClientSecret: process.env.IGDB_CLIENT_SECRET || undefined,
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || undefined,
  });
}

export function isLiveMode(): boolean {
  return getPublicEnvironment().dataMode === "live";
}
