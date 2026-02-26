import Link from "next/link";
import Image from "next/image";
import { HomePortalClient } from "@/components/HomePortalClient";
import { ExchangeSummaryCard } from "@/components/ExchangeSummaryCard";
import { DartAlertsSummaryCard } from "@/components/DartAlertsSummaryCard";
import { DartDailyBriefCard } from "@/components/DartDailyBriefCard";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { getDataSourceStatuses } from "@/lib/dataSources/registry";

function summarizeStatus() {
  const statuses = getDataSourceStatuses();
  const configured = statuses.filter((entry) => entry.status.state === "configured").length;
  const missing = statuses.filter((entry) => entry.status.state === "missing").length;
  const p0Missing = statuses.filter((entry) => entry.priority === "P0" && entry.status.state !== "configured").length;
  return { configured, missing, p0Missing, total: statuses.length };
}

export default async function Home() {
  const statusSummary = summarizeStatus();

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] overflow-hidden pb-20">
      {/* Background Decorators for gorgeous/flashy feel */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-300/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[30%] h-[40%] rounded-full bg-blue-300/10 blur-[120px] pointer-events-none" />

      <Container className="relative z-10 pt-12 md:pt-20">
        <section className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
          {/* Main Hero Card */}
          <Card className="relative overflow-hidden border border-white/60 bg-white/70 backdrop-blur-xl shadow-2xl shadow-slate-200/50 group hover:-translate-y-1 transition-all duration-500 rounded-[2.5rem] p-10 md:p-14">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/0 pointer-events-none" />
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-400/20 blur-[80px] rounded-full group-hover:bg-emerald-400/30 transition-colors duration-700 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50/80 px-4 py-2 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/50 mb-6 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  PREMIUM AI FINANCIAL PILOT
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                  완벽한 부의 미래를 <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                    가장 우아하게 설계하다
                  </span>
                </h1>
                
                <p className="mt-6 max-w-lg text-lg text-slate-500 font-medium leading-relaxed">
                  초개인화된 금융 데이터와 AI 알고리즘을 결합하여, 
                  당신만의 견고하고 아름다운 자산 포트폴리오를 구축합니다.
                </p>
                
                <div className="mt-10 flex flex-wrap gap-4">
                  <Link href="/dashboard">
                    <Button variant="primary" size="lg" className="rounded-full shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all text-base px-8 h-14">
                      대시보드 열기
                    </Button>
                  </Link>
                  <Link href="/planner">
                    <Button variant="outline" size="lg" className="rounded-full bg-white/80 backdrop-blur border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-base px-8 h-14 hover:scale-[1.02] active:scale-95 transition-all">
                      재무설계 시작
                    </Button>
                  </Link>
                </div>
              </div>
              
              <div className="hidden lg:flex w-72 shrink-0 relative justify-center items-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-100 to-transparent blur-3xl rounded-full opacity-50" />
                <Image
                  src="/visuals/hero-finance.png"
                  alt="Finance Hero Illustration"
                  width={300}
                  height={300}
                  className="relative z-10 w-full object-contain drop-shadow-[0_20px_40px_rgba(5,150,105,0.15)] group-hover:scale-105 group-hover:-rotate-2 transition-transform duration-700 ease-out"
                />
              </div>
            </div>
          </Card>

          {/* Right Side Cards */}
          <div className="flex flex-col gap-6">
            <ExchangeSummaryCard />
            <DartAlertsSummaryCard showQuickActions />
            <DartDailyBriefCard showQuickActions />
            
            <Card className="p-8 border-slate-100 bg-white shadow-lg shadow-slate-200/30 rounded-[2rem] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">데이터 연동 상태</h3>
                  <p className="text-xs text-slate-400 mt-1">Core Integrity</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                  <Image src="/icons/ic-datasource.png" alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5 opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              
              <div className="flex items-end gap-2 mb-4">
                 <span className="text-4xl font-black tabular-nums text-slate-900 tracking-tight leading-none">{statusSummary.configured}</span>
                 <span className="text-lg font-bold text-slate-300 leading-none mb-1">/</span>
                 <span className="text-xl font-bold tabular-nums text-slate-500 leading-none mb-1">{statusSummary.total}</span>
              </div>
              
              <div className={`mt-6 p-4 rounded-2xl border transition-colors ${statusSummary.p0Missing > 0 ? "bg-amber-50/50 border-amber-100" : "bg-emerald-50/50 border-emerald-100"}`}>
                <p className={`text-xs font-bold leading-relaxed flex items-center gap-2 ${statusSummary.p0Missing > 0 ? "text-amber-800" : "text-emerald-800"}`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${statusSummary.p0Missing > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"}`} />
                  {statusSummary.p0Missing > 0 ? `${statusSummary.p0Missing}개의 필수 채널 점검 요망` : "모든 시스템이 최적의 상태로 가동중입니다."}
                </p>
              </div>
              
              <Link href="/settings/data-sources" className="mt-6 flex items-center justify-between group/link">
                <span className="text-xs font-bold text-slate-500 group-hover/link:text-emerald-600 transition-colors">통합 대시보드 열기</span>
                <div className="h-6 w-6 rounded-full bg-slate-50 flex items-center justify-center group-hover/link:bg-emerald-100 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover/link:text-emerald-600"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </div>
              </Link>
            </Card>
          </div>
        </section>

        <section className="mt-16 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">핵심 바로가기</h2>
              <p className="mt-1 text-sm text-slate-500">v1.0 RC 기준 핵심 진입 링크만 제공합니다.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/dashboard" className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-50 px-4 text-xs font-bold text-emerald-700 hover:bg-emerald-100">/dashboard</Link>
            <Link href="/planner" className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200">/planner</Link>
            <Link href="/recommend" className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200">/recommend</Link>
            <Link href="/public/dart" className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200">/public/dart</Link>
            <Link href="/settings/data-sources" className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200">/settings/data-sources</Link>
          </div>
        </section>

        <section className="mt-20">
          <HomePortalClient />
        </section>
      </Container>
    </main>
  );
}
