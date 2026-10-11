import { Suspense } from "react";
import { LibraryPage } from "@/components/explore/library-page";

export const metadata = { title: "Library" };

// The Library reads its view (filters, search, page) from the URL.
export default function Page() { return <Suspense><LibraryPage/></Suspense>; }
