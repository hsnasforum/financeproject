import type { DashboardCurrentPlan, DashboardCurrentProfile, DashboardInitialViewModel, DashboardRun } from "@/components/DashboardClient";
import {
  DASHBOARD_UNKNOWN_PROFILE_LABEL,
  DASHBOARD_UNNAMED_PROFILE_LABEL,
  type DashboardProfileSelection,
} from "@/components/dashboard/dashboardClientModel";
import type { DashboardProfileSelectionRequest } from "@/app/dashboard/_lib/dashboardProfileSelection";
import { listCurrentUserRunIndexEntries, listCurrentUserRuns } from "@/lib/planning/server/runs/repository";
import { listCurrentUserProfilesWithDefault } from "@/lib/planning/server/profiles/repository";
import { withCurrentPlanningPageUser } from "@/lib/planning/server/pageAuth";
import { isPlanningAuthError } from "@/lib/planning/auth/currentUser";
import { computeMonthlySurplusKrw } from "@/lib/planning/calc/metrics";
import { computeProfileHash } from "@/lib/planning/v2/reproducibility";
import { applyProfilePatch } from "@/lib/planning/v2/profilePatch";
import type { ProfileV2 } from "@/lib/planning/v2/types";

type DashboardRunSource = Awaited<ReturnType<typeof listCurrentUserRuns>>[number];
type ListRunsForDashboard = typeof listCurrentUserRuns;
type ListProfilesForDashboard = typeof listCurrentUserProfilesWithDefault;

const runsErrorMessage = "최근 플랜 정보를 불러오지 못했습니다. 저장된 데이터는 유지되며, 잠시 뒤 다시 시도해 주세요.";
const profileErrorMessage = "현재 기본 프로필을 불러오지 못했습니다. 저장된 데이터는 유지되며, 잠시 뒤 다시 시도해 주세요.";

type ProfileRecordForDashboard = Awaited<ReturnType<ListProfilesForDashboard>>["profiles"][number];

type CurrentProfileContext = {
  view: DashboardCurrentProfile;
  profile?: ProfileV2;
  selection?: DashboardProfileSelection;
  // null when the profile list could not be read; run labels then stay "unknown".
  profileLabels: Map<string, string> | null;
};

const invalidSelectionMessage = "선택한 프로필 주소가 올바르지 않습니다. 아래에서 표시할 프로필을 다시 선택해 주세요.";
const missingSelectionMessage = "선택한 프로필을 찾을 수 없습니다. 삭제되었거나 이 사용자 범위에 없는 프로필일 수 있습니다. 아래에서 표시할 프로필을 다시 선택해 주세요.";

export function dashboardProfileLabel(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : DASHBOARD_UNNAMED_PROFILE_LABEL;
}

// profileStore seeds this untouched empty record when no saved input exists.
// A user-created zero profile or an edited default profile is still real input.
function isUntouchedSeedProfile(record: ProfileRecordForDashboard): boolean {
  const profile = record.profile;
  return record.id === "default-profile" && record.name === "기본 프로필"
    && record.createdAt === record.updatedAt
    && Object.keys(profile).every((key) => [
      "monthlyIncomeNet", "monthlyEssentialExpenses", "monthlyDiscretionaryExpenses",
      "liquidAssets", "investmentAssets", "debts", "goals",
    ].includes(key))
    && profile.monthlyIncomeNet === 0 && profile.monthlyEssentialExpenses === 0
    && profile.monthlyDiscretionaryExpenses === 0 && profile.liquidAssets === 0
    && profile.investmentAssets === 0 && profile.debts.length === 0 && profile.goals.length === 0;
}

function buildProfileSelection(
  profiles: ProfileRecordForDashboard[],
  defaultProfileId: string | undefined,
  selectedProfileId: string,
): DashboardProfileSelection {
  return {
    selectedProfileId,
    options: profiles.map((record) => ({
      id: record.id,
      label: dashboardProfileLabel(record.name),
      isDefault: record.id === defaultProfileId,
    })),
  };
}

