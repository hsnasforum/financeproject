import { describe, expect, it } from "vitest";
import {
  buildPlanningWorkspaceSaveButtonDescribedBy,
  shouldAutoFocusPlanningQuickStartTarget,
  shouldCompletePlanningQuickStartFocusAttempt,
} from "../../../src/components/planning/workspace/controllerUtils";

describe("planning workspace controller utils", () => {
  it("builds save button described-by ids in stable order", () => {
    expect(buildPlanningWorkspaceSaveButtonDescribedBy({
      preflightHasBlockers: true,
      saveBlockedByHealth: true,
      hasPreflightWarnings: true,
    })).toBe(
      "planning-preflight-block-reason planning-save-disabled-reason planning-save-warning-confirm-hint",
    );

    expect(buildPlanningWorkspaceSaveButtonDescribedBy({
      preflightHasBlockers: false,
      saveBlockedByHealth: false,
      hasPreflightWarnings: false,
    })).toBeUndefined();
  });

  it("only allows arrival focus when the selected profile handoff is ready", () => {
    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: false,
      arrivalHandoffCompleted: false,
      arrivalHandoffCancelled: false,
      targetId: "planning-quickstart-run-cta",
      selectedProfileId: "profile-1",
    })).toBe(true);

    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: true,
      arrivalHandoffCompleted: false,
      arrivalHandoffCancelled: false,
      targetId: "planning-quickstart-run-cta",
      selectedProfileId: "profile-1",
    })).toBe(false);

    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: false,
      arrivalHandoffCompleted: true,
      arrivalHandoffCancelled: false,
      targetId: "planning-quickstart-run-cta",
      selectedProfileId: "profile-1",
    })).toBe(false);

    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: false,
      arrivalHandoffCompleted: false,
      arrivalHandoffCancelled: true,
      targetId: "planning-quickstart-run-cta",
      selectedProfileId: "profile-1",
    })).toBe(false);

    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: false,
      arrivalHandoffCompleted: false,
      arrivalHandoffCancelled: false,
      targetId: "planning-quickstart-run-cta",
      selectedProfileId: "profile-2",
    })).toBe(false);

    expect(shouldAutoFocusPlanningQuickStartTarget({
      initialArrivalProfileId: "profile-1",
      loadingProfiles: false,
      arrivalHandoffCompleted: false,
      arrivalHandoffCancelled: false,
      targetId: undefined,
      selectedProfileId: "profile-1",
    })).toBe(false);
  });

  it("marks arrival focus complete as soon as the target is actually focused", () => {
    expect(shouldCompletePlanningQuickStartFocusAttempt({
      moved: true,
      targetFocused: true,
    })).toBe(true);

    expect(shouldCompletePlanningQuickStartFocusAttempt({
      moved: true,
      targetFocused: false,
    })).toBe(false);
  });
});
