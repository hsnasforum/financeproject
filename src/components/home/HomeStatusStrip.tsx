import Link from "next/link";
import { Container } from "@/components/ui/Container";

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
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] bg-white p-8 shadow-sm">
            <p className="text-sm font-bold text-slate-400">MMD 준비 상태</p>
            <h3 className="mt-3 text-[2rem] font-black tracking-[-0.04em] text-slate-950">지금 바로 비교할 준비가 됐는지 확인합니다.</h3>
            <p className={`mt-4 text-sm font-extrabold ${readinessTone}`}>{readiness}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatusBox label="연결됨" value={status.configured} />
              <StatusBox label="전체" value={status.total} />
              <StatusBox label="추가 설정" value={status.p0Missing} warning={status.p0Missing > 0} />
            </div>
            <Link className="mt-8 inline-flex text-sm font-bold text-[#4f8ef7]" href="/settings/data-sources">
              연결 설정 보기
            </Link>
          </div>

          <div className="rounded-[32px] bg-[#111827] p-8 text-white">
            <p className="text-sm font-bold text-slate-300">MMD 핵심 흐름</p>
            <h3 className="mt-3 text-[2rem] font-black tracking-[-0.04em]">플랜부터 혜택까지 한 흐름으로</h3>
            <ul className="mt-6 space-y-3 text-sm leading-7 text-slate-300">
              <li>플래닝 저장 후 공식 리포트로 바로 연결</li>
              <li>리포트에서 추천 상품과 혜택 후보를 이어서 확인</li>
              <li>실행 기록에서 저장된 run 흐름을 다시 점검</li>
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StatusBox(props: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-[24px] bg-[#f7f8fb] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{props.label}</p>
      <p className={`mt-3 text-4xl font-black tracking-[-0.05em] ${props.warning ? "text-amber-600" : "text-slate-950"}`}>
        {props.value}
      </p>
    </div>
  );
}
