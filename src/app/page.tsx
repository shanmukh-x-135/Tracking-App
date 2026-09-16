import { HomePage } from "@/components/home/home-page";
import { discoverCatalog } from "@/lib/media/catalog";

export const revalidate = 3600;

export default async function Page() {
  const discovery = await discoverCatalog();
  return <HomePage initialDiscovery={discovery.items}/>;
}
