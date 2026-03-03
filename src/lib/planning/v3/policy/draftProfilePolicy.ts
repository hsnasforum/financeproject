import { type CategoryId } from "../domain/types";

export type DraftProfilePolicy = {
  recentMonths: number;
  fixedCategoryIds: CategoryId[];
};

export const DRAFT_PROFILE_POLICY: DraftProfilePolicy = {
  recentMonths: 6,
  fixedCategoryIds: [
    "fixed",
    "housing",
    "insurance",
    "tax",
    "debt",
  ],
};

