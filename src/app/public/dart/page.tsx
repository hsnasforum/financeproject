import { Suspense } from "react";
import { DartSearchClient } from "@/components/DartSearchClient";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

export default function DartPublicPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageHeader
            title="DART 공시 분석"
            description="화면을 준비하는 중입니다..."
          />
          <div className="h-64 animate-pulse rounded-[2rem] bg-slate-100" />
        </PageShell>
      }
    >
      <DartSearchClient />
    </Suspense>
  );
}