async function loadCurrentProfile(
  listProfiles: ListProfilesForDashboard,
  request: DashboardProfileSelectionRequest,
): Promise<CurrentProfileContext> {
  try {
    const { profiles, defaultProfileId } = await listProfiles();
    const profileLabels = new Map(profiles.map((record) => [record.id, dashboardProfileLabel(record.name)]));
    const withSelection = (view: DashboardCurrentProfile, selectedProfileId = ""): CurrentProfileContext => ({
      view,
      selection: buildProfileSelection(profiles, defaultProfileId, selectedProfileId),
      profileLabels,
    });
    // An explicit selection never falls back to the default or another profile.
    if (request.kind === "invalid") return withSelection({ state: "selection-invalid", message: invalidSelectionMessage });
    let record: ProfileRecordForDashboard | undefined;
    if (request.kind === "requested") {
      record = profiles.find((profile) => profile.id === request.profileId);
      if (!record) return withSelection({ state: "selection-invalid", message: missingSelectionMessage });
    } else {
      if (profiles.length === 0 && !defaultProfileId) return withSelection({ state: "missing" });
      record = profiles.find((profile) => profile.id === defaultProfileId);
      if (!record) return { view: { state: "failed", message: profileErrorMessage }, profileLabels };
    }
    if (isUntouchedSeedProfile(record)) {
      const hasSavedProfile = request.kind === "none" && profiles.some((profile) => !isUntouchedSeedProfile(profile));
      if (hasSavedProfile) return withSelection({ state: "selection-required" });
      return request.kind === "requested"
        ? withSelection({ state: "missing", id: record.id }, record.id)
        : withSelection({ state: "missing" });
    }
    const profile = record.profile;
    const monthlyExpensesKrw = profile.monthlyEssentialExpenses + profile.monthlyDiscretionaryExpenses;
    const monthlyDebtPaymentKrw = profile.debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
    const totalDebtKrw = profile.debts.reduce((sum, debt) => sum + debt.balance, 0);
    // simulateMonthly counts funded goals separately from liquid/investment assets; pension starts at zero.
    const goalFundsKrw = profile.goals.reduce((sum, goal) => sum + Math.max(0, goal.currentAmount ?? 0), 0);
    return {
      profile,
      selection: buildProfileSelection(profiles, defaultProfileId, record.id),
      profileLabels,
      view: {
        state: "loaded",
        id: record.id,
        name: dashboardProfileLabel(record.name),
        updatedAt: record.updatedAt,
        source: request.kind === "requested" ? "selected" : "default",
        monthlyIncomeKrw: profile.monthlyIncomeNet,
        monthlyExpensesKrw,
        monthlyDebtPaymentKrw,
        monthlySurplusKrw: computeMonthlySurplusKrw(profile.monthlyIncomeNet, monthlyExpensesKrw, monthlyDebtPaymentKrw),
        totalDebtKrw,
        netWorthKrw: profile.liquidAssets + profile.investmentAssets + goalFundsKrw - totalDebtKrw,
      },
    };
  } catch {
    return { view: { state: "failed", message: profileErrorMessage }, profileLabels: null };
  }
}

// Labels come from the authenticated profile list. An unmatched id is not proof of deletion.
function labelDashboardRuns(runs: DashboardRun[], profileLabels: Map<string, string> | null): DashboardRun[] {
  return runs.map((run) => ({
    ...run,
    profileLabel: profileLabels?.get(run.profileId) ?? DASHBOARD_UNKNOWN_PROFILE_LABEL,
    // A failed or empty list cannot confirm the profile; links into planning need a confirmed profile.
    profileLinked: profileLabels?.has(run.profileId) === true,
  }));
}

