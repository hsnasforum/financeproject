import { describe, expect, it } from "vitest";
import {
  BEGINNER_MAX_DEBT_ROWS,
  buildSelectedProfileHydrationStamp,
  buildSelectedProfileHydration,
  canAddProfileDebtRow,
  canRemoveProfileDebtRow,
  createProfileDeleteDialogState,
  emergencyMonthsFromGoal,
  ensureBeginnerGoals,
  isDeleteProfileConfirmMatched,
  resolveInitialProfileRequestId,
  resolveProfileSaveFeedback,
  resolveProfileSavePayloadName,
  selectLoadedProfileId,
  shouldApplyProfileHydrationForEditVersion,
  shouldHydrateSelectedProfile,
  shouldSkipSelectedProfileHydrationAfterLocalEdit,
  updateBeginnerGoalList,
} from "../../../src/components/planning/workspace/useWorkspaceProfileBundle";

function profileRecordFixture(id: string, name = "프로필 A") {
  return {
    version: 1 as const,
    schemaVersion: 2 as const,
    id,
    name,
    createdAt: "2026-04-11T00:00:00.000Z",
    updatedAt: "2026-04-11T00:00:00.000Z",
    profile: {
      monthlyIncomeNet: 4_200_000,
      monthlyEssentialExpenses: 1_600_000,
      monthlyDiscretionaryExpenses: 700_000,
      liquidAssets: 1_200_000,
      investmentAssets: 3_500_000,
      debts: [],
      goals: [],
    },
  };
}

describe("workspaceProfileBundle", () => {
  it("keeps initial profile selection priority as query then stored then first item", () => {
    const profiles = [
      profileRecordFixture("profile-1"),
      profileRecordFixture("profile-2"),
    ];

    expect(resolveInitialProfileRequestId("profile-2", "profile-1")).toBe("profile-2");
    expect(resolveInitialProfileRequestId("", "profile-1")).toBe("profile-1");
    expect(selectLoadedProfileId(profiles, "profile-2")).toBe("profile-2");
    expect(selectLoadedProfileId(profiles, "missing-profile")).toBe("profile-1");
  });

  it("hydrates selected profile state and clears pending suggestion state", () => {
    const hydration = buildSelectedProfileHydration(profileRecordFixture("profile-1", "테스트 프로필"));

    expect(hydration.profileName).toBe("테스트 프로필");
    expect(hydration.editorState.form.monthlyIncomeNet).toBe(4_200_000);
    expect(hydration.suggestionState).toEqual({
      pendingProfileSave: null,
      pendingSuggestions: [],
      acceptedSuggestionCodes: [],
    });
    expect(hydration.lastNormalizationDisclosure).toBeNull();
  });

  it("guards same-profile rehydration unless the persisted identity changed", () => {
    const profile = profileRecordFixture("profile-1", "테스트 프로필");
    const sameStamp = buildSelectedProfileHydrationStamp(profile);
    const updatedStamp = buildSelectedProfileHydrationStamp({
      ...profile,
      updatedAt: "2026-04-12T12:00:00.000Z",
    });

    expect(shouldHydrateSelectedProfile(sameStamp, "")).toBe(true);
    expect(shouldHydrateSelectedProfile(sameStamp, sameStamp)).toBe(false);
    expect(shouldHydrateSelectedProfile(updatedStamp, sameStamp)).toBe(true);
  });

  it("does not overwrite same-profile local edits with late hydration", () => {
    const previousStamp = "profile-1:2026-04-11T00:00:00.000Z:테스트 프로필";

    expect(shouldSkipSelectedProfileHydrationAfterLocalEdit({
      profileId: "profile-1",
      selectedProfileId: "profile-1",
      lastHydratedProfileStamp: "",
      hasLocalEdits: true,
    })).toBe(true);
    expect(shouldSkipSelectedProfileHydrationAfterLocalEdit({
      profileId: "profile-1",
      selectedProfileId: "",
      lastHydratedProfileStamp: previousStamp,
      hasLocalEdits: true,
    })).toBe(true);
    expect(shouldSkipSelectedProfileHydrationAfterLocalEdit({
      profileId: "profile-2",
      selectedProfileId: "profile-1",
      lastHydratedProfileStamp: previousStamp,
      hasLocalEdits: true,
    })).toBe(false);
    expect(shouldSkipSelectedProfileHydrationAfterLocalEdit({
      profileId: "profile-1",
      selectedProfileId: "profile-1",
      lastHydratedProfileStamp: previousStamp,
      hasLocalEdits: false,
    })).toBe(false);
    expect(shouldApplyProfileHydrationForEditVersion({
      currentLocalEditVersion: 2,
      hydrationLocalEditVersion: 2,
    })).toBe(true);
    expect(shouldApplyProfileHydrationForEditVersion({
      currentLocalEditVersion: 3,
      hydrationLocalEditVersion: 2,
    })).toBe(false);
  });

  it("preserves beginner goals and beginner debt row limits", () => {
    const goals = ensureBeginnerGoals([], {
      monthlyExpenses: 2_300_000,
      liquidAssets: 1_200_000,
      investmentAssets: 3_500_000,
    });
    const emergencyGoal = goals.find((goal) => goal.id === "goal-emergency");
    const updatedGoals = updateBeginnerGoalList(goals, "emergency", {
      monthlyExpenses: 2_300_000,
      liquidAssets: 1_200_000,
      investmentAssets: 3_500_000,
    }, {
      targetAmount: 15_000_000,
      targetMonth: 18,
    });

    expect(goals).toHaveLength(3);
    expect(emergencyGoal?.targetAmount).toBe(13_800_000);
    expect(emergencyMonthsFromGoal(updatedGoals[0], 2_500_000)).toBe(6);
    expect(canAddProfileDebtRow(true, BEGINNER_MAX_DEBT_ROWS - 1)).toBe(true);
    expect(canAddProfileDebtRow(true, BEGINNER_MAX_DEBT_ROWS)).toBe(false);
    expect(canRemoveProfileDebtRow(true, 2)).toBe(true);
    expect(canRemoveProfileDebtRow(true, 1)).toBe(false);
  });

  it("keeps save/delete helper branches stable", () => {
    const createFeedback = resolveProfileSaveFeedback("create", true);
    const duplicateFeedback = resolveProfileSaveFeedback("duplicate", false);
    const dialog = createProfileDeleteDialogState("profile-1");

    expect(createFeedback.successMessage).toContain("다음 단계는 첫 실행");
    expect(duplicateFeedback.fallbackMessage).toBe("프로필 복제에 실패했습니다.");
    expect(resolveProfileSavePayloadName("duplicate", "기본 프로필")).toBe("기본 프로필 (copy)");
    expect(createProfileDeleteDialogState("")).toBeNull();
    expect(dialog?.confirmText).toBe("");
    expect(isDeleteProfileConfirmMatched(dialog)).toBe(false);
    expect(isDeleteProfileConfirmMatched(dialog ? { ...dialog, confirmText: "mismatch" } : null)).toBe(false);
    expect(isDeleteProfileConfirmMatched(dialog ? { ...dialog, confirmText: dialog.expectedConfirm } : null)).toBe(true);
  });
});
