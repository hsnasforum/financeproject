import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { uiTextKo } from "@/lib/uiText.ko";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  title: uiTextKo.app.title,
  description: uiTextKo.app.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();

  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-background text-foreground antialiased scroll-smooth">
        <SiteHeader />
        <main className="min-h-[calc(100vh-64px)]">{children}</main>
        <MobileBottomNav />
      </body>
    </html>
  );
}
