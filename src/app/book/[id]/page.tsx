import { notFound } from "next/navigation"; import { mediaById } from "@/data/media"; import { DetailPage } from "@/components/detail/detail-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const media=mediaById(id);if(!media||media.mediaType!=="book")notFound();return <DetailPage media={media}/>}
