import { describe, expect, it } from "vitest";
import {
  transitionWorkspaceExecutionOptionsForMode,
  type WorkspaceAdvancedExecutionOptions,
} from "../../../src/components/PlanningWorkspaceClient";

function executionOptionsFixture(
  overrides?: Partial<WorkspaceAdvancedExecutionOptions>,
): WorkspaceAdvancedExecutionOptions {
  return {
    runScenariosEnabled: false,
    runMonteCarloEnabled: true,
    runActionsEnabled: false,
    runDebtEnabled: false,
    runOptimizeEnabled: true,
    includeProducts: true,
    ...overrides,
  };
}

describe("PlanningWorkspaceClient mode transition", () => {
  it("stores advanced options and applies beginner defaults when entering beginner mode", () => {
    const advanced = executionOptionsFixture();

    const transition = transitionWorkspaceExecutionOptionsForMode({
      beginnerMode: true,
      wasBeginnerMode: false,
      current: advanced,
      snapshot: null,
    });

    expect(transition.nextSnapshot).toEqual(advanced);
    expect(transition.nextState).toEqual({
      ...advanced,
      runScenariosEnabled: true,
      runMonteCarloEnabled: false,
      runActionsEnabled: true,
      runDebtEnabled: true,
      runOptimizeEnabled: false,
      includeProducts: false,
    });
  });

  it("restores saved advanced options when leaving beginner mode", () => {
    const snapshot = executionOptionsFixture();

    const transition = transitionWorkspaceExecutionOptionsForMode({
      beginnerMode: false,
      wasBeginnerMode: true,
      current: executionOptionsFixture({
        runScenariosEnabled: true,
        runMonteCarloEnabled: false,
        runActionsEnabled: true,
        runDebtEnabled: true,
        runOptimizeEnabled: false,
        includeProducts: false,
      }),
      snapshot,
    });

    expect(transition.nextState).toEqual(snapshot);
    expect(transition.nextSnapshot).toBeNull();
  });
});
