import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface StatusProps {
  configured: number;
  total: number;
  p0Missing: number;
}

export function HomeStatusStrip({ status }: { status: StatusProps }) {
  return (
    <section className="mt-12 grid gap-6 lg:grid-cols-2">
      <Card className="flex flex-col justify-between overflow-hidden rounded-[2rem] border-slate-100 bg-white p-8 shadow-card">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900">데이터 소스 준비도</h3>
              <p className="text-sm text-slate-500">현재 연동된 외부 금융 데이터 현황</p>
            </div>
            <Link href="/settings/data-sources">
              <Button variant="ghost" size="sm" className="text-xs text-emerald-700">설정 관리</Button>
            </Link>
          </div>
          
          <div className="mt-8 grid grid-cols-3 gap-4">
            <StatusItem label="설정됨" value={status.configured} />
            <StatusItem label="전체 소스" value={status.total} />
            <StatusItem 
              label="미연동(P0)" 
              value={status.p0Missing} 
              isWarning={status.p0Missing > 0} 
            />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col justify-between overflow-hidden rounded-[2rem] border-slate-100 bg-emerald-900 p-8 text-white shadow-card">
        <div>
          <h3 className="text-lg font-black text-white">최적의 상품 탐색</h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">
            복잡한 조건 없이도 본인에게 맞는 최적의 상품을 <br className="hidden md:block" />
            통합 카탈로그에서 한눈에 비교하고 탐색할 수 있습니다.
          </p>
        </div>
        
        <div className="mt-8 flex gap-3">
          <Link href="/products/catalog" className="flex-1">
            <Button className="w-full rounded-2xl bg-white text-emerald-900 hover:bg-emerald-50">
              통합 카탈로그
            </Button>
          </Link>
          <Link href="/products" className="flex-1">
            <Button variant="outline" className="w-full border-white/20 rounded-2xl text-white hover:bg-white/10">
              카테고리 보기
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  );
}

function StatusItem({ label, value, isWarning }: { label: string; value: number; isWarning?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 text-center transition-colors hover:bg-slate-100">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${isWarning ? "text-amber-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
