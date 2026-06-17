import { AsyncLocalStorage } from "node:async_hooks";

export type PlanningUserScope = {
  userId: string;
  authSource?: string;
};

const planningUserScope = new AsyncLocalStorage<PlanningUserScope>();

export function getScopedPlanningUserScope(): PlanningUserScope | undefined {
  return planningUserScope.getStore();
}

export function getScopedPlanningUserId(): string | undefined {
  return getScopedPlanningUserScope()?.userId;
}

export function getScopedPlanningAuthSource(): string | undefined {
  return getScopedPlanningUserScope()?.authSource;
}

export function runWithPlanningUserScope<T>(scope: PlanningUserScope, callback: () => T): T {
  return planningUserScope.run(scope, callback);
}

export function enterPlanningUserScope(scope: PlanningUserScope): void {
  planningUserScope.enterWith(scope);
}
