import { Suspense } from "react";
import { DartSearchClient } from "@/components/DartSearchClient";

export default function DartPublicPage() {
  return (
    <Suspense fallback={<main className="px-4 py-8 text-sm text-slate-600">DART 화면을 준비하는 중입니다...</main>}>
      <DartSearchClient />
    </Suspense>
  );
}
