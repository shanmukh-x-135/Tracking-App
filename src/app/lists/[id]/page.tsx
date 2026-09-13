import type { Metadata } from "next";
import { ListDetail } from "@/components/lists/list-detail";

export const metadata: Metadata = { title: "List" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListDetail listId={decodeURIComponent(id)}/>;
}
