import { MosaicPage } from "@/components/mosaic/mosaic-page";

export const metadata = { title: "Your Mosaic" };

export default async function Page({ searchParams }: { searchParams: Promise<{ recap?: string }> }) {
  const { recap } = await searchParams;
  return <MosaicPage recapPeriod={recap}/>;
}
