import { AsyncLocalStorage } from "node:async_hooks";

export type PlanningUserScope = {
  userId: string;
};

const planningUserScope = new AsyncLocalStorage<PlanningUserScope>();

export function getScopedPlanningUserId(): string | undefined {
  return planningUserScope.getStore()?.userId;
}

export function runWithPlanningUserScope<T>(scope: PlanningUserScope, callback: () => T): T {
  return planningUserScope.run(scope, callback);
}

export function enterPlanningUserScope(scope: PlanningUserScope): void {
  planningUserScope.enterWith(scope);
}
