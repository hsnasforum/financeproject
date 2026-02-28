import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ExchangeSummaryCard } from "@/components/ExchangeSummaryCard";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden rounded-[2.5rem] bg-hero-navy px-8 py-12 text-white shadow-2xl lg:py-20">
      {/* Background Image/Pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-40 mix-blend-overlay"
        style={{ 
          backgroundImage: "url('/nb/hero-bg.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-hero-navy/80 via-transparent to-hero-charcoal/80" />

      <div className="relative z-10 grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
              Premium Financial Intelligence
            </span>
          </div>
          
          <h1 className="mt-6 text-4xl font-black leading-[1.1] tracking-tight md:text-6xl">
            신뢰할 수 있는 데이터로 <br />
            <span className="text-emerald-400">명확한 금융 의사결정</span>
          </h1>
          
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            복잡한 금융 정보를 한눈에 파악하고 실질적인 액션을 취하세요. 
            개인화된 재무설계와 근거 기반의 상품 추천을 제공합니다.
          </p>
          
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/dashboard">
              <Button size="lg" variant="primary" className="h-14 rounded-full px-10 text-base shadow-lg shadow-emerald-900/20">
                대시보드 시작하기
              </Button>
            </Link>
            <Link href="/planner">
              <Button size="lg" variant="outline" className="h-14 border-white/20 bg-white/5 rounded-full px-10 text-base text-white backdrop-blur-sm hover:bg-white/10">
                재무설계 계획
              </Button>
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap gap-8 border-t border-white/10 pt-8">
            <TrustBadge icon="🔒" label="로컬 우선 저장" description="데이터는 기기에만 보관" />
            <TrustBadge icon="🛡️" label="최소 수집" description="불필요한 정보 요구 없음" />
            <TrustBadge icon="📊" label="근거 기반" description="객관적 데이터 분석" />
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-emerald-500/10 blur-3xl" />
          <div className="relative rounded-3xl border border-white/10 bg-white/5 p-1 backdrop-blur-xl shadow-2xl">
            <ExchangeSummaryCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustBadge({ icon, label, description }: { icon: string; label: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-lg">
        {icon}
      </span>
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        <p className="text-[11px] text-slate-400">{description}</p>
      </div>
    </div>
  );
}
