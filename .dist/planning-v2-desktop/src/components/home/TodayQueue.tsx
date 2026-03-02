import { DartDailyBriefCard } from "@/components/DartDailyBriefCard";
import { DartAlertsSummaryCard } from "@/components/DartAlertsSummaryCard";

export function TodayQueue() {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <h2 className="text-xl font-black tracking-tight text-slate-900">오늘의 큐</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">최신 공시와 일일 브리핑을 확인하고 작업을 시작하세요.</p>
      
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <DartDailyBriefCard showQuickActions />
        </div>
        <div className="flex flex-col gap-6">
          <DartAlertsSummaryCard showQuickActions />
        </div>
      </div>
    </section>
  );
}
