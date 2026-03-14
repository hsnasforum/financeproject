"use client";

import { usePathname, useRouter } from "next/navigation";
import { SegmentedTabs as UiSegmentedTabs } from "@/components/ui/SegmentedTabs";

type Tab = {
  label: string;
  href: string;
};

const TABS: Tab[] = [
  { label: "예금", href: "/products/deposit" },
  { label: "적금", href: "/products/saving" },
  { label: "주담대", href: "/products/mortgage-loan" },
  { label: "전세대출", href: "/products/rent-house-loan" },
  { label: "신용대출", href: "/products/credit-loan" },
];

export function SegmentedTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = TABS.find((tab) => pathname === tab.href)?.href ?? TABS[0].href;

  return (
    <UiSegmentedTabs
      activeTab={activeHref}
      className="w-full"
      layoutId="product-kind-tabs"
      onChange={(href) => router.push(href)}
      options={TABS.map((tab) => ({ id: tab.href, label: tab.label }))}
    />
  );
}
