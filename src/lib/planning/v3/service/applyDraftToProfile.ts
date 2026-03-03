import { loadCanonicalProfile } from "../../v2/loadCanonicalProfile";
import { type ProfileV2 } from "../../v2/types";
import { type V3DraftRecord } from "../domain/draft";

type ApplyDraftToProfileInput = {
  baseProfile: ProfileV2;
  draft: V3DraftRecord;
};

type ApplyDraftToProfileResult = {
  merged: ProfileV2;
  summary: {
    changedFields: string[];
    notes: string[];
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function collectAssumptions(patch: Record<string, unknown>): string[] {
  const raw = Array.isArray(patch.assumptions) ? patch.assumptions : [];
  return raw
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

export function applyDraftToProfile(input: ApplyDraftToProfileInput): ApplyDraftToProfileResult {
  const base = loadCanonicalProfile(input.baseProfile).profile;
  const patch = input.draft.draftPatch ?? {};

  const merged: ProfileV2 = {
    ...base,
    ...(asNumber(patch.monthlyIncomeNet) !== null ? { monthlyIncomeNet: asNumber(patch.monthlyIncomeNet) as number } : {}),
    ...(asNumber(patch.monthlyEssentialExpenses) !== null
      ? { monthlyEssentialExpenses: asNumber(patch.monthlyEssentialExpenses) as number }
      : {}),
    ...(asNumber(patch.monthlyDiscretionaryExpenses) !== null
      ? { monthlyDiscretionaryExpenses: asNumber(patch.monthlyDiscretionaryExpenses) as number }
      : {}),
  };

  const candidateFields: Array<keyof ProfileV2> = [
    "monthlyDiscretionaryExpenses",
    "monthlyEssentialExpenses",
    "monthlyIncomeNet",
  ];
  const changedFields = candidateFields
    .filter((field) => JSON.stringify(base[field]) !== JSON.stringify(merged[field]))
    .map((field) => String(field))
    .sort((left, right) => left.localeCompare(right));

  const notes = [
    ...collectAssumptions(patch),
    ...(typeof patch.monthsConsidered === "number" && Number.isFinite(patch.monthsConsidered)
      ? [`monthsConsidered=${Math.max(0, Math.trunc(patch.monthsConsidered))}`]
      : []),
    ...(input.draft.cashflow.length > 0 ? [`cashflowMonths=${input.draft.cashflow.length}`] : []),
  ];

  return {
    merged,
    summary: {
      changedFields,
      notes,
    },
  };
}

