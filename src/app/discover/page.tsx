import { DiscoverPage } from "@/components/explore/discover-page";
import { Suspense } from "react";
import { discoverCatalog } from "@/lib/media/catalog";
export const metadata={title:"Discover"};
export default async function Page(){const discovery = await discoverCatalog(); return <Suspense><DiscoverPage initialSections={discovery.sections}/></Suspense>}
