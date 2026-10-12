import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { createAssistantHandler } from "@/lib/assistant/handler";
import { createLimiter } from "@/lib/assistant/limits";
import { createOpenRouterModel } from "@/lib/assistant/openrouter-model";
import { demoModel } from "@/lib/assistant/scripted-model";
import { getPublicEnvironment, getServerEnvironment } from "@/lib/config/env";
import { getCatalogItem, relatedCatalog, searchCatalog } from "@/lib/media/catalog";
import { readSupabaseState } from "@/lib/persistence/supabase-state";

export const maxDuration = 60;

// Best-effort, per instance; the OpenRouter free quota (50/day per account) is the hard ceiling.
const limiter = createLimiter({ perUser: 5, windowMs: 10 * 60_000, perDay: 40 });

export async function POST(request: Request) {
  const server = getServerEnvironment();
  const handler = createAssistantHandler({
    dataMode: getPublicEnvironment().dataMode,
    getAuthenticatedUser,
    loadState: readSupabaseState,
    catalog: { search: (query) => searchCatalog(query), getItem: (identity) => getCatalogItem(identity), related: (media) => relatedCatalog(media) },
    enabled: server.aiEnabled,
    allowedUsers: server.aiAllowedUsers,
    createModel() {
      try {
        return createOpenRouterModel({ apiKey: server.openRouterApiKey ?? "", model: server.aiModel ?? "", provider: server.aiProvider ?? "", referer: process.env.NEXT_PUBLIC_SITE_URL || undefined });
      } catch (error) {
        console.error("mosaic.assistant misconfigured", { message: error instanceof Error ? error.message : "Unknown error" });
        return null;
      }
    },
    createMockModel: demoModel,
    limiter,
  });
  return handler(request);
}
