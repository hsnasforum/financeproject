export type AccountTransaction = {
  txnId?: string;
  accountId?: string;
  kind?: "income" | "expense" | "transfer";
  transfer?: {
    direction: "out" | "in";
    counterpartyAccountId?: string;
    matchedTxnId?: string;
    confidence: "high" | "medium" | "low";
  };
  category?: "fixed" | "variable" | "saving" | "invest" | "unknown";
  classificationReason?: string;
  matchedRuleId?: string;
  date: string;
  amountKrw: number;
  description?: string;
  source: "csv";
  meta?: {
    rowIndex: number;
  };
};

export type TxnOverride = {
  txnId: string;
  kind?: "income" | "expense" | "transfer";
  category?: "fixed" | "variable" | "saving" | "invest" | "unknown";
  updatedAt: string;
};

export type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other" | "bank" | "broker";
  currency: "KRW";
  note?: string;
  createdAt?: string;
  startingBalanceKrw?: number;
};

export type AccountV3 = {
  accountId: string;
  name: string;
  currency: "KRW";
  kind?: "cash" | "bank" | "card" | "broker";
  createdAt: string;
};

export type OpeningBalance = {
  accountId: string;
  asOfDate: string;
  amountKrw: number;
};

export type TransferCandidate = {
  fromAccountId?: string;
  toAccountId?: string;
  txnId: string;
  reason: string;
};

export type TransactionCategory = "income" | "fixed" | "variable" | "transfer" | "unknown";

export type CategorizedTransaction = Omit<AccountTransaction, "category"> & {
  category: TransactionCategory;
  categoryReason?: string;
  matchedRuleId?: string;
};

export type MonthlyCashflow = {
  month?: string;
  inflowKrw?: number;
  outflowKrw?: number;
  fixedOutflowKrw?: number;
  variableOutflowKrw?: number;
  transferNetKrw?: number;
  transferInKrw?: number;
  transferOutKrw?: number;
  totals?: {
    incomeKrw: number;
    expenseKrw: number;
    transferInKrw: number;
    transferOutKrw: number;
    netKrw: number;
  };
  includeTransfers?: boolean;
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
  daysCovered?: number;
  notes?: string[];
};

export type MonthlyAccountBalance = {
  ym: string;
  accountId: string;
  startingBalanceKrw?: number;
  netKrw: number;
  endBalanceKrw?: number;
  hasStartingBalance: boolean;
};

export type MonthlyAccountBalanceTimeline = {
  ym: string;
  accountId: string;
  openingKrw: number;
  netChangeKrw: number;
  closingKrw: number;
  transferKrw?: number;
};

export type EvidenceRow = {
  key: string;
  title: string;
  formula?: string;
  inputs: Record<string, number | string>;
  assumption?: string;
  note?: string;
};

export type DraftSplitMode = "byCategory" | "byRatio" | "noSplit";

export type CashflowDraftPatch = {
  suggestedMonthlyIncomeKrw: number;
  suggestedMonthlyEssentialSpendKrw: number;
  suggestedMonthlyDiscretionarySpendKrw: number;
  confidence: "high" | "mid" | "low";
  splitMode: DraftSplitMode;
  fixedRatio?: number;
  variableRatio?: number;
  evidence: EvidenceRow[];
};

export type ProfileV2DraftPatch = {
  monthlyIncomeNet: number;
  monthlyEssentialExpenses: number;
  monthlyDiscretionaryExpenses: number;
  assumptions: string[];
  monthsConsidered: number;
};

// Backward-compatible alias used by existing v3 wrappers/tests.
export type ProfileDraftPatch = ProfileV2DraftPatch;
