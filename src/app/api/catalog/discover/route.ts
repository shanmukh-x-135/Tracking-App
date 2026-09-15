import { NextResponse } from "next/server";
import { discoverCatalog } from "@/lib/media/catalog";

export const revalidate = 3600;

export async function GET() {
  const result = await discoverCatalog();
  return NextResponse.json(result);
}
