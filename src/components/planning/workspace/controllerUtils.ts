export function buildPlanningWorkspaceRunButtonDescribedBy(input: {
  preflightHasBlockers: boolean;
  hasPreflightWarnings: boolean;
}): string | undefined {
  return [
    input.preflightHasBlockers ? "planning-preflight-block-reason" : "",
    input.hasPreflightWarnings ? "planning-run-warning-confirm-hint" : "",
  ].filter((item) => item.length > 0).join(" ") || undefined;
}

export function shouldAutoFocusPlanningQuickStartTarget(input: {
  initialArrivalProfileId: string;
  loadingProfiles: boolean;
  arrivalHandoffCompleted: boolean;
  arrivalHandoffCancelled: boolean;
  targetId?: string;
  selectedProfileId: string;
}): boolean {
  if (!input.initialArrivalProfileId) return false;
  if (input.loadingProfiles) return false;
  if (input.arrivalHandoffCompleted || input.arrivalHandoffCancelled) return false;
  if (!input.targetId) return false;
  return input.selectedProfileId === input.initialArrivalProfileId;
}

export function shouldCompletePlanningQuickStartFocusAttempt(input: {
  moved: boolean;
  targetFocused: boolean;
}): boolean {
  return input.moved && input.targetFocused;
}
