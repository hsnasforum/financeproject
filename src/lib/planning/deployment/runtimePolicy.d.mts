import type {
  PlanningDeploymentPolicyDecision,
  PlanningDeploymentPolicyInput,
} from "./policy.mjs";

export const PLANNING_RUNTIME_ATTESTATION: "desktop-launcher-v1";

export function isDesktopLocalDeploymentRequested(env?: NodeJS.ProcessEnv): boolean;
export function normalizePlanningRuntimePolicyInput(
  env?: NodeJS.ProcessEnv,
): PlanningDeploymentPolicyInput;
export function resolvePlanningRuntimePolicy(
  env?: NodeJS.ProcessEnv,
): PlanningDeploymentPolicyDecision;

export class PlanningRuntimePolicyError extends Error {
  readonly code: Exclude<PlanningDeploymentPolicyDecision, { ok: true }>["code"];
  readonly conflicts: readonly string[];
  constructor(decision: Exclude<PlanningDeploymentPolicyDecision, { ok: true }>);
}

export function assertPlanningRuntimePolicy(
  env?: NodeJS.ProcessEnv,
): Extract<PlanningDeploymentPolicyDecision, { ok: true }>;
