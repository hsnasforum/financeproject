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
                className="block rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                href={featuredAction.href}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">TODAY</p>
                  <span className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm shadow-emerald-100">
                    {featuredAction.badge}
                  </span>
                  {featuredAction.quickRuleLabel ? (
                    <span className="rounded-lg border border-emerald-100 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                      quick rules · {featuredAction.quickRuleLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-xl font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">{featuredAction.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{featuredAction.summary}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold">
                  {featuredAction.basis ? (
                    <p className="text-slate-400">기준: {featuredAction.basis}</p>
                  ) : null}
                  {featuredAction.quickRuleDetail ? (
                    <p className="text-emerald-600/70 italic">상태 읽기: {featuredAction.quickRuleDetail}</p>
                  ) : null}
                </div>
                <p className="mt-6 text-sm font-black text-emerald-600">액션 리포트 보기 →</p>
              </Link>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-3">
              {latestRun ? (
                <>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(latestRun.id)}`, latestRun.profileId)}
                  prefetch={devPlanningPrefetch("/planning/reports")}
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">NEXT 1</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">최신 리포트 다시 보기</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {latestRun.title} · {formatDateLabel(latestRun.createdAt)}
                  </p>
                  <p className="mt-6 text-sm font-black text-emerald-600">리포트 열기 →</p>
                </Link>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href={appendProfileIdQuery("/planning", latestRun.profileId)}
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">NEXT 2</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">같은 프로필로 다시 계산</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    저장된 조건을 이어 받아 수정 후 다시 실행합니다.
                  </p>
                  <p className="mt-6 text-sm font-black text-emerald-600">플래닝 이어가기 →</p>
                </Link>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href="/benefits"
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">NEXT 3</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors">혜택 후보까지 이어보기</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    플랜을 본 뒤 바로 생활 혜택과 지원 후보를 비교합니다.
                  </p>
                  <p className="mt-6 text-sm font-black text-amber-500">혜택 탐색 →</p>
                </Link>
                </>
              ) : (
                <>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href="/planning"
                  prefetch={devPlanningPrefetch("/planning")}
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">START 1</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">첫 플랜 만들기</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    월수입, 지출, 자산만 입력해도 첫 결과를 볼 수 있습니다.
                  </p>
                  <p className="mt-6 text-sm font-black text-emerald-600">플래닝 시작 →</p>
                </Link>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href="/products/catalog"
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">START 2</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">상품 흐름 먼저 익히기</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    예적금, 대출, 연금 카테고리를 먼저 훑고 비교 기준을 잡습니다.
                  </p>
                  <p className="mt-6 text-sm font-black text-emerald-600">카탈로그 보기 →</p>
                </Link>
                <Link
                  className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md hover:border-emerald-100 group"
                  href="/benefits"
                >
                  <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">START 3</p>
                  <p className="mt-4 text-lg font-black tracking-tight text-slate-900 group-hover:text-amber-600 transition-colors">혜택 후보 먼저 보기</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    플랜 전에도 주거, 청년, 생활안정 관련 혜택을 바로 탐색할 수 있습니다.
                  </p>
                  <p className="mt-6 text-sm font-black text-amber-500">혜택 보기 →</p>
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
              className="text-sm font-black text-emerald-600 hover:underline"
              href="/planning"
              prefetch={devPlanningPrefetch("/planning")}
            >
              플래닝 전체 보기
            </Link>
            </div>

            {recent.length === 0 ? (
              <div className="rounded-[2.5rem] border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
              <p className="text-lg font-black text-slate-900">아직 저장된 실행 기록이 없습니다.</p>
              <p className="mt-2 text-sm font-medium text-slate-500 leading-relaxed">첫 플래닝 실행을 저장하면 이 영역에서 바로 리포트를 이어서 볼 수 있습니다.</p>
              <Link
                className="mt-10 inline-flex h-12 items-center rounded-2xl bg-slate-900 px-10 text-sm font-black text-white shadow-xl shadow-slate-200 transition-all hover:bg-slate-800 active:scale-95"
                href="/planning"
                prefetch={devPlanningPrefetch("/planning")}
              >
                첫 플래닝 시작하기
              </Link>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
              {recent.map((run) => (
                <div className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-8 transition-all hover:border-emerald-100 hover:bg-white" key={run.id}>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{run.createdAt.slice(0, 10)}</p>
                  <p className="mt-5 text-xl font-black tracking-tight text-slate-900">{run.title}</p>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {statusLabel(run.overallStatus)} · {run.horizonMonths}개월 · {run.policyId} 정책
                  </p>
                  <div className="mt-10 flex flex-wrap items-center gap-6">
                    <Link
                      className="inline-flex text-sm font-black text-emerald-600 hover:underline"
                      href={appendProfileIdQuery(`/planning/reports?runId=${encodeURIComponent(run.id)}`, run.profileId)}
                      prefetch={devPlanningPrefetch("/planning/reports")}
                    >
                      리포트 보기
                    </Link>
                    <Link
                      className="inline-flex text-sm font-black text-slate-400 hover:text-slate-900"
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
