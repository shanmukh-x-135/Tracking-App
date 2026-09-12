import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: { default: "Mosaic — All your stories", template: "%s · Mosaic" }, description: "One place for the media you love." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><body><AppShell>{children}</AppShell></body></html>;
}
