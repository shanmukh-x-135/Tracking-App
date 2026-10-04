import { MosaicPage } from "@/components/mosaic/mosaic-page";

export const metadata = { title: "Your Mosaic" };

export default async function Page({ searchParams }: { searchParams: Promise<{ recap?: string; period?: string }> }) {
  const { recap, period } = await searchParams;
  return <MosaicPage key={recap ?? period ?? "all"} recapPeriod={recap} initialPeriod={period}/>;
}
