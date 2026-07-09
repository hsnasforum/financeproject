import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import { createPlanningPageLoadTelemetry } from "@/lib/planning/server/pages/planningPageLoadTelemetry";
import {
  getCurrentUserDefaultProfileId,
  getCurrentUserProfile,
  listCurrentUserProfilesWithDefault,
  type CurrentUserPlanningProfileRecord,
} from "@/lib/planning/server/profiles/repository";
import { getCurrentUserReport } from "@/lib/planning/server/reports/repository";
import {
  getCurrentUserRun,
  listCurrentUserRuns,
  summarizeCurrentUserRunActionProgressByRunId,
  type CurrentUserPlanningRunActionProgressSummary,
  type CurrentUserPlanningRunRecord,
} from "@/lib/planning/server/runs/repository";
import {
  getPlanningStartupMigrationGateSnapshot,
  getPlanningStartupMigrationTelemetryContext,
} from "@/lib/planning/store/startupMigrationGate";

export type PlanningWorkspaceInitialProfileResult = CurrentUserPlanningProfileRecord | null;

export type PlanningRunsPageInitialData = {
  actionProgressSummaryByRunId: Record<string, CurrentUserPlanningRunActionProgressSummary>;
  filterProfileId: string;
  loadNotice: string;
  profiles: CurrentUserPlanningProfileRecord[];
  profilesReady: boolean;
  runs: CurrentUserPlanningRunRecord[];
  runsReady: boolean;
};

export type PlanningReportDetailInitialReport = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  recommendRunId?: string;
  markdown: string;
};

export type PlanningReportDetailPageInitialData = {
  initialError: string;
  initialReport: PlanningReportDetailInitialReport | null;
  initialRun: CurrentUserPlanningRunRecord | null;
};

export async function loadPlanningWorkspaceInitialProfile(
  initialSelectedProfileId: string,
): Promise<PlanningWorkspaceInitialProfileResult> {
  return withCurrentPlanningPageUser(async () => {
    const requestedProfile = initialSelectedProfileId
      ? await getCurrentUserProfile(initialSelectedProfileId).catch(() => null)
      : null;
    if (requestedProfile) return requestedProfile;

    const defaultProfileId = await getCurrentUserDefaultProfileId().catch(() => "");
    return defaultProfileId
      ? await getCurrentUserProfile(defaultProfileId).catch(() => null)
      : null;
  });
}

export async function loadPlanningRunsPageInitialData(input: {
  initialFilterProfileId: string;
}): Promise<PlanningRunsPageInitialData> {
  const fallbackNotice = "처음 상담 기록을 준비하는 중 일시적인 문제가 있어 화면에서 다시 불러옵니다.";
  let filterProfileId = input.initialFilterProfileId;
  const startupMigrationSequenceAtStart = getPlanningStartupMigrationGateSnapshot()?.sequence ?? 0;
  const telemetry = createPlanningPageLoadTelemetry({
    context: {
      hasInitialFilterProfileId: Boolean(input.initialFilterProfileId),
    },
    route: "/planning/runs",
  });

  try {
    const loaded = await telemetry.step("userScope", () => withCurrentPlanningPageUser(async () => {
      let profiles: CurrentUserPlanningProfileRecord[] = [];
      let profilesReady = false;
      let runs: CurrentUserPlanningRunRecord[] = [];
      let runsReady = false;
      let actionProgressSummaryByRunId: Record<string, CurrentUserPlanningRunActionProgressSummary> = {};
      let loadNotice = "";

      try {
        const profileList = await telemetry.step("profiles", () => listCurrentUserProfilesWithDefault());
        profiles = profileList.profiles;
        if (!filterProfileId) filterProfileId = profileList.defaultProfileId ?? "";
        profilesReady = true;
      } catch (error) {
        console.error("[planning/runs] failed to load initial profiles", error);
        loadNotice = "처음 프로필 목록을 준비하는 중 일시적인 문제가 있어 화면에서 다시 불러옵니다.";
      }

      try {
        runs = await telemetry.step("runs", () =>
          listCurrentUserRuns({
            ...(filterProfileId ? { profileId: filterProfileId } : {}),
            limit: 200,
          }),
        );
        actionProgressSummaryByRunId = await telemetry.step("actionProgress", () =>
          summarizeCurrentUserRunActionProgressByRunId(runs),
        );
        runsReady = true;
      } catch (error) {
        console.error("[planning/runs] failed to load initial runs", error);
        loadNotice = fallbackNotice;
      }

      return {
        actionProgressSummaryByRunId,
        filterProfileId,
        loadNotice,
        profiles,
        profilesReady,
        runs,
        runsReady,
      };
    }));

    telemetry.finish({
      hasFilterProfileId: Boolean(loaded.filterProfileId),
      hasLoadNotice: Boolean(loaded.loadNotice),
      profileCount: loaded.profiles.length,
      profilesReady: loaded.profilesReady,
      runCount: loaded.runs.length,
      runsReady: loaded.runsReady,
      status: "ok",
      ...getPlanningStartupMigrationTelemetryContext({
        sinceSequence: startupMigrationSequenceAtStart,
      }),
    });

    return loaded;
  } catch (error) {
    console.error("[planning/runs] failed to load initial data in user scope", error);
    const loaded = {
      actionProgressSummaryByRunId: {},
      filterProfileId,
      loadNotice: toPlanningPageLoadMessage(error, fallbackNotice),
      profiles: [],
      profilesReady: false,
      runs: [],
      runsReady: false,
    };

    telemetry.finish({
      hasFilterProfileId: Boolean(loaded.filterProfileId),
      hasLoadNotice: Boolean(loaded.loadNotice),
      profileCount: 0,
      profilesReady: false,
      runCount: 0,
      runsReady: false,
      status: "fallback",
      ...getPlanningStartupMigrationTelemetryContext({
        sinceSequence: startupMigrationSequenceAtStart,
      }),
    });

    return loaded;
  }
}

export async function loadPlanningReportDetailPageInitialData(
  id: string,
): Promise<PlanningReportDetailPageInitialData> {
  try {
    const loaded = await withCurrentPlanningPageUser(async () => {
      const found = await getCurrentUserReport(id);
      if (!found) return { report: null, run: null };

      let run: CurrentUserPlanningRunRecord | null = null;
      if (found.meta.runId) {
        try {
          run = await getCurrentUserRun(found.meta.runId);
        } catch (runError) {
          console.error("[planning/reports/detail] failed to load initial report run", runError);
        }
      }

      const report: PlanningReportDetailInitialReport = {
        id: found.meta.id,
        createdAt: found.meta.createdAt,
        kind: found.meta.kind,
        ...(found.meta.runId ? { runId: found.meta.runId } : {}),
        ...(found.meta.recommendRunId ? { recommendRunId: found.meta.recommendRunId } : {}),
        markdown: found.markdown,
      };

      return { report, run };
    });

    return {
      initialError: "",
      initialReport: loaded.report,
      initialRun: loaded.run,
    };
  } catch (error) {
    console.error("[planning/reports/detail] failed to load initial report detail", error);
    return {
      initialError: toPlanningPageLoadMessage(error, "리포트를 불러오지 못했습니다."),
      initialReport: null,
      initialRun: null,
    };
  }
}
