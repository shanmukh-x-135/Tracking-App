import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { MosaicStateProvider } from "@/components/persistence/mosaic-state-provider";

export const metadata: Metadata = { title: { default: "Mosaic — All your stories", template: "%s · Mosaic" }, description: "One place for the media you love." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning><body><AuthProvider><MosaicStateProvider><AppShell>{children}</AppShell></MosaicStateProvider></AuthProvider></body></html>;
}
