import {
  DEFAULT_REPORT_RUN_SCOPE_LIMIT,
  resolveFallbackReportRunScope,
  resolveRequestedReportRunContext,
  resolveRequestedReportRunScope,
} from "@/lib/planning/reports/runSelection";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { getCurrentUserDefaultProfileId } from "@/lib/planning/server/profiles/repository";
import {
  getCurrentUserRun,
  listCurrentUserRuns,
  type CurrentUserPlanningRunRecord,
} from "@/lib/planning/server/runs/repository";

export type CurrentUserReportRunScopeLoadResult = {
  effectiveProfileId: string;
  runs: CurrentUserPlanningRunRecord[];
  initialRunId: string;
  initialLoadNotice: string;
  initialScopeReady: boolean;
};

export type CurrentUserReportRunScopeLoadOptions = {
  requestedProfileId?: string;
  requestedRunId?: string;
  logContext: string;
  scopeFailureMessage: string;
};

function normalizeOptionalId(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadCurrentUserReportRunScope(
  options: CurrentUserReportRunScopeLoadOptions,
): Promise<CurrentUserReportRunScopeLoadResult> {
  const requestedProfileId = normalizeOptionalId(options.requestedProfileId);
  const requestedRunId = normalizeOptionalId(options.requestedRunId);

  let effectiveProfileId = requestedProfileId;
  let runs: CurrentUserPlanningRunRecord[] = [];
  let initialRunId = "";
  let initialLoadNotice = "";
  let initialScopeReady = false;

  try {
    return await withCurrentPlanningPageUser(async () => {
      let defaultProfileId = "";
      let requestedRun: Awaited<ReturnType<typeof getCurrentUserRun>> = null;

      try {
        defaultProfileId = await getCurrentUserDefaultProfileId() ?? "";
        if (!effectiveProfileId) {
          effectiveProfileId = defaultProfileId;
        }
      } catch (error) {
        console.error(`[${options.logContext}] failed to resolve default report profile`, error);
        initialLoadNotice = toPlanningPageLoadMessage(error, initialLoadNotice);
      }

      try {
        const requestedRunContext = await resolveRequestedReportRunContext({
          requestedProfileId,
          requestedRunId,
          defaultProfileId,
          getRun: getCurrentUserRun,
        });
        requestedRun = requestedRunContext.requestedRun;
        if (requestedRunContext.effectiveProfileId) {
          effectiveProfileId = requestedRunContext.effectiveProfileId;
        }
      } catch (error) {
        console.error(`[${options.logContext}] failed to resolve requested run context`, error);
        initialLoadNotice = toPlanningPageLoadMessage(error, options.scopeFailureMessage);
      }

      try {
        const resolved = await resolveRequestedReportRunScope({
          requestedProfileId,
          requestedRunId,
          defaultProfileId,
          limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT,
          listRuns: listCurrentUserRuns,
          getRun: getCurrentUserRun,
          requestedRun,
        });
        effectiveProfileId = resolved.effectiveProfileId;
        runs = resolved.runs;
        initialRunId = resolved.initialRunId;
        initialScopeReady = true;
      } catch (error) {
        console.error(`[${options.logContext}] failed to resolve initial report scope`, error);
        initialLoadNotice = toPlanningPageLoadMessage(error, options.scopeFailureMessage);

        try {
          const fallback = await resolveFallbackReportRunScope({
            effectiveProfileId,
            requestedRunId,
            limit: DEFAULT_REPORT_RUN_SCOPE_LIMIT,
            listRuns: listCurrentUserRuns,
            getRun: getCurrentUserRun,
          });
          effectiveProfileId = fallback.effectiveProfileId;
          runs = fallback.runs;
          initialRunId = fallback.initialRunId;
          initialScopeReady = true;
        } catch (fallbackError) {
          console.error(`[${options.logContext}] failed to load fallback report scope`, fallbackError);
        }
      }

      return {
        effectiveProfileId,
        runs,
        initialRunId,
        initialLoadNotice,
        initialScopeReady,
      };
    });
  } catch (error) {
    console.error(`[${options.logContext}] failed to load initial report scope in user scope`, error);
    return {
      effectiveProfileId,
      runs,
      initialRunId,
      initialLoadNotice: toPlanningPageLoadMessage(error, options.scopeFailureMessage),
      initialScopeReady,
    };
  }
}
