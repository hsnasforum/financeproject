import PlanningRunsClient, { type ActionProgressSummary } from "@/components/PlanningRunsClient";
import { normalizeProfileId } from "@/lib/planning/profileScope";
import {
  toPlanningPageLoadMessage,
  withCurrentPlanningPageUser,
} from "@/lib/planning/server/pageAuth";
import {
  getCurrentUserDefaultProfileId,
  listCurrentUserProfiles,
  type CurrentUserPlanningProfileRecord,
} from "@/lib/planning/server/profiles/repository";
import {
  getCurrentUserRunActionProgress,
  listCurrentUserRuns,
  summarizeCurrentUserRunActionProgress,
  type CurrentUserPlanningRunRecord,
} from "@/lib/planning/server/runs/repository";

export const dynamic = "force-dynamic";

type PlanningRunsPageProps = {
  searchParams?: Promise<{
    selected?: string | string[];
    profileId?: string | string[];
  }>;
};

function pickSelected(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value?.trim() ?? "";
}

function pickProfileId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return normalizeProfileId(value[0]);
  return normalizeProfileId(value);
}

export default async function PlanningRunsPage({ searchParams }: PlanningRunsPageProps) {
  const resolvedSearchParams = await searchParams;
  const initialSelectedRunId = pickSelected(resolvedSearchParams?.selected);
  const requestedProfileId = pickProfileId(resolvedSearchParams?.profileId);
  let initialFilterProfileId = requestedProfileId;
  let initialProfiles: CurrentUserPlanningProfileRecord[] = [];
  let initialProfilesReady = false;
  let initialRuns: CurrentUserPlanningRunRecord[] = [];
  let initialRunsReady = false;
  let initialActionProgressSummaryByRunId: Record<string, ActionProgressSummary> = {};
  let initialLoadNotice = "";

  try {
    const loaded = await withCurrentPlanningPageUser(async () => {
      let nextFilterProfileId = initialFilterProfileId;
      let nextProfiles: CurrentUserPlanningProfileRecord[] = [];
      let nextProfilesReady = false;
      let nextRuns: CurrentUserPlanningRunRecord[] = [];
      let nextRunsReady = false;
      let nextActionProgressSummaryByRunId: Record<string, ActionProgressSummary> = {};
      let nextLoadNotice = "";

      async function summarizeActionProgressByRunId(
        runs: CurrentUserPlanningRunRecord[],
      ): Promise<Record<string, ActionProgressSummary>> {
        const entries = await Promise.all(runs.map(async (run) => {
          try {
            const progress = await getCurrentUserRunActionProgress(run.id);
            if (!progress) return null;
            return [run.id, summarizeCurrentUserRunActionProgress(progress)] as const;
          } catch {
            return null;
          }
        }));
        return Object.fromEntries(entries.filter((entry): entry is readonly [string, ActionProgressSummary] => entry !== null));
      }

      if (!nextFilterProfileId) {
        nextFilterProfileId = await getCurrentUserDefaultProfileId().catch(() => "") || "";
      }

      try {
        nextProfiles = await listCurrentUserProfiles();
        nextProfilesReady = true;
      } catch (error) {
        console.error("[planning/runs] failed to load initial profiles", error);
        nextLoadNotice = "처음 프로필 목록을 준비하는 중 일시적인 문제가 있어 화면에서 다시 불러옵니다.";
      }

      try {
        nextRuns = await listCurrentUserRuns({
          ...(nextFilterProfileId ? { profileId: nextFilterProfileId } : {}),
          limit: 200,
        });
        nextActionProgressSummaryByRunId = await summarizeActionProgressByRunId(nextRuns);
        nextRunsReady = true;
      } catch (error) {
        console.error("[planning/runs] failed to load initial runs", error);
        nextLoadNotice = "처음 상담 기록을 준비하는 중 일시적인 문제가 있어 화면에서 다시 불러옵니다.";
      }

      return {
        actionProgressSummaryByRunId: nextActionProgressSummaryByRunId,
        filterProfileId: nextFilterProfileId,
        loadNotice: nextLoadNotice,
        profiles: nextProfiles,
        profilesReady: nextProfilesReady,
        runs: nextRuns,
        runsReady: nextRunsReady,
      };
    });

    initialFilterProfileId = loaded.filterProfileId;
    initialProfiles = loaded.profiles;
    initialProfilesReady = loaded.profilesReady;
    initialRuns = loaded.runs;
    initialRunsReady = loaded.runsReady;
    initialActionProgressSummaryByRunId = loaded.actionProgressSummaryByRunId;
    initialLoadNotice = loaded.loadNotice;
  } catch (error) {
    console.error("[planning/runs] failed to load initial data in user scope", error);
    initialLoadNotice = toPlanningPageLoadMessage(error, "처음 상담 기록을 준비하는 중 일시적인 문제가 있어 화면에서 다시 불러옵니다.");
  }

  return (
    <PlanningRunsClient
      initialSelectedRunId={initialSelectedRunId}
      initialFilterProfileId={initialFilterProfileId}
      initialProfiles={initialProfiles}
      initialProfilesReady={initialProfilesReady}
      initialRuns={initialRuns}
      initialRunsReady={initialRunsReady}
      initialActionProgressSummaryByRunId={initialActionProgressSummaryByRunId}
      initialLoadNotice={initialLoadNotice}
    />
  );
}
