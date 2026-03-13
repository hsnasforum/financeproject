import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { ReportHeroCard } from "@/components/ui/ReportTone";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";

export type HomePortalRunSummary = {
  id: string;
  profileId: string;
  title: string;
  createdAt: string;
  horizonMonths: number;
  policyId: string;
  snapshotId?: string;
  overallStatus?: "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
};

export type HomePortalFeaturedAction = {
  badge: string;
  title: string;
  summary: string;
  href: string;
  basis?: string;
  quickRuleDetail?: string;
  quickRuleLabel?: string;
};

function statusLabel(status: HomePortalRunSummary["overallStatus"]): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value.slice(0, 10);
  return new Date(parsed).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function HomePortalClient({
  recentRuns,
  featuredAction,
}: {
  recentRuns: HomePortalRunSummary[];
  featuredAction?: HomePortalFeaturedAction | null;
}) {
  const recent = recentRuns;
  const latestRun = recent[0] ?? null;

  return (
    <section className="py-14">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <ReportHeroCard
            kicker={latestRun ? "Next Actions" : "Quick Start"}
            title={latestRun ? "최근 플랜에서 바로 이어서 진행합니다" : "첫 플랜을 시작할 준비가 된 홈 화면"}
            description={latestRun
              ? `${latestRun.title} 기준으로 리포트, 재실행, 혜택 탐색까지 같은 흐름으로 이어갈 수 있습니다.`
              : "처음이라면 플래닝, 상품 카탈로그, 혜택 탐색 중 가장 익숙한 경로부터 시작하면 됩니다."}
          >
            {latestRun && featuredAction ? (
              <Link
                className="block rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:bg-white/15"
                href={featuredAction.href}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">TODAY</p>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">
                    {featuredAction.badge}
                  </span>
                  {featuredAction.quickRuleLabel ? (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                      quick rules · {featuredAction.quickRuleLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">{featuredAction.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{featuredAction.summary}</p>
                {featuredAction.basis ? (
                  <p className="mt-2 text-xs text-white/55">기준: {featuredAction.basis}</p>
                ) : null}
                {featuredAction.quickRuleDetail ? (
                  <p className="mt-2 text-xs text-white/60">상태 읽기: {featuredAction.quickRuleDetail}</p>
                ) : null}
                <p className="mt-6 text-sm font-bold text-emerald-300">액션부터 보기</p>
              </Link>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-3">
            {latestRun ? (
              <>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(latestRun.id)}`, latestRun.profileId)}
                  prefetch={devPlanningPrefetch("/planning/reports")}
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">NEXT 1</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">최신 리포트 다시 보기</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    {latestRun.title} · {formatDateLabel(latestRun.createdAt)}
                  </p>
                  <p className="mt-6 text-sm font-bold text-emerald-300">리포트 열기</p>
                </Link>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href={appendProfileIdQuery("/planning", latestRun.profileId)}
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">NEXT 2</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">같은 프로필로 다시 계산</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    저장된 조건을 이어 받아 수정 후 다시 실행합니다.
                  </p>
                  <p className="mt-6 text-sm font-bold text-emerald-300">플래닝 이어가기</p>
                </Link>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href="/benefits"
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">NEXT 3</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">혜택 후보까지 이어보기</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    플랜을 본 뒤 바로 생활 혜택과 지원 후보를 비교합니다.
                  </p>
                  <p className="mt-6 text-sm font-bold text-amber-300">혜택 탐색</p>
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href="/planning"
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">START 1</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">첫 플랜 만들기</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    월수입, 지출, 자산만 입력해도 첫 결과를 볼 수 있습니다.
                  </p>
                  <p className="mt-6 text-sm font-bold text-emerald-300">플래닝 시작</p>
                </Link>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href="/products/catalog"
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">START 2</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">상품 흐름 먼저 익히기</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    예적금, 대출, 연금 카테고리를 먼저 훑고 비교 기준을 잡습니다.
                  </p>
                  <p className="mt-6 text-sm font-bold text-emerald-300">카탈로그 보기</p>
                </Link>
                <Link
                  className="rounded-2xl border border-white/10 bg-white/10 p-5 transition-all hover:-translate-y-1 hover:bg-white/15"
                  href="/benefits"
                >
                  <p className="text-[11px] font-black tracking-[0.16em] text-white/55">START 3</p>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-white">혜택 후보 먼저 보기</p>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    플랜 전에도 주거, 청년, 생활안정 관련 혜택을 바로 탐색할 수 있습니다.
                  </p>
                  <p className="mt-6 text-sm font-bold text-amber-300">혜택 보기</p>
                </Link>
              </>
            )}
            </div>
          </ReportHeroCard>

          <Card className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-400">최근 저장한 실행 기록</p>
              <h2 className="mt-3 text-[2rem] font-black tracking-[-0.04em] text-slate-950">최근 플래닝 실행</h2>
              {latestRun ? (
                <p className="mt-2 text-sm text-slate-500">
                  가장 최근 저장: {latestRun.title} · {formatDateLabel(latestRun.createdAt)} · {statusLabel(latestRun.overallStatus)}
                </p>
              ) : null}
            </div>
            <Link
              className="text-sm font-bold text-[#4f8ef7]"
              href="/planning"
              prefetch={devPlanningPrefetch("/planning")}
            >
              플래닝으로 이동
            </Link>
            </div>

            {recent.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-[#f7f8fb] px-6 py-12 text-center">
              <p className="text-lg font-black text-slate-950">아직 저장된 실행 기록이 없습니다.</p>
              <p className="mt-2 text-sm text-slate-500">첫 플래닝 실행을 저장하면 이 영역에서 바로 리포트를 이어서 볼 수 있습니다.</p>
              <Link
                className="mt-6 inline-flex h-12 items-center rounded-xl bg-[#4f8ef7] px-6 text-sm font-extrabold text-white"
                href="/planning"
                prefetch={devPlanningPrefetch("/planning")}
              >
                첫 플래닝 시작
              </Link>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
              {recent.map((run) => (
                <div className="rounded-[28px] border border-slate-200 bg-[#f9fbff] p-6" key={run.id}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{run.createdAt.slice(0, 10)}</p>
                  <p className="mt-4 text-lg font-black tracking-[-0.03em] text-slate-950">{run.title}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {statusLabel(run.overallStatus)} · {run.horizonMonths}개월 · {run.policyId} 정책
                    {run.snapshotId ? ` · snapshot ${run.snapshotId}` : ""}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      className="inline-flex text-sm font-bold text-[#4f8ef7]"
                      href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}`, run.profileId)}
                      prefetch={devPlanningPrefetch("/planning/reports")}
                    >
                      리포트 보기
                    </Link>
                    <Link
                      className="inline-flex text-sm font-bold text-slate-700"
                      href={appendProfileIdQuery("/planning", run.profileId)}
                      prefetch={devPlanningPrefetch("/planning")}
                    >
                      다시 실행
                    </Link>
                  </div>
                </div>
              ))}
              </div>
            )}
          </Card>
        </div>
      </Container>
    </section>
  );
}
