import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

interface StatusProps {
  configured: number;
  total: number;
  p0Missing: number;
}

export function HomeStatusStrip({ status }: { status: StatusProps }) {
  const needsAttention = status.p0Missing > 0;
  const readiness = needsAttention ? "추가 확인 필요" : "바로 비교 가능";
  const readinessTone = needsAttention ? "text-warning" : "text-success";

  return (
    <section className="py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] bg-white p-10 shadow-[var(--shadow-card)] border border-slate-100">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ShieldCheck size={20} strokeWidth={2} className="text-primary" />
              </span>
              <p className="text-sm font-black uppercase tracking-widest text-primary">데이터 신뢰 준비 상태</p>
            </div>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-navy">지금 바로 비교할 준비가 됐는지 확인합니다.</h3>
            <div className="mt-4 flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", needsAttention ? "bg-warning animate-pulse" : "bg-success")} />
              <p className={`text-sm font-black uppercase tracking-widest ${readinessTone}`}>{readiness}</p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <StatusBox label="연결됨" value={status.configured} />
              <StatusBox label="전체" value={status.total} />
              <StatusBox label="추가 확인" value={status.p0Missing} warning={needsAttention} />
            </div>

            <div className="mt-10 pt-8 border-t border-slate-100 flex justify-end">
              <Link className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-black text-white shadow-[0_14px_28px_-10px_rgba(30,58,138,0.5)] transition-all hover:bg-primary-hover active:scale-95" href="/settings/data-sources">
                데이터 신뢰 기준 보기
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-10 shadow-[var(--shadow-card)] border border-slate-100">
            <p className="text-sm font-black uppercase tracking-widest text-primary">핵심 이용 흐름</p>
            <h3 className="mt-6 text-3xl font-black tracking-tight text-navy">플랜부터 혜택까지 한 흐름으로</h3>
            <ul className="mt-8 space-y-4 text-sm font-medium leading-relaxed text-muted">
              <li className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary font-numeric">01</span>
                <span>플래닝 저장 후 공식 리포트로 바로 연결</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary font-numeric">02</span>
                <span>리포트에서 추천 상품과 혜택 후보를 이어서 확인</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-black text-[#0f766e] font-numeric">03</span>
                <span>실행 기록에서 저장된 실행 흐름을 다시 점검</span>
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
    <div className="rounded-[1.25rem] bg-[#f5f7fa] p-6 border border-slate-100">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted">{props.label}</p>
      <p className={`mt-4 text-4xl font-black tracking-tight font-numeric tabular-nums ${props.warning ? "text-danger" : "text-navy"}`}>
        {props.value}
      </p>
    </div>
  );
}
