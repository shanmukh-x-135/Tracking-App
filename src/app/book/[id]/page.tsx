import { notFound } from "next/navigation";
import { DetailPage } from "@/components/detail/detail-page";
import { resolveDetailMedia } from "@/lib/media/detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const media = await resolveDetailMedia((await params).id, "book");
  if (!media) notFound();
  return <DetailPage media={media}/>;
}
