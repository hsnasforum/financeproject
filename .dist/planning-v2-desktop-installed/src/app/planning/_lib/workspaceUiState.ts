export type PlanningTabId = "summary" | "warningsGoals" | "actions" | "scenarios" | "monteCarlo" | "debt";

export type VisibleSectionFlags = {
  hasResult: boolean;
  hasActions: boolean;
  hasScenarios: boolean;
  hasMonteCarlo: boolean;
  hasDebt: boolean;
};

export type PlanningExecutionDefaults = {
  horizonMonths: string;
  runScenariosEnabled: boolean;
  runMonteCarloEnabled: boolean;
  runActionsEnabled: boolean;
  runDebtEnabled: boolean;
  runOptimizeEnabled: boolean;
  includeProducts: boolean;
  monteCarloPaths: string;
  monteCarloSeed: string;
  debtExtraPaymentKrw: string;
};

export function getVisibleSections(
  beginnerMode: boolean,
  flags: VisibleSectionFlags,
): PlanningTabId[] {
  if (!flags.hasResult) return [];

  const sections: PlanningTabId[] = ["summary", "warningsGoals"];
  if (flags.hasActions) sections.push("actions");
  if (flags.hasScenarios) sections.push("scenarios");
  if (!beginnerMode && flags.hasMonteCarlo) sections.push("monteCarlo");
  if (!beginnerMode && flags.hasDebt) sections.push("debt");
  return sections;
}

export function defaults(beginnerMode: boolean): PlanningExecutionDefaults {
  const safeDefaults: PlanningExecutionDefaults = {
    horizonMonths: "120",
    runScenariosEnabled: true,
    runMonteCarloEnabled: false,
    runActionsEnabled: true,
    runDebtEnabled: true,
    runOptimizeEnabled: false,
    includeProducts: false,
    monteCarloPaths: "500",
    monteCarloSeed: "12345",
    debtExtraPaymentKrw: "0",
  };

  if (beginnerMode) return safeDefaults;
  return safeDefaults;
}
