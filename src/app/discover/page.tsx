import { Suspense } from "react";
import { CollectionPage } from "@/components/explore/collection-page";
export const metadata={title:"Discover"};
export default function Page(){return <Suspense><CollectionPage mode="discover"/></Suspense>}
