import { type PlanningRunRecord } from "@/lib/planning/store/types";

export const DEFAULT_REPORT_RUN_SCOPE_LIMIT = 20;

type ListRunsLike = (options?: {
  profileId?: string;
  limit?: number;
}) => Promise<PlanningRunRecord[]>;

type GetRunLike = (id: string) => Promise<PlanningRunRecord | null>;

export async function resolveRequestedReportRunContext(options: {
  requestedProfileId?: string;
  requestedRunId?: string;
  defaultProfileId?: string;
  getRun: GetRunLike;
}): Promise<{
  effectiveProfileId: string;
  requestedRun: PlanningRunRecord | null;
}> {
  const normalizedRequestedProfileId = typeof options.requestedProfileId === "string"
    ? options.requestedProfileId.trim()
    : "";
  const normalizedRequestedRunId = typeof options.requestedRunId === "string"
    ? options.requestedRunId.trim()
    : "";
  const normalizedDefaultProfileId = typeof options.defaultProfileId === "string"
    ? options.defaultProfileId.trim()
    : "";
  let requestedRun: PlanningRunRecord | null = null;
  if (normalizedRequestedRunId) {
    try {
      requestedRun = await options.getRun(normalizedRequestedRunId);
    } catch {
      requestedRun = null;
    }
  }
  let effectiveProfileId = normalizedRequestedProfileId || normalizedDefaultProfileId;
  if (requestedRun?.profileId) {
    effectiveProfileId = requestedRun.profileId;
  }
  return {
    effectiveProfileId,
    requestedRun,
  };
}

export function mergeRunListWithPreferredRun(
  runs: PlanningRunRecord[],
  preferredRun?: PlanningRunRecord | null,
): PlanningRunRecord[] {
  if (!preferredRun) return runs;
  if (runs.some((run) => run.id === preferredRun.id)) return runs;
  return [preferredRun, ...runs];
}

export function resolveSelectedRunId(
  runs: PlanningRunRecord[],
  preferredRunId?: string,
): string {
  const normalizedPreferredRunId = typeof preferredRunId === "string" ? preferredRunId.trim() : "";
  if (normalizedPreferredRunId && runs.some((run) => run.id === normalizedPreferredRunId)) {
    return normalizedPreferredRunId;
  }
  return runs[0]?.id ?? "";
}

export function buildRequestedReportRunScope(options: {
  runs: PlanningRunRecord[];
  requestedRun?: PlanningRunRecord | null;
  preferredRunId?: string;
  fallbackProfileId?: string;
}): {
  effectiveProfileId: string;
  runs: PlanningRunRecord[];
  initialRunId: string;
} {
  const mergedRuns = mergeRunListWithPreferredRun(options.runs, options.requestedRun);
  const effectiveProfileId = typeof options.requestedRun?.profileId === "string" && options.requestedRun.profileId.trim()
    ? options.requestedRun.profileId.trim()
    : (typeof options.fallbackProfileId === "string" ? options.fallbackProfileId.trim() : "");
  return {
    effectiveProfileId,
    runs: mergedRuns,
    initialRunId: resolveSelectedRunId(mergedRuns, options.preferredRunId),
  };
}

export async function resolveRequestedReportRunScope(options: {
  requestedProfileId?: string;
  requestedRunId?: string;
  defaultProfileId?: string;
  limit?: number;
  listRuns: ListRunsLike;
  getRun: GetRunLike;
  requestedRun?: PlanningRunRecord | null;
}): Promise<{
  effectiveProfileId: string;
  requestedRun: PlanningRunRecord | null;
  runs: PlanningRunRecord[];
  initialRunId: string;
}> {
  const normalizedRequestedRunId = typeof options.requestedRunId === "string"
    ? options.requestedRunId.trim()
    : "";
  const requestedRunContext = options.requestedRun === undefined
    ? await resolveRequestedReportRunContext({
      requestedProfileId: options.requestedProfileId,
      requestedRunId: options.requestedRunId,
      defaultProfileId: options.defaultProfileId,
      getRun: options.getRun,
    })
    : {
      effectiveProfileId: options.requestedRun?.profileId
        || (typeof options.requestedProfileId === "string" ? options.requestedProfileId.trim() : "")
        || (typeof options.defaultProfileId === "string" ? options.defaultProfileId.trim() : ""),
      requestedRun: options.requestedRun,
    };
  const scope = buildRequestedReportRunScope({
    runs: await options.listRuns({
      ...(requestedRunContext.effectiveProfileId ? { profileId: requestedRunContext.effectiveProfileId } : {}),
      limit: options.limit ?? DEFAULT_REPORT_RUN_SCOPE_LIMIT,
    }),
    requestedRun: requestedRunContext.requestedRun,
    preferredRunId: normalizedRequestedRunId,
    fallbackProfileId: requestedRunContext.effectiveProfileId,
  });
  return {
    effectiveProfileId: scope.effectiveProfileId,
    requestedRun: requestedRunContext.requestedRun,
    runs: scope.runs,
    initialRunId: scope.initialRunId,
  };
}


export async function resolveFallbackReportRunScope(options: {
  effectiveProfileId?: string;
  requestedRunId?: string;
  limit?: number;
  listRuns: ListRunsLike;
  getRun: GetRunLike;
}): Promise<{
  effectiveProfileId: string;
  requestedRun: PlanningRunRecord | null;
  runs: PlanningRunRecord[];
  initialRunId: string;
}> {
  const normalizedEffectiveProfileId = typeof options.effectiveProfileId === "string"
    ? options.effectiveProfileId.trim()
    : "";
  const normalizedRequestedRunId = typeof options.requestedRunId === "string"
    ? options.requestedRunId.trim()
    : "";
  const requestedRunContext = await resolveRequestedReportRunContext({
    requestedProfileId: normalizedEffectiveProfileId,
    requestedRunId: normalizedRequestedRunId,
    defaultProfileId: normalizedEffectiveProfileId,
    getRun: options.getRun,
  });
  const runs = mergeRunListWithPreferredRun(
    await options.listRuns({
      ...(requestedRunContext.effectiveProfileId ? { profileId: requestedRunContext.effectiveProfileId } : {}),
      limit: options.limit ?? DEFAULT_REPORT_RUN_SCOPE_LIMIT,
    }),
    requestedRunContext.requestedRun,
  );
  return {
    effectiveProfileId: requestedRunContext.effectiveProfileId,
    requestedRun: requestedRunContext.requestedRun,
    runs,
    initialRunId: resolveSelectedRunId(runs, normalizedRequestedRunId),
  };
}
