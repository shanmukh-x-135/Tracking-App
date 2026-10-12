import { DiscoverPage } from "@/components/explore/discover-page";
import { Suspense } from "react";
import { discoverCatalog } from "@/lib/media/catalog";
import { fallbackRegion } from "@/lib/media/region";
export const metadata={title:"Discover"};
export default async function Page(){const discovery = await discoverCatalog({ region: fallbackRegion }); return <Suspense><DiscoverPage initialSections={discovery.sections} initialFailures={discovery.failures} initialRegion={fallbackRegion}/></Suspense>}
