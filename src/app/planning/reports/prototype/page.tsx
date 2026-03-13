import Link from "next/link";
import { redirect } from "next/navigation";
import PlanningReportsPrototypeClient from "@/components/PlanningReportsPrototypeClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { appendProfileIdQuery, normalizeProfileId } from "@/lib/planning/profileScope";
import {
  DEFAULT_REPORT_RUN_SCOPE_LIMIT,
  resolveFallbackReportRunScope,
  resolveRequestedReportRunContext,
  resolveRequestedReportRunScope,
} from "@/lib/planning/reports/runSelection";
import { getDefaultProfileId } from "@/lib/planning/server/store/profileStore";
import { getRun, listRuns } from "@/lib/planning/server/store/runStore";

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

  let effectiveProfileId = requestedProfileId;
  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let initialRunId = "";
  let initialLoadNotice = "";
  let initialScopeReady = false;
  let defaultProfileId = "";
  let requestedRun = null as Awaited<ReturnType<typeof getRun>>;

  try {
    defaultProfileId = await getDefaultProfileId() ?? "";
    if (!effectiveProfileId) {
      effectiveProfileId = defaultProfileId;
    }
  } catch (error) {
    console.error("[planning/reports/prototype] failed to resolve default report profile", error);
  }

  try {
    const requestedRunContext = await resolveRequestedReportRunContext({
      requestedProfileId,
      requestedRunId,
      defaultProfileId,
      getRun,
    });
    requestedRun = requestedRunContext.requestedRun;
    if (requestedRunContext.effectiveProfileId) {
      effectiveProfileId = requestedRunContext.effectiveProfileId;
    }
  } catch (error) {
    console.error("[planning/reports/prototype] failed to resolve requested run context", error);
    initialLoadNotice = "처음 상담형 리포트를 준비하는 중 일시적인 문제가 있어 실행 기록을 다시 불러오는 중입니다.";
  }

  try {
    const resolved = await resolveRequestedReportRunScope({
      requestedProfileId,
      requestedRunId,
      defaultProfileId,
      limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT,
      listRuns,
      getRun,
      requestedRun,
    });
    effectiveProfileId = resolved.effectiveProfileId;
    runs = resolved.runs;
    initialRunId = resolved.initialRunId;
    initialScopeReady = true;
  } catch (error) {
    console.error("[planning/reports/prototype] failed to resolve initial report scope", error);
    initialLoadNotice = "처음 상담형 리포트를 준비하는 중 일시적인 문제가 있어 실행 기록을 다시 불러오는 중입니다.";

    try {
      const fallback = await resolveFallbackReportRunScope({
        effectiveProfileId,
        requestedRunId,
        limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT,
        listRuns,
        getRun,
      });
      effectiveProfileId = fallback.effectiveProfileId;
      runs = fallback.runs;
      initialRunId = fallback.initialRunId;
      initialScopeReady = true;
    } catch (fallbackError) {
      console.error("[planning/reports/prototype] failed to load fallback report scope", fallbackError);
    }
  }

  if (initialScopeReady && runs.length < 1) {
    const planningHref = appendProfileIdQuery("/planning", effectiveProfileId);
    return (
      <PageShell>
        <PageHeader
          title="MMD 재무설계 상담 프로토타입"
          description="상담형 미리보기 화면에 표시할 실행 기록(run)이 없습니다."
          action={<Link className="font-semibold text-emerald-700" href={planningHref}>플래닝으로 이동</Link>}
        />
        <EmptyState
          title="저장된 실행 기록이 없습니다"
          description="먼저 /planning에서 실행 후 저장한 다음 preview 모드에서 확인하세요."
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
