import type { ReactNode } from "react";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";

export const metadata = PUBLIC_PAGE_METADATA["/products/compare"];

export default function ProductsCompareLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
