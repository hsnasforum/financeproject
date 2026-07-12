import Link from "next/link";
import PlanningReportsDashboardBoundary from "@/components/PlanningReportsDashboardBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { loadCurrentUserReportRunScope } from "@/lib/planning/reports/reportRunScopeLoader";

export const dynamic = "force-dynamic";

type PlanningReportsPageProps = {
  searchParams?: Promise<{
    baseRunId?: string | string[];
    runId?: string | string[];
    profileId?: string | string[];
  }>;
};

function asString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

export default async function PlanningReportsPage(props: PlanningReportsPageProps) {
  const searchParams = await props.searchParams;
  const requestedProfileId = normalizeProfileId(searchParams?.profileId);
  const requestedRunId = asString(searchParams?.runId);
  const requestedBaseRunId = asString(searchParams?.baseRunId);
  const {
    effectiveProfileId,
    runs,
    initialRunId,
    initialLoadNotice,
    initialScopeReady,
  } = await loadCurrentUserReportRunScope({
    requestedProfileId,
    requestedRunId,
    logContext: "planning/reports",
    scopeFailureMessage: "처음 리포트를 준비하는 중 일시적인 문제가 있어 상담 기록을 다시 불러오는 중입니다.",
  });

  if (initialScopeReady && runs.length < 1) {
    const planningHref = appendProfileIdQuery("/planning", effectiveProfileId);
    return (
      <PageShell>
        <PageHeader
          title="재무설계 리포트"
          description="저장된 상담 결과를 다시 읽는 도착 화면이지만, 아직 저장된 상담 기록이 없어 열 수 있는 리포트가 없습니다."
          action={<Link className="font-semibold text-navy" href={planningHref}>플래닝으로 돌아가 실행·기록 저장하기</Link>}
        />
        <EmptyState
          title="아직 저장된 상담 기록이 없습니다"
          description="먼저 /planning에서 상담 결과를 저장해 두면, 여기서 결과를 다시 보고 상담 기록 화면과 비교할 수 있습니다."
          icon="data"
        />
      </PageShell>
    );
  }

  return (
    <PlanningReportsDashboardBoundary
      initialBaseRunId={requestedBaseRunId}
      initialRuns={initialScopeReady ? runs : undefined}
      initialProfileId={effectiveProfileId}
      initialRunId={initialRunId}
      initialLoadNotice={initialLoadNotice}
    />
  );
}
