import { Suspense } from "react";
import { ActivityPage } from "@/components/activity/activity-page";

export const metadata = { title: "Activity" };

export default function Page() { return <Suspense><ActivityPage/></Suspense>; }
