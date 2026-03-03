import { type CategoryId } from "./types";

export type BatchSummary = {
  batchId: string;
  createdAt?: string;
  range?: {
    fromYm?: string;
    toYm?: string;
    months?: number;
  };
  counts: {
    txns: number;
    transfers: number;
    unassignedCategory: number;
  };
  totals: {
    incomeKrw: number;
    expenseKrw: number;
    transferKrw: number;
  };
  topExpenseCategories: Array<{
    categoryId: CategoryId;
    totalKrw: number;
  }>;
  monthly: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    transferKrw: number;
  }>;
};

