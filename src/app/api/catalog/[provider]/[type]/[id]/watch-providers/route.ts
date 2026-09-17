import { NextResponse } from "next/server";
import { getWatchAvailability } from "@/lib/media/catalog";
import { isMediaProvider } from "@/lib/media/catalog";
import type { MediaType } from "@/types/media";

export async function GET(request: Request, context: { params: Promise<{ provider: string; type: string; id: string }> }) {
  const { provider, type, id } = await context.params;
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase() ?? "";
  if (!isMediaProvider(provider) || (type !== "movie" && type !== "tv") || !/^[A-Z]{2}$/.test(country) || !id) return NextResponse.json({ error: "Invalid watch-provider request." }, { status: 400 });
  try {
    const availability = await getWatchAvailability({ provider, mediaType: type as MediaType, providerId: id }, country);
    return NextResponse.json(availability, { headers: { "Cache-Control": "private, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    // Availability is supplemental. A provider outage must never break the detail page.
    return NextResponse.json({ error: "Watch availability is temporarily unavailable." }, { status: 503 });
  }
}
