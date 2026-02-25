import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { uiTextKo } from "@/lib/uiText.ko";
import "./globals.css";

export const metadata: Metadata = {
  title: uiTextKo.app.title,
  description: uiTextKo.app.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-background text-foreground antialiased">
        <SiteHeader />
        <div className="min-h-[calc(100vh-70px)]">{children}</div>
      </body>
    </html>
  );
}
