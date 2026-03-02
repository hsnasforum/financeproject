import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { uiTextKo } from "@/lib/uiText.ko";
import "./globals.css";

export const metadata: Metadata = {
  title: uiTextKo.app.title,
  description: uiTextKo.app.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-background text-foreground antialiased scroll-smooth">
        <SiteHeader />
        <main className="min-h-[calc(100vh-64px)] pb-20 md:pb-0">{children}</main>
        <MobileBottomNav />
      </body>
    </html>
  );
}
