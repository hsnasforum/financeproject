import { type ActionItemV2 } from "../v2/actions/types";
import { type RefiOffer } from "../v2/debt/types";
import { type AllocationPolicyId } from "../v2/policy/types";
import { type ResultDtoV1 } from "../v2/resultDto";
import { type AssumptionsV2 } from "../v2/scenarios";
import { type ProfileV2 } from "../v2/types";
import { type ScenarioMeta } from "../v2/scenario";
import { type PlanningInterpretationPolicy } from "../catalog/planningPolicy";
import { type AssumptionsOverrideEntry } from "../assumptions/overrides";
import { type ProfileNormalizationDisclosure } from "../v2/normalizationDisclosure";

export type PlanningRunOverallStatus = "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
export type PlanningRunActionStatus = "todo" | "doing" | "done" | "snoozed";

export type PlanningRunStageId = "simulate" | "scenarios" | "monteCarlo" | "actions" | "debt";

export type PlanningRunStageStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

export type PlanningRunStageReason =
  | "OPTION_DISABLED"
  | "SERVER_DISABLED"
  | "HEALTH_BLOCKED"
  | "BUDGET_EXCEEDED"
  | "PREREQ_FAILED"
  | "STAGE_ERROR";

export type PlanningRunStageResult = {
  id: PlanningRunStageId;
  status: PlanningRunStageStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  reason?: PlanningRunStageReason;
  errorSummary?: string;
  outputRef?: {
    key: string;
    hasData: boolean;
    ref?: {
      name: string;
      path: string;
      sizeBytes?: number;
    };
  };
};

export type PlanningRunBlobRef = {
  ref: {
    name: string;
    path: string;
    sizeBytes?: number;
  };
};

export type PlanningRunActionPlanItem = {
  actionKey: string;
  sourceActionId?: string;
  title: string;
  description: string;
  steps: string[];
  href?: string;
};

export type PlanningRunActionPlan = {
  version: 1;
  runId: string;
  generatedAt: string;
  items: PlanningRunActionPlanItem[];
};

export type PlanningRunActionProgressItem = {
  actionKey: string;
  status: PlanningRunActionStatus;
  note?: string;
  updatedAt: string;
};

export type PlanningRunActionProgress = {
  version: 1;
  runId: string;
  updatedAt: string;
  items: PlanningRunActionProgressItem[];
};

export type PlanningProfileRecord = {
  version: 1;
  // Canonical schema for planning profile payload.
  schemaVersion?: 2;
  id: string;
  name: string;
  profile: ProfileV2;
  createdAt: string;
  updatedAt: string;
};

export type PlanningProfileMeta = {
  profileId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
};

export type PlanningRunRecord = {
  version: 1;
  // Canonical schema for planning run payload.
  schemaVersion?: 2;
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  scenario?: ScenarioMeta;
  overallStatus?: PlanningRunOverallStatus;
  stages?: PlanningRunStageResult[];
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
    normalization?: ProfileNormalizationDisclosure;
    health?: {
      warningsCodes: string[];
      criticalCount: number;
      snapshotStaleDays?: number;
    };
  };
  reproducibility?: {
    appVersion: string;
    engineVersion: string;
    profileHash: string;
    assumptionsSnapshotId?: string;
    assumptionsHash?: string;
    effectiveAssumptionsHash?: string;
    appliedOverrides?: AssumptionsOverrideEntry[];
    policy: PlanningInterpretationPolicy;
  };
  outputs: {
    resultDto?: ResultDtoV1;
    simulate?: PlanningRunBlobRef & {
      summary?: Record<string, unknown>;
      warnings?: string[];
      goalsStatus?: unknown;
      keyTimelinePoints?: unknown;
    };
    scenarios?: PlanningRunBlobRef & {
      table?: unknown;
      shortWhyByScenario?: unknown;
    };
    monteCarlo?: PlanningRunBlobRef & {
      probabilities?: unknown;
      percentiles?: unknown;
      notes?: string[];
    };
    actions?: PlanningRunBlobRef & {
      actions?: ActionItemV2[];
    };
    debtStrategy?: PlanningRunBlobRef & {
      summary?: {
        debtServiceRatio?: number;
        totalMonthlyPaymentKrw?: number;
        warningsCount?: number;
      };
      warnings?: Array<{ code: string; message: string }>;
      summaries?: unknown;
      refinance?: unknown;
      whatIf?: unknown;
    };
  };
};
