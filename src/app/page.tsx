import Link from "next/link";
import Image from "next/image";
import { HomePortalClient } from "@/components/HomePortalClient";
import { ExchangeSummaryCard } from "@/components/ExchangeSummaryCard";
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
    <main className="py-16 bg-slate-50 min-h-screen">
      <Container>
        <section className="grid gap-8 lg:grid-cols-[1.8fr_1fr]">
          <Card className="relative overflow-hidden border border-slate-200/60 shadow-xl shadow-slate-200/40 bg-white group hover:translate-y-[-4px] transition-all duration-500 rounded-[2.5rem]">
            {/* Background Pattern */}
            <div 
              className="absolute inset-0 opacity-[0.04] pointer-events-none" 
              style={{ backgroundImage: "url(/patterns/pattern-emerald-dots.png)", backgroundSize: "256px" }}
            />
            <div className="absolute top-0 right-0 -mr-24 -mt-24 h-96 w-96 rounded-full bg-emerald-50/30 blur-3xl transition-transform duration-1000 group-hover:scale-125" />
            
            <div className="relative z-10 p-8 lg:p-14 flex flex-col lg:flex-row items-center gap-10">
              <div className="flex-1">
                <span className="inline-flex rounded-full bg-emerald-50/80 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800 border border-emerald-100 mb-6">
                  Premium AI Financial Pilot
                </span>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.1] text-slate-900 tracking-tight">
                  <span className="block">부의 미래를 설계하는</span>
                  <span className="block text-emerald-700">가장 우아한 방식</span>
                </h1>
                <p className="mt-6 max-w-xl text-base md:text-lg font-medium text-slate-600 leading-relaxed">
                  실시간 거주 지표와 금융 시장 데이터를 결합하여,<br />
                  당신만을 위한 고해상도 재무 지도를 그려냅니다.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row gap-3">
                  <Link href="/planner">
                    <Button variant="primary" size="lg" className="shadow-lg shadow-emerald-200/50">
                      재무설계 시작하기
                    </Button>
                  </Link>
                  <Link href="/products">
                    <Button variant="outline" size="lg" className="bg-white/50 backdrop-blur-sm border-slate-200">
                      금리 상품 탐색
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block w-72 shrink-0 relative p-4">
                <div className="absolute inset-0 bg-emerald-400/5 blur-[60px] rounded-full" />
                <Image
                  src="/visuals/hero-finance.png"
                  alt=""
                  aria-hidden="true"
                  width={288}
                  height={288}
                  className="relative w-full h-auto object-contain drop-shadow-2xl transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-8">
            <ExchangeSummaryCard />
            <Card className="flex-1 p-8 border border-slate-200 shadow-sm bg-white group/status hover:shadow-md transition-all duration-500">
              <div className="flex justify-between items-start mb-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Data Core Integrity
                </p>
                <Image src="/icons/ic-datasource.png" alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5 opacity-20 grayscale" />
              </div>
              <div className="flex items-baseline gap-1.5 mb-4">
                 <span className="text-5xl font-black tabular-nums text-slate-900 tracking-tight">{statusSummary.configured}</span>
                 <span className="text-xl font-bold text-slate-400">/</span>
                 <span className="text-2xl font-bold tabular-nums text-slate-900">{statusSummary.total}</span>
              </div>
              <p className="text-sm font-bold text-slate-700 mb-6">
                {statusSummary.p0Missing > 0 ? "핵심 데이터 연결이 필요합니다" : "모든 데이터 소스가 활성화됨"}
              </p>
              <div className={`p-4 rounded-2xl border ${statusSummary.p0Missing > 0 ? "bg-amber-50/50 border-amber-100" : "bg-emerald-50/50 border-emerald-100"}`}>
                <p className={`text-[11px] font-bold leading-tight flex items-start gap-2 ${statusSummary.p0Missing > 0 ? "text-amber-800" : "text-emerald-800"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full mt-1 shrink-0 ${statusSummary.p0Missing > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-600"}`} />
                  {statusSummary.p0Missing > 0 ? `${statusSummary.p0Missing}개의 핵심 채널이 오프라인 상태입니다.` : "최신 정규화 엔진이 정상 작동 중입니다."}
                </p>
              </div>
              <Link href="/settings/data-sources" className="mt-8 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-all group-hover/status:gap-3">
                <span>Status Dashboard</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            </Card>
          </div>
        </section>

        <div className="mt-20 mb-8 flex items-center justify-between px-4">
           <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Discovery Categories</h2>
           <div className="h-[1px] flex-1 mx-10 bg-slate-200/60" />
        </div>

        <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          <Card className="p-10 group hover:border-emerald-200 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 rounded-[2rem]">
            <div className="h-16 w-16 rounded-[1.5rem] bg-blue-50 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
               <Image src="/icons/ic-planner.png" alt="" aria-hidden="true" width={40} height={40} className="h-10 w-10 object-contain" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">내 재무설계</h3>
            <p className="mt-4 text-base font-medium text-slate-400 leading-relaxed">복잡한 현금 흐름을 한눈에 파악하고,<br />AI가 제안하는 실행 체크리스트를 확인하세요.</p>
            <Link href="/planner" className="mt-10 inline-flex items-center gap-3 text-sm font-black text-emerald-600 hover:gap-5 transition-all">
              Pilot 바로가기
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </Card>

          <Card className="p-10 group hover:border-emerald-200 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 rounded-[2rem]">
            <div className="h-16 w-16 rounded-[1.5rem] bg-amber-50 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500">
               <Image src="/icons/ic-recommend.png" alt="" aria-hidden="true" width={40} height={40} className="h-10 w-10 object-contain" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">지능형 추천</h3>
            <p className="mt-4 text-base font-medium text-slate-400 leading-relaxed">수만 개의 옵션 중 당신의 라이프스타일에<br />가장 부합하는 상품만을 정교하게 골라냅니다.</p>
            <Link href="/recommend" className="mt-10 inline-flex items-center gap-3 text-sm font-black text-emerald-600 hover:gap-5 transition-all">
              Hub 탐색하기
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
          </Card>

          <Card className="p-10 group hover:border-emerald-200 hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-500 rounded-[2rem]">
            <div className="h-16 w-16 rounded-[1.5rem] bg-purple-50 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
               <Image src="/icons/ic-products.png" alt="" aria-hidden="true" width={40} height={40} className="h-10 w-10 object-contain" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">혜택 · 주거 · 청약 · 연금</h3>
            <p className="mt-4 text-base font-medium text-slate-400 leading-relaxed">혜택/청약은 전용 화면으로, 주거/연금 점검은<br />재무설계 흐름에서 한 번에 관리합니다.</p>
            <div className="mt-10 flex flex-wrap gap-6">
              <Link href="/benefits" className="text-sm font-black text-emerald-600 hover:underline underline-offset-8">혜택</Link>
              <Link href="/housing/subscription" className="text-sm font-black text-emerald-600 hover:underline underline-offset-8">청약</Link>
              <Link href="/planner" className="text-sm font-black text-emerald-600 hover:underline underline-offset-8">주거(플래너)</Link>
              <Link href="/planner" className="text-sm font-black text-emerald-600 hover:underline underline-offset-8">연금(플래너)</Link>
            </div>
          </Card>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">금융상품 빠른 이동</h3>
              <p className="mt-1 text-sm text-slate-500">예금처럼 다른 상품군도 바로 열어볼 수 있습니다.</p>
            </div>
            <Link href="/products" className="text-sm font-bold text-emerald-700 hover:text-emerald-800">
              전체 상품 보기
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/products/deposit" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50">
              예금
            </Link>
            <Link href="/products/saving" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50">
              적금
            </Link>
            <Link href="/products/mortgage-loan" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50">
              주담대
            </Link>
            <Link href="/products/rent-house-loan" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50">
              전세대출
            </Link>
            <Link href="/products/credit-loan" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:bg-emerald-50">
              신용대출
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <HomePortalClient />
        </section>
      </Container>
    </main>
  );
}
