export type WorkspaceAdvancedExecutionOptions = {
  runScenariosEnabled: boolean;
  runMonteCarloEnabled: boolean;
  runActionsEnabled: boolean;
  runDebtEnabled: boolean;
  runOptimizeEnabled: boolean;
  includeProducts: boolean;
};

export function transitionWorkspaceExecutionOptionsForMode(input: {
  beginnerMode: boolean;
  wasBeginnerMode: boolean;
  current: WorkspaceAdvancedExecutionOptions;
  snapshot: WorkspaceAdvancedExecutionOptions | null;
}): {
  nextState?: WorkspaceAdvancedExecutionOptions;
  nextSnapshot: WorkspaceAdvancedExecutionOptions | null;
} {
  if (input.beginnerMode === input.wasBeginnerMode) {
    return {
      nextSnapshot: input.snapshot,
    };
  }

  if (input.beginnerMode) {
    return {
      nextState: {
        ...input.current,
        runScenariosEnabled: true,
        runMonteCarloEnabled: false,
        runActionsEnabled: true,
        runDebtEnabled: true,
        runOptimizeEnabled: false,
        includeProducts: false,
      },
      nextSnapshot: input.current,
    };
  }

  return {
    nextState: input.snapshot ?? input.current,
    nextSnapshot: null,
  };
}
