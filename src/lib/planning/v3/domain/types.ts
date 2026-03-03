export type CategoryId =
  | "income"
  | "transfer"
  | "fixed"
  | "variable"
  | "debt"
  | "tax"
  | "insurance"
  | "housing"
  | "food"
  | "transport"
  | "shopping"
  | "health"
  | "education"
  | "etc"
  | "unknown";

export type CategoryRule = {
  id: string;
  categoryId: CategoryId;
  match: {
    type: "contains";
    value: string;
  };
  priority: number;
  enabled: boolean;
  note?: string;
};

export type AccountTransaction = {
  txnId?: string;
  accountId?: string;
  transferGroupId?: string;
  kind?: "income" | "expense" | "transfer";
  transfer?: {
    direction: "out" | "in";
    counterpartyAccountId?: string;
    matchedTxnId?: string;
    confidence: "high" | "medium" | "low";
  };
  category?: CategoryId | "saving" | "invest";
  categoryId?: CategoryId;
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
  batchId?: string;
  txnId: string;
  kind?: "income" | "expense" | "transfer";
  category?: CategoryId | "saving" | "invest";
  categoryId?: CategoryId;
  updatedAt: string;
  note?: string;
};

export type TransferDetectionResult = {
  groupId: string;
  debitTxnId: string;
  creditTxnId: string;
  amountKrw: number;
  ym: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type TxnTransferOverride = {
  batchId: string;
  txnId: string;
  forceTransfer?: boolean;
  forceNonTransfer?: boolean;
  updatedAt: string;
  note?: string;
};

export type AccountMappingOverride = {
  batchId: string;
  txnId: string;
  accountId: string;
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

export type CategorizedTransactionRow = AccountTransaction & {
  batchId?: string;
  categoryId: CategoryId;
  categorySource: "override" | "rule" | "default" | "transfer";
};

export type MonthlyCashflowBreakdown = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  transferKrw: number;
  byCategory: Record<CategoryId, number>;
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
