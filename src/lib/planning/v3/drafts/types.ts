import { type MonthlyCashflow, type ProfileDraftPatch } from "../domain/types";

export type DraftId = string;

export type PlanningV3DraftMeta = {
  rows: number;
  months: number;
};

export type PlanningV3Draft = {
  id: DraftId;
  createdAt: string;
  source: "csv";
  meta: PlanningV3DraftMeta;
  cashflow: MonthlyCashflow[];
  draftPatch: ProfileDraftPatch;
};

