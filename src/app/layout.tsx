import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { uiTextKo } from "@/lib/uiText.ko";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: uiTextKo.app.title,
  description: uiTextKo.app.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geist.variable} bg-background text-foreground antialiased`}>
        <SiteHeader />
        <div className="min-h-[calc(100vh-70px)]">{children}</div>
      </body>
    </html>
  );
}
