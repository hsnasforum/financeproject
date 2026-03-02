import mockDeposit from "../../data/finlife/mock-deposit.json";
import mockSaving from "../../data/finlife/mock-saving.json";
import { type FinlifeKind } from "./types";

export function fetchMockFinlife(kind: FinlifeKind): unknown {
  if (kind === "deposit") return mockDeposit;
  if (kind === "saving") return mockSaving;
  return { result: { baseList: [], optionList: [] } };
}

export function fetchMockFinlifeCompany(): unknown {
  return { result: { baseList: [] } };
}
