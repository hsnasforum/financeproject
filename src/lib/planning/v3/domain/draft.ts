import { type MonthlyCashflow, type ProfileV2DraftPatch } from "./types";

export type V3DraftSource = {
  kind: "csv";
  filename?: string;
  rows?: number;
  months?: number;
};

export type V3DraftSummary = {
  medianIncomeKrw?: number;
  medianExpenseKrw?: number;
  avgNetKrw?: number;
  notes?: string[];
};

export type V3DraftRecord = {
  id: string;
  createdAt: string;
  source: V3DraftSource;
  cashflow: MonthlyCashflow[];
  draftPatch: ProfileV2DraftPatch;
  summary: V3DraftSummary;
};
