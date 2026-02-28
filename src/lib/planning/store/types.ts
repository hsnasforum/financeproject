import { type ActionItemV2 } from "../v2/actions/types";
import { type RefiOffer } from "../v2/debt/types";
import { type AllocationPolicyId } from "../v2/policy/types";
import { type AssumptionsV2 } from "../v2/scenarios";
import { type ProfileV2 } from "../v2/types";

export type PlanningProfileRecord = {
  version: 1;
  id: string;
  name: string;
  profile: ProfileV2;
  createdAt: string;
  updatedAt: string;
};

export type PlanningRunRecord = {
  version: 1;
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  input: {
    horizonMonths: number;
    policyId?: AllocationPolicyId;
    snapshotId?: string;
    assumptionsOverride?: Partial<AssumptionsV2>;
    runScenarios?: boolean;
    getActions?: boolean;
    analyzeDebt?: boolean;
    debtStrategy?: {
      offers?: RefiOffer[];
      options?: {
        extraPaymentKrw?: number;
        compareTermsMonths?: number[];
      };
    };
    includeProducts?: boolean;
    monteCarlo?: { paths?: number; seed?: number };
  };
  meta: {
    snapshot?: {
      id?: string;
      asOf?: string;
      fetchedAt?: string;
      missing?: boolean;
      warningsCount?: number;
      sourcesCount?: number;
    };
    health?: {
      warningsCodes: string[];
      criticalCount: number;
      snapshotStaleDays?: number;
    };
  };
  outputs: {
    simulate?: {
      summary: Record<string, unknown>;
      warnings: string[];
      goalsStatus: unknown;
      keyTimelinePoints: unknown;
    };
    scenarios?: {
      table: unknown;
      shortWhyByScenario: unknown;
    };
    monteCarlo?: {
      probabilities: unknown;
      percentiles: unknown;
      notes: string[];
    };
    actions?: {
      actions: ActionItemV2[];
    };
    debtStrategy?: {
      summary: {
        debtServiceRatio?: number;
        totalMonthlyPaymentKrw?: number;
        warningsCount?: number;
      };
      warnings: Array<{ code: string; message: string }>;
      summaries: unknown;
      refinance?: unknown;
      whatIf?: unknown;
    };
  };
};
