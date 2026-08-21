import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

type LandingReportMetric = {
  label: string;
  value: string;
  note: string;
};

type LandingReportPreviewContent = {
  headline: string;
  description: string;
  metrics: LandingReportMetric[];
  actionTitle: string;
  actionSummary: string;
};

export function LandingReportPreview({
  preview,
  trustNotes,
}: {
  preview: LandingReportPreviewContent;
  trustNotes: string[];
}) {
  return (
    <section className="bg-[#f5f7fa] py-16">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 xl:grid-cols-[1fr_0.78fr]">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[var(--shadow-card)] md:p-10">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">미리보기</p>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-navy md:text-4xl">{preview.headline}</h2>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-muted">{preview.description}</p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {preview.metrics.map((metric) => (
                <div className="rounded-[1.5rem] border border-slate-100 bg-surface-muted/50 p-6" key={metric.label}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted">{metric.label}</p>
                  <p className="mt-4 text-3xl font-black tracking-tight text-navy tabular-nums">{metric.value}</p>
                  <p className="mt-3 text-xs font-medium leading-relaxed text-muted">{metric.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-primary/10 bg-primary/5 p-6">
              <p className="text-sm font-black text-navy">{preview.actionTitle}</p>
              <p className="mt-2 text-sm font-medium leading-relaxed text-muted">{preview.actionSummary}</p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-12 items-center rounded-2xl bg-primary px-8 text-sm font-black text-white shadow-[0_16px_32px_-12px_rgba(30,58,138,0.5)] transition-all hover:bg-primary-hover active:scale-95"
                href="/planning"
                prefetch={devPlanningPrefetch("/planning")}
              >
                재무 진단 시작
              </Link>
              <Link
                className="inline-flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-8 text-sm font-black text-navy transition-all hover:border-primary/30 hover:bg-[#f5f7fa] active:scale-95"
                href="/planning/reports"
                prefetch={devPlanningPrefetch("/planning/reports")}
              >
                리포트 화면 보기
              </Link>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[var(--shadow-card)] md:p-10">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">데이터 안내</p>
            <h3 className="mt-5 text-2xl font-black tracking-tight text-navy">출처와 기준 시점을 같이 봅니다</h3>
            <ul className="mt-6 space-y-4 text-sm font-medium leading-relaxed text-muted">
              {trustNotes.map((note) => (
                <li className="flex gap-3" key={note}>
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
            <Link
              className="mt-8 inline-flex text-sm font-black text-primary hover:underline"
              href="/settings/data-sources"
              prefetch={devPlanningPrefetch("/settings/data-sources")}
            >
              데이터 신뢰 기준 보기 →
            </Link>
          </aside>
        </div>
      </Container>
    </section>
  );
}
