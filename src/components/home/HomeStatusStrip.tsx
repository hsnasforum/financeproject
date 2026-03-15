import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

interface StatusProps {
  configured: number;
  total: number;
  p0Missing: number;
}

export function HomeStatusStrip({ status }: { status: StatusProps }) {
  const readiness = status.p0Missing > 0 ? "추가 설정 필요" : "바로 비교 가능";
  const readinessTone = status.p0Missing > 0 ? "text-amber-600" : "text-emerald-600";

  return (
    <section className="py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2.5rem] bg-white p-10 shadow-sm border border-slate-100">
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">MMD Ready Status</p>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-slate-900">지금 바로 비교할 준비가 됐는지 확인합니다.</h3>
            <div className="mt-4 flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", status.p0Missing > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500")} />
              <p className={`text-sm font-black uppercase tracking-widest ${readinessTone}`}>{readiness}</p>
            </div>
            
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <StatusBox label="연결됨" value={status.configured} />
              <StatusBox label="전체" value={status.total} />
              <StatusBox label="추가 설정" value={status.p0Missing} warning={status.p0Missing > 0} />
            </div>
            
            <div className="mt-10 pt-8 border-t border-slate-50 flex justify-end">
              <Link className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-6 text-sm font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-95" href="/settings/data-sources">
                연결 설정 및 진단 보기
              </Link>
            </div>
          </div>

          <div className="rounded-[2.5rem] bg-white p-10 shadow-sm border border-slate-100">
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">MMD Core Flow</p>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-slate-900">플랜부터 혜택까지 한 흐름으로</h3>
            <ul className="mt-8 space-y-4 text-sm font-medium leading-relaxed text-slate-500">
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 font-black">01</span>
                <span>플래닝 저장 후 공식 리포트로 바로 연결</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 font-black">02</span>
                <span>리포트에서 추천 상품과 혜택 후보를 이어서 확인</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-emerald-600 font-black">03</span>
                <span>실행 기록에서 저장된 run 흐름을 다시 점검</span>
              </li>
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StatusBox(props: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-[2rem] bg-slate-50 p-6 border border-slate-100/50">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{props.label}</p>
      <p className={`mt-4 text-4xl font-black tracking-tight tabular-nums ${props.warning ? "text-rose-600" : "text-slate-900"}`}>
        {props.value}
      </p>
    </div>
  );
}
