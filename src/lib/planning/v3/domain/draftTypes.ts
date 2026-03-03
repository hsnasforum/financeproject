import { type CategoryId, type ProfileV2DraftPatch } from "./types";

export type DraftProfileEvidence = {
  monthsUsed: string[];
  ymStats: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    fixedExpenseKrw: number;
    variableExpenseKrw: number;
    debtExpenseKrw: number;
    transferKrw: number;
  }>;
  byCategoryStats: Array<{
    categoryId: CategoryId;
    totalKrw: number;
  }>;
  medians: {
    incomeKrw: number;
    expenseKrw: number;
    fixedExpenseKrw: number;
    variableExpenseKrw: number;
    debtExpenseKrw: number;
  };
  ruleCoverage: {
    total: number;
    override: number;
    rule: number;
    default: number;
    transfer: number;
  };
};

export type DraftProfileRecord = {
  id: string;
  batchId: string;
  createdAt: string;
  draftPatch: ProfileV2DraftPatch;
  evidence: DraftProfileEvidence;
  assumptions: string[];
  stats?: {
    months: number;
    transfersExcluded?: boolean;
    unassignedCount?: number;
  };
};
