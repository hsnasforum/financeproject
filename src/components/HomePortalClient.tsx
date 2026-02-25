"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { listSnapshots } from "@/lib/planner/storage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function HomePortalClient() {
  const recent = useMemo(() => listSnapshots().slice(0, 3), []);

  return (
    <Card className="relative overflow-hidden p-8 border-none shadow-lg shadow-slate-200/50 bg-white">
      {/* Background Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ backgroundImage: "url(/patterns/pattern-emerald-dots.png)", backgroundSize: "128px" }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">최근 재무 스냅샷</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Recently Saved Plans</p>
          </div>
          <Link href="/planner" className="group inline-flex items-center gap-2 text-sm font-bold text-emerald-600">
            재무설계로 이동
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200 backdrop-blur-sm">
             <div className="relative mb-6">
                <div className="absolute inset-0 bg-emerald-100/30 blur-3xl rounded-full" />
                <Image src="/visuals/empty-finance.png" alt="" aria-hidden="true" width={180} height={180} className="relative w-[180px] h-auto object-contain drop-shadow-sm" />
             </div>
             <p className="text-base font-black text-slate-900">아직 저장된 스냅샷이 없습니다.</p>
             <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-tight">저장된 데이터가 없어 추천을 시작할 수 없습니다</p>
             <Link href="/planner" className="mt-8">
                <Button variant="outline" className="rounded-full px-8 h-12 font-black border-slate-200 bg-white shadow-sm hover:border-emerald-200 hover:bg-emerald-50 transition-all">
                  첫 스냅샷 만들기
                </Button>
             </Link>
          </div>
        ) : (
        <div className="grid gap-3">
          {recent.map((snap) => (
            <div key={snap.id} className="group flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 hover:border-emerald-200 hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-4">
                 <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                 </div>
                 <div>
                    <p className="text-sm font-black text-slate-900 leading-none mb-1.5">{snap.input.goalName}</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      {snap.createdAt.slice(0, 10)} · 월 저축 {Math.round(snap.metrics.monthlySaving).toLocaleString()}원
                    </p>
                 </div>
              </div>
              <Link href="/planner" className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-emerald-600 hover:text-white transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </Link>
            </div>
          ))}
        </div>
      )}
      </div>
    </Card>
  );
}
