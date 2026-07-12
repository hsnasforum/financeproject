import {
  createRun,
  deleteRun,
  getRun,
  getRunBlob,
  hardDeleteRun,
  hardDeleteRunFromTrash,
  hasRunIdReservation,
  listRunIndexEntries,
  listRuns,
  restoreRunFromTrash,
  updateRun,
  type RunIndexEntry,
  type UpdateRunPatch,
} from "../store/runStore";
import {
  ensureRunActionProgress,
  ensureRunActionPlan,
  getRunActionPlan,
  getRunActionProgress,
  getRunActionProgressSummaries,
  summarizeRunActionProgress,
  updateRunActionProgress,
  type RunActionProgressSummary,
} from "../store/runActionStore";
import {
  type PlanningRunActionPlan,
  type PlanningRunActionProgress,
  type PlanningRunActionStatus,
  type PlanningRunRecord,
  type PlanningRunStageResult,
} from "../store/types";
import { getCurrentUserProfile, type CurrentUserPlanningProfileRecord } from "../profiles/repository";

export type CurrentUserPlanningRunRecord = PlanningRunRecord;
export type CurrentUserPlanningRunIndexEntry = RunIndexEntry;
export type CurrentUserPlanningRunStageResult = PlanningRunStageResult;
export type CurrentUserPlanningRunActionPlan = PlanningRunActionPlan;
export type CurrentUserPlanningRunActionProgress = PlanningRunActionProgress;
export type CurrentUserPlanningRunActionStatus = PlanningRunActionStatus;
export type CurrentUserPlanningRunActionProgressSummary = RunActionProgressSummary;

type ListCurrentUserRunsOptions = {
  profileId?: string;
  limit?: number;
  offset?: number;
};

type CreateCurrentUserRunInput = Parameters<typeof createRun>[0];
type CreateCurrentUserRunOptions = Parameters<typeof createRun>[1];

export async function listCurrentUserRuns(
  options?: ListCurrentUserRunsOptions,
): Promise<CurrentUserPlanningRunRecord[]> {
  return listRuns(options);
}

export async function listCurrentUserRunIndexEntries(
  options?: ListCurrentUserRunsOptions,
): Promise<CurrentUserPlanningRunIndexEntry[]> {
  return listRunIndexEntries(options);
}

export async function getCurrentUserRun(id: string): Promise<CurrentUserPlanningRunRecord | null> {
  return getRun(id);
}

export async function hasCurrentUserRunIdReservation(id: string): Promise<boolean> {
  return hasRunIdReservation(id);
}

export async function getCurrentUserRunProfile(
  profileId: string,
): Promise<CurrentUserPlanningProfileRecord | null> {
  return getCurrentUserProfile(profileId);
}

export async function createCurrentUserRun(
  input: CreateCurrentUserRunInput,
  options?: CreateCurrentUserRunOptions,
): Promise<CurrentUserPlanningRunRecord> {
  return createRun(input, options);
}

export async function updateCurrentUserRun(
  id: string,
  patch: UpdateRunPatch,
): Promise<CurrentUserPlanningRunRecord | null> {
  return updateRun(id, patch);
}

export async function deleteCurrentUserRun(id: string): Promise<boolean> {
  return deleteRun(id);
}

export async function hardDeleteCurrentUserRun(id: string): Promise<boolean> {
  return hardDeleteRun(id);
}

export async function getCurrentUserRunBlob(id: string, name: string): Promise<unknown | null> {
  return getRunBlob(id, name);
}

export async function ensureCurrentUserRunActionPlan(
  run: CurrentUserPlanningRunRecord,
): Promise<CurrentUserPlanningRunActionPlan> {
  return ensureRunActionPlan(run);
}

export async function ensureCurrentUserRunActionProgress(
  run: CurrentUserPlanningRunRecord,
  plan?: CurrentUserPlanningRunActionPlan,
): Promise<CurrentUserPlanningRunActionProgress> {
  return ensureRunActionProgress(run, plan);
}

export async function getCurrentUserRunActionPlanSnapshot(
  runId: string,
): Promise<CurrentUserPlanningRunActionPlan | null> {
  return getRunActionPlan(runId);
}

export async function getCurrentUserRunActionProgress(
  runId: string,
): Promise<CurrentUserPlanningRunActionProgress | null> {
  return getRunActionProgress(runId);
}

export async function summarizeCurrentUserRunActionProgressByRunId(
  runs: CurrentUserPlanningRunRecord[],
): Promise<Record<string, CurrentUserPlanningRunActionProgressSummary>> {
  return getRunActionProgressSummaries(runs);
}

export async function updateCurrentUserRunActionProgress(
  runId: string,
  input: {
    actionKey: string;
    status?: CurrentUserPlanningRunActionStatus;
    note?: string;
  },
): Promise<CurrentUserPlanningRunActionProgress> {
  return updateRunActionProgress(runId, input);
}

export function summarizeCurrentUserRunActionProgress(
  progress: CurrentUserPlanningRunActionProgress,
): CurrentUserPlanningRunActionProgressSummary {
  return summarizeRunActionProgress(progress);
}

export async function restoreCurrentUserRunFromTrash(id: string): Promise<boolean> {
  return restoreRunFromTrash(id);
}

export async function hardDeleteCurrentUserRunFromTrash(id: string): Promise<boolean> {
  return hardDeleteRunFromTrash(id);
}
