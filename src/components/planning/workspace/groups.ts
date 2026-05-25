import type { PlanningWorkspaceController } from "@/components/planning/workspace/usePlanningWorkspaceController";

export type PlanningWorkspaceGroups = PlanningWorkspaceController;
export type PlanningWorkspaceQuickStartGroup = PlanningWorkspaceGroups["quickStart"];
export type PlanningWorkspaceProfileGroup = PlanningWorkspaceGroups["profile"];
export type PlanningWorkspaceExecutionGroup = PlanningWorkspaceGroups["execution"];
export type PlanningWorkspaceResultsGroup = PlanningWorkspaceGroups["results"];
export type PlanningWorkspaceDialogsGroup = PlanningWorkspaceGroups["dialogs"];
export type PlanningWorkspaceActions = PlanningWorkspaceGroups["actions"];
