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
  hasProfileEditsSinceDispatch,
  hasUnsavedProfileEditsAfterSave,
  isDeleteProfileConfirmMatched,
  isLatestProfileListResponse,
  resolveInitialProfileRequestId,
  resolveProfileListSelectionRequest,
  resolveProfileSaveCompletionNotice,
  resolveProfileSaveFeedback,
  resolveProfileSaveFollowUp,
  resolveProfileSavePayloadName,
  shouldApplyProfileDetailResponse,
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

  it("rejects profile detail responses after a selection, A-B-A round trip or save", () => {
    const base = {
      requestedProfileId: "profile-a",
      currentSelectedProfileId: "profile-a",
      requestSelectionGeneration: 1,
      currentSelectionGeneration: 1,
      requestDataEpoch: 0,
      currentDataEpoch: 0,
    };

    expect(shouldApplyProfileDetailResponse(base)).toBe(true);
    expect(shouldApplyProfileDetailResponse({ ...base, currentSelectedProfileId: "profile-b", currentSelectionGeneration: 2 })).toBe(false);
    // A -> B -> A ends on the same id, but the selection generation moved on.
    expect(shouldApplyProfileDetailResponse({ ...base, currentSelectionGeneration: 3 })).toBe(false);
    expect(shouldApplyProfileDetailResponse({ ...base, currentDataEpoch: 1 })).toBe(false);
  });

  it("applies only the latest profile list response and keeps a selection made while it was loading", () => {
    expect(isLatestProfileListResponse({ requestSequence: 2, latestSequence: 2 })).toBe(true);
    expect(isLatestProfileListResponse({ requestSequence: 1, latestSequence: 2 })).toBe(false);

    const base = {
      currentSelectedProfileId: "profile-a",
      requestSelectionGeneration: 4,
      currentSelectionGeneration: 4,
      editedSinceRequest: false,
    };
    expect(resolveProfileListSelectionRequest({ ...base, nextSelectedId: "profile-c" })).toBe("profile-c");
    expect(resolveProfileListSelectionRequest(base)).toBe("profile-a");
    // A user selection while loading wins.
    expect(resolveProfileListSelectionRequest({
      ...base,
      nextSelectedId: "profile-c",
      currentSelectedProfileId: "profile-b",
      currentSelectionGeneration: 5,
    })).toBe("profile-b");
    // A content edit while the follow-up list of a duplicate loads keeps the edited profile.
    expect(resolveProfileListSelectionRequest({ ...base, nextSelectedId: "profile-c", editedSinceRequest: true })).toBe("profile-a");
  });

  it("counts only content versions as edits since dispatch", () => {
    expect(hasProfileEditsSinceDispatch({ dispatchContentVersion: 3, currentContentVersion: 3 })).toBe(false);
    expect(hasProfileEditsSinceDispatch({ dispatchContentVersion: 3, currentContentVersion: 4 })).toBe(true);
  });

  it("reports unsaved edits only for content still in the current selection after a save", () => {
    // Saved A at 3, moved to B (baseline 3), edited B (4), returned to A (baseline 4): B's edit was dropped.
    expect(hasUnsavedProfileEditsAfterSave({ dispatchContentVersion: 3, selectionContentVersion: 4, currentContentVersion: 4 })).toBe(false);
    // Same round trip, then Y typed into A after returning.
    expect(hasUnsavedProfileEditsAfterSave({ dispatchContentVersion: 3, selectionContentVersion: 4, currentContentVersion: 5 })).toBe(true);
    // Y (form or JSON draft) typed into A while the PATCH was pending, selection unchanged.
    expect(hasUnsavedProfileEditsAfterSave({ dispatchContentVersion: 3, selectionContentVersion: 1, currentContentVersion: 4 })).toBe(true);
    // Edits made before the save are part of the saved payload.
    expect(hasUnsavedProfileEditsAfterSave({ dispatchContentVersion: 3, selectionContentVersion: 1, currentContentVersion: 3 })).toBe(false);
    // Moved to B and kept editing it: B's input is still unsaved.
    expect(hasUnsavedProfileEditsAfterSave({ dispatchContentVersion: 3, selectionContentVersion: 3, currentContentVersion: 4 })).toBe(true);
    // The previous dispatch-only rule reported the dropped B edit as unsaved.
    expect(hasProfileEditsSinceDispatch({ dispatchContentVersion: 3, currentContentVersion: 4 })).toBe(true);
  });

  it("resolves save follow-up selection and local edit state at the save response", () => {
    expect(resolveProfileSaveFollowUp({
      mode: "update",
      savedProfileId: "profile-a",
      selectionChanged: false,
      hasEditsSinceDispatch: false,
    })).toEqual({ nextSelectedId: "profile-a", clearLocalEdits: true });
    expect(resolveProfileSaveFollowUp({
      mode: "update",
      savedProfileId: "profile-a",
      selectionChanged: false,
      hasEditsSinceDispatch: true,
    })).toEqual({ nextSelectedId: "profile-a", clearLocalEdits: false });
    expect(resolveProfileSaveFollowUp({
      mode: "update",
      savedProfileId: "profile-a",
      selectionChanged: true,
      hasEditsSinceDispatch: false,
    })).toEqual({ nextSelectedId: undefined, clearLocalEdits: false });
    expect(resolveProfileSaveFollowUp({
      mode: "duplicate",
      savedProfileId: "profile-c",
      selectionChanged: false,
      hasEditsSinceDispatch: false,
    })).toEqual({ nextSelectedId: "profile-c", clearLocalEdits: true });
    expect(resolveProfileSaveFollowUp({
      mode: "create",
      savedProfileId: "profile-c",
      selectionChanged: false,
      hasEditsSinceDispatch: true,
    })).toEqual({ nextSelectedId: undefined, clearLocalEdits: false });
  });

  it("builds the completion notice from what the screen shows after the follow-up list", () => {
    const base = { beginnerMode: false, savedProfileName: "프로필 C" };
    expect(resolveProfileSaveCompletionNotice({ ...base, mode: "update", savedProfileSelected: true, hasUnsavedEdits: false }))
      .toBe("프로필을 수정했습니다.");
    expect(resolveProfileSaveCompletionNotice({ ...base, mode: "create", savedProfileSelected: true, hasUnsavedEdits: false }))
      .toBe("프로필을 저장했습니다.");
    expect(resolveProfileSaveCompletionNotice({ ...base, mode: "update", savedProfileSelected: true, hasUnsavedEdits: true }))
      .toContain("저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다");

    const keptAfterDuplicate = resolveProfileSaveCompletionNotice({
      ...base,
      mode: "duplicate",
      savedProfileSelected: false,
      hasUnsavedEdits: true,
    });
    expect(keptAfterDuplicate).toContain("프로필 C");
    expect(keptAfterDuplicate).toContain("아직 저장되지 않았습니다");
    const keptAfterMove = resolveProfileSaveCompletionNotice({
      ...base,
      mode: "update",
      savedProfileSelected: false,
      hasUnsavedEdits: false,
    });
    expect(keptAfterMove).toContain("프로필 C");
    expect(keptAfterMove).toContain("그대로 유지했습니다");
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
