import Link from "next/link";
import { redirect } from "next/navigation";
import PlanningReportsPrototypeClient from "@/components/PlanningReportsPrototypeClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { loadCurrentUserReportRunScope } from "@/lib/planning/reports/reportRunScopeLoader";

export const dynamic = "force-dynamic";

type PlanningReportsPrototypePageProps = {
  searchParams?: Promise<{
    runId?: string | string[];
    profileId?: string | string[];
    preview?: string | string[];
  }>;
};

function asString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

export default async function PlanningReportsPrototypePage(props: PlanningReportsPrototypePageProps) {
  const searchParams = await props.searchParams;
  const requestedProfileId = normalizeProfileId(searchParams?.profileId);
  const requestedRunId = asString(searchParams?.runId);
  const previewEnabled = asString(searchParams?.preview) === "1";

  if (!previewEnabled) {
    const params = new URLSearchParams();
    if (requestedProfileId) params.set("profileId", requestedProfileId);
    if (requestedRunId) params.set("runId", requestedRunId);
    redirect(`/planning/reports${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  const {
    effectiveProfileId,
    runs,
    initialRunId,
    initialLoadNotice,
    initialScopeReady,
  } = await loadCurrentUserReportRunScope({
    requestedProfileId,
    requestedRunId,
    logContext: "planning/reports/prototype",
    scopeFailureMessage: "처음 상담형 리포트를 준비하는 중 일시적인 문제가 있어 상담 기록을 다시 불러오는 중입니다.",
  });

  if (initialScopeReady && runs.length < 1) {
    const planningHref = appendProfileIdQuery("/planning", effectiveProfileId);
    return (
      <PageShell>
        <PageHeader
          title="MMD 재무설계 상담 프로토타입"
          description="상담형 미리보기 화면에 표시할 상담 기록이 없습니다."
          action={<Link className="font-semibold text-navy" href={planningHref}>상담 계산으로 이동</Link>}
        />
        <EmptyState
          title="저장된 상담 기록이 없습니다"
          description="먼저 /planning에서 상담 계산 후 결과를 저장한 다음 preview 모드에서 확인하세요."
          icon="data"
        />
      </PageShell>
    );
  }

  return (
    <PlanningReportsPrototypeClient
      initialRuns={initialScopeReady ? runs : undefined}
      initialProfileId={effectiveProfileId}
      initialRunId={initialRunId}
      initialLoadNotice={initialLoadNotice}
    />
  );
}
