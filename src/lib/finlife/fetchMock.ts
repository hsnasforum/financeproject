import mockDeposit from "@/data/finlife/mock-deposit.json";
import mockSaving from "@/data/finlife/mock-saving.json";
import { type FinlifeKind } from "@/lib/finlife/types";

export function fetchMockFinlife(kind: FinlifeKind): unknown {
  return kind === "deposit" ? mockDeposit : mockSaving;
}
