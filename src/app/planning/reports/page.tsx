import Link from "next/link";
import PlanningReportsDashboardClient from "@/components/PlanningReportsDashboardClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";
import { listRuns } from "@/lib/planning/server/store/runStore";

export const dynamic = "force-dynamic";

type PlanningReportsPageProps = {
  searchParams?: Promise<{
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
  const defaultProfileId = await getDefaultProfileId();
  let effectiveProfileId = requestedProfileId || defaultProfileId || "";
  let runs = await listRuns({
    ...(requestedProfileId ? { profileId: requestedProfileId } : {}),
    limit: 50,
  });
  if (requestedRunId && !runs.some((run) => run.id === requestedRunId)) {
    const unscopedRuns = await listRuns({ limit: 50 });
    const requestedRun = unscopedRuns.find((run) => run.id === requestedRunId);
    if (requestedRun) {
      effectiveProfileId = requestedRun.profileId;
      runs = unscopedRuns.filter((run) => run.profileId === effectiveProfileId);
    }
  }

  if (runs.length < 1) {
    const planningHref = appendProfileIdQuery("/planning", effectiveProfileId);
    return (
      <PageShell>
        <PageHeader
          title="재무설계 리포트"
          description="저장된 실행 기록(run)이 없어서 표시할 리포트가 없습니다."
          action={<Link className="font-semibold text-emerald-700" href={planningHref}>플래닝으로 이동</Link>}
        />
        <EmptyState
          title="저장된 실행 기록이 없습니다"
          description="먼저 /planning에서 실행 후 저장한 다음 리포트를 확인하세요."
          icon="data"
        />
      </PageShell>
    );
  }

  const initialRunId = runs.some((run) => run.id === requestedRunId)
    ? requestedRunId
    : runs[0].id;

  return (
    <PlanningReportsDashboardClient
      initialProfileId={effectiveProfileId}
      initialRunId={initialRunId}
    />
  );
}
