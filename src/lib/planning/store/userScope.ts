import { AsyncLocalStorage } from "node:async_hooks";

export type PlanningUserScope = Readonly<{
  userId: string;
  authSource?: string;
}>;

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

function snapshotPlanningUserScope(scope: PlanningUserScope): PlanningUserScope {
  const snapshot: PlanningUserScope = typeof scope.authSource === "string"
    ? { userId: scope.userId, authSource: scope.authSource }
    : { userId: scope.userId };
  return Object.freeze(snapshot);
}

export function runWithPlanningUserScope<T>(scope: PlanningUserScope, callback: () => T): T {
  return planningUserScope.run(snapshotPlanningUserScope(scope), callback);
}
