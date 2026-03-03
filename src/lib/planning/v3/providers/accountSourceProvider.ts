import { type AccountTransaction } from "../domain/types";

export type CsvColumnRef = string | number;

export type CsvAccountSourceInput = {
  csvText: string;
  mapping: {
    dateColumn: CsvColumnRef;
    amountColumn?: CsvColumnRef;
    inflowColumn?: CsvColumnRef;
    outflowColumn?: CsvColumnRef;
    descColumn?: CsvColumnRef;
    typeColumn?: CsvColumnRef;
    categoryColumn?: CsvColumnRef;
    delimiter?: "," | "\t" | ";";
    encoding?: "utf-8" | "euc-kr";
  };
  delimiter?: string;
  hasHeader?: boolean;
};

export type AccountSourceValidationIssue = {
  path: string;
  message: string;
  code: string;
};

export class AccountSourceValidationError extends Error {
  readonly issues: AccountSourceValidationIssue[];

  constructor(message: string, issues: AccountSourceValidationIssue[]) {
    super(message);
    this.name = "AccountSourceValidationError";
    this.issues = issues;
  }
}

export interface AccountSourceProvider<TInput = unknown> {
  id: string;
  loadTransactions(input: TInput): Promise<AccountTransaction[]>;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseColumnRef(
  ref: CsvColumnRef,
  headerMap: Map<string, number> | null,
  rowLength: number,
): number | null {
  if (typeof ref === "number" && Number.isInteger(ref) && ref >= 0 && ref < rowLength) {
    return ref;
  }
  if (typeof ref === "string" && headerMap) {
    const key = ref.trim().toLowerCase();
    const idx = headerMap.get(key);
    if (typeof idx === "number") return idx;
  }
  return null;
}
