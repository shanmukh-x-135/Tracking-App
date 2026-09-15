import { Suspense } from "react";
import { CollectionPage } from "@/components/explore/collection-page";
export const metadata={title:"Library"};
export default function Page(){return <Suspense><CollectionPage mode="library"/></Suspense>}
