import Link from "next/link";
import PlanningReportsDashboardBoundary from "@/components/PlanningReportsDashboardBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { PUBLIC_PAGE_METADATA } from "@/lib/navigation/publicMetadata";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { loadCurrentUserReportRunScope } from "@/lib/planning/reports/reportRunScopeLoader";

export const metadata = PUBLIC_PAGE_METADATA["/planning/reports"];
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
          description="저장한 재무 진단을 다시 확인하는 곳입니다."
          action={<Link className="font-semibold text-navy" href={planningHref}>재무 진단 시작</Link>}
        />
        <EmptyState
          title="아직 저장된 상담 기록이 없습니다"
          description="아직 보관된 결과가 없습니다. 재무 진단에서 첫 결과를 저장해 주세요."
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
