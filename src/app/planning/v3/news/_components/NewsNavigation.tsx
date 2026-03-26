"use client";

import { usePathname, useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const NAV_OPTIONS = [
  { id: "/planning/v3/news", label: "오늘 브리핑" },
  { id: "/planning/v3/news/alerts", label: "중요 알림" },
  { id: "/planning/v3/news/trends", label: "흐름 보기" },
  { id: "/planning/v3/news/explore", label: "뉴스 탐색" },
  { id: "/planning/v3/news/settings", label: "설정" },
];

export function NewsNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab = NAV_OPTIONS.find((opt) => opt.id === pathname)?.id || NAV_OPTIONS[0].id;

  return (
    <div className="mb-6 flex justify-start">
      <SegmentedTabs
        options={NAV_OPTIONS}
        activeTab={activeTab}
        onChange={(id) => router.push(id)}
        tone="light"
        className="border border-slate-200 bg-slate-100/90 shadow-sm"
      />
    </div>
  );
}
