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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-64px)]">{children}</main>
        <MobileBottomNav />
      </body>
    </html>
  );
}
