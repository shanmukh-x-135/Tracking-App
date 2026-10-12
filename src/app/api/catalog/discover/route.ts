import { NextResponse } from "next/server";
import { discoverCatalog } from "@/lib/media/catalog";
import { fallbackRegion, isRegion } from "@/lib/media/region";

export const revalidate = 3600;

export async function GET(request: Request) {
  const region = new URL(request.url).searchParams.get("region");
  const result = await discoverCatalog({ region: isRegion(region) ? region : fallbackRegion });
  return NextResponse.json({ ...result, region: isRegion(region) ? region : fallbackRegion });
}
