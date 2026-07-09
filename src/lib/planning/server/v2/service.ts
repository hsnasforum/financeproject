import {
  createPlanningService as createPlanningCoreService,
  type PlanningServiceDependencies,
} from "../../core/v2/service";
import { createFileAssumptionsProvider } from "../../providers/assumptionsProvider";
import { createDebtStrategyProvider } from "../../providers/debtStrategyProvider";
import { createFinlifeProductCandidatesProvider } from "../../providers/productCandidatesProvider";
import { createPlaceholderTaxPensionProvider } from "../../providers/taxPensionProvider";

export {
  createPlanningService as createPlanningCoreService,
  type PlanningServiceDependencies,
} from "../../core/v2/service";

export type PlanningServiceDependencyOverrides = Partial<PlanningServiceDependencies>;

export function createPlanningService(deps: PlanningServiceDependencyOverrides = {}) {
  return createPlanningCoreService({
    assumptionsProvider: deps.assumptionsProvider ?? createFileAssumptionsProvider(),
    productCandidatesProvider: deps.productCandidatesProvider ?? createFinlifeProductCandidatesProvider(),
    debtStrategyProvider: deps.debtStrategyProvider ?? createDebtStrategyProvider(),
    taxPensionProvider: deps.taxPensionProvider ?? createPlaceholderTaxPensionProvider(),
  });
}
