import { Suspense } from "react";
import { AskPage } from "@/components/assistant/ask-page";

export const metadata = { title: "Ask Mosaic" };

// The question and optional title context come from the URL (?q=, ?about=).
export default function Page() { return <Suspense><AskPage/></Suspense>; }