async function loadCurrentPlan(
  context: CurrentProfileContext,
  listRuns: ListRunsForDashboard,
  listIndex: typeof listCurrentUserRunIndexEntries,
): Promise<DashboardCurrentPlan> {
  if (context.view.state === "failed") return { state: "failed", message: context.view.message };
  if (context.view.state !== "loaded" || !context.profile) return { state: "missing" };
  const profileId = context.view.id;
  try {
    // The repository orders newest first. Search within the profile, independently of the six recent runs.
    // Match workspace completion status; failed/in-progress/unknown runs cannot replace a completed simulation.
    const limit = 100;
    let hasRuns = false;
    for (let offset = 0; ; offset += limit) {
      const rows = await listRuns({ profileId, limit, offset });
      const scoped = rows.filter((run) => run.profileId === profileId);
      hasRuns ||= scoped.length > 0;
      const source = scoped.find((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS");
      if (source) {
        const run = sanitizeDashboardRuns([source])[0];
        if (!source.reproducibility?.profileHash || (source.scenario && !source.input.scenario)) return { state: "unverified", run };
        // The create service hashes the effective profile after applying a stored scenario.
        let effectiveProfile = context.profile;
        try {
          if (source.input.scenario) effectiveProfile = applyProfilePatch(context.profile, source.input.scenario.patch);
        } catch {
          // A removed scenario target is changed input, not a failed run lookup. The create preflight explains it on click.
          return { state: "stale", run, rerunInput: structuredClone(source.input) };
        }
        const hash = computeProfileHash(effectiveProfile);
        if (hash === source.reproducibility.profileHash) return { state: "current", run };
        // Only the selected, scoped completed run supplies rerun settings. Recent-list projections stay small.
        return { state: "stale", run, rerunInput: structuredClone(source.input) };
      }
      if (rows.length < limit) {
        // listRuns removes unreadable metadata after slicing the index. A short result need not be the last page.
        const entries = await listIndex({ profileId, limit, offset });
        hasRuns ||= entries.length > 0;
        if (entries.length < limit) break;
      }
    }
    return hasRuns
      ? { state: "failed", message: "현재 프로필의 완료된 계산 결과가 없습니다. 실행 상태를 확인하고 다시 계산해 주세요." }
      : { state: "missing" };
  } catch {
    return { state: "failed", message: "현재 프로필의 플랜 또는 조건 일치 여부를 확인하지 못했습니다. 잠시 뒤 다시 불러와 주세요." };
  }
}

export function sanitizeDashboardRuns(runs: DashboardRunSource[]): DashboardRun[] {
  return runs.slice(0, 6).map((run) => ({
    id: run.id,
    profileId: run.profileId,
    title: run.title?.trim() || run.scenario?.name?.trim() || "플래닝 실행",
    createdAt: run.createdAt,
    overallStatus: run.overallStatus,
    input: {
      horizonMonths: run.input.horizonMonths,
    },
    meta: {
      snapshot: {
        asOf: run.meta.snapshot?.asOf,
      },
    },
    outputs: {
      resultDto: run.outputs.resultDto ? {
        summary: run.outputs.resultDto.summary,
      } : undefined,
      simulate: run.outputs.simulate ? {
        summary: run.outputs.simulate.summary,
      } : undefined,
      actions: run.outputs.actions ? {
        actions: Array.isArray(run.outputs.actions.actions)
          ? run.outputs.actions.actions.map((action) => ({
            code: action.code,
            title: action.title,
            summary: action.summary,
            steps: action.steps,
            candidates: Array.isArray(action.candidates)
              ? action.candidates.map((candidate) => ({
                kind: candidate.kind,
                company: candidate.company,
                name: candidate.name,
                termMonths: candidate.termMonths,
                rateMinPct: candidate.rateMinPct,
                rateMaxPct: candidate.rateMaxPct,
                notes: candidate.notes,
                whyThis: candidate.whyThis,
              }))
              : [],
          }))
          : [],
      } : undefined,
    },
  }));
}

export async function loadDashboardViewModel(
  listRunsForDashboard: ListRunsForDashboard = listCurrentUserRuns,
  listProfilesForDashboard: ListProfilesForDashboard = listCurrentUserProfilesWithDefault,
  listRunIndexForDashboard: typeof listCurrentUserRunIndexEntries = listCurrentUserRunIndexEntries,
  selectionRequest: DashboardProfileSelectionRequest = { kind: "none" },
): Promise<DashboardInitialViewModel> {
  try {
    return await withCurrentPlanningPageUser(async () => {
      const [runState, context] = await Promise.all([
        (async () => {
          try {
            const runs = await listRunsForDashboard({ limit: 6 });
            return { runs: sanitizeDashboardRuns(runs), runsLoadState: "loaded" as const };
          } catch {
            return { runs: [], runsLoadState: "failed" as const, runsErrorMessage };
          }
        })(),
        loadCurrentProfile(listProfilesForDashboard, selectionRequest),
      ]);
      const currentPlan = await loadCurrentPlan(context, listRunsForDashboard, listRunIndexForDashboard);
      return {
        ...runState,
        runs: labelDashboardRuns(runState.runs, context.profileLabels),
        currentProfile: context.view,
        currentPlan,
        ...(context.selection ? { profileSelection: context.selection } : {}),
      };
    });
  } catch (error) {
    // Session/setup errors need the auth recovery screen, not a storage retry.
    if (isPlanningAuthError(error)) throw error;
    return {
      runs: [],
      runsLoadState: "failed",
      runsErrorMessage,
      currentProfile: { state: "failed", message: profileErrorMessage },
      currentPlan: { state: "failed", message: profileErrorMessage },
    };
  }
}
