import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCatalog } from "@/lib/media/catalog";

const querySchema = z.string().trim().min(2).max(100);

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return NextResponse.json({ error: "Enter at least two characters." }, { status: 400 });
  return NextResponse.json(await searchCatalog(parsed.data));
}
