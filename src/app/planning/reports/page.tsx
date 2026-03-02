import Link from "next/link";
import PlanningReportsDashboardClient from "@/components/PlanningReportsDashboardClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";
import { listRuns } from "@/lib/planning/server/store/runStore";

type PlanningReportsPageProps = {
  searchParams?:
    | {
        runId?: string | string[];
        profileId?: string | string[];
      }
    | Promise<{
        runId?: string | string[];
        profileId?: string | string[];
      }>;
};

function asString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

export default async function PlanningReportsPage(props: PlanningReportsPageProps) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const requestedProfileId = normalizeProfileId(searchParams?.profileId);
  const defaultProfileId = await getDefaultProfileId();
  const effectiveProfileId = requestedProfileId || defaultProfileId || "";
  const runs = await listRuns({
    ...(effectiveProfileId ? { profileId: effectiveProfileId } : {}),
    limit: 50,
  });
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

  const requestedRunId = asString(searchParams?.runId);
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
