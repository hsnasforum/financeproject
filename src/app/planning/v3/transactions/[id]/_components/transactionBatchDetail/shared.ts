import { readDevCsrfToken } from "@/lib/dev/clientCsrf";

export type Batch = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  accountId?: string;
  accountHint?: string;
  sha256?: string;
  total: number;
  ok: number;
  failed: number;
};

export type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other";
  currency: "KRW";
  note?: string;
};

export type SampleRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

export type DetailResponse = {
  ok: true;
  batch: Batch;
  sample: SampleRow[];
  stats: {
    total: number;
    ok: number;
    failed: number;
    inferredMonths?: number;
  };
  monthsSummary: Array<{
    ym: string;
    incomeKrw: number;
    expenseKrw: number;
    netKrw: number;
    txCount: number;
  }>;
  accountMonthlyNet?: Array<{
    accountId: string;
    ym: string;
    netKrw: number;
    txCount: number;
  }>;
  transactions?: TransactionRow[];
};

export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionKindOverride = TransactionKind | "auto";
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
export type TransactionCategory = CategoryId | "saving" | "invest";

export type TransactionRow = {
  batchId?: string;
  txnId: string;
  accountId?: string;
  date: string;
  amountKrw: number;
  description?: string;
  kind: TransactionKind;
  category: TransactionCategory;
  categoryId?: CategoryId;
  categorySource?: "override" | "rule" | "default" | "transfer";
  transferGroupId?: string;
  transferConfidence?: "high" | "medium" | "low";
};

export type BreakdownRow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  transferKrw: number;
  byCategory: Record<string, number>;
};

export type CategorizedResponse = {
  ok: true;
  meta: Record<string, unknown>;
  data: Array<{
    batchId: string;
    txnId: string;
    accountId: string;
    date: string;
    amountKrw: number;
    kind: TransactionKind;
    description?: string;
    transferGroupId?: string;
    transferConfidence?: "high" | "medium" | "low";
    categoryId: CategoryId;
    categorySource: "override" | "rule" | "default" | "transfer";
  }>;
  breakdown: BreakdownRow[];
};

export type EvidenceRow = {
  key: string;
  title: string;
  formula?: string;
  inputs: Record<string, number | string>;
  assumption?: string;
  note?: string;
};

export type CashflowMonthlyRow = {
  month?: string;
  ym?: string;
  inflowKrw?: number;
  outflowKrw?: number;
  incomeKrw?: number;
  expenseKrw?: number;
  transferInKrw?: number;
  transferOutKrw?: number;
  netKrw: number;
  fixedOutflowKrw: number;
  variableOutflowKrw: number;
  transferNetKrw?: number;
  totals?: {
    incomeKrw: number;
    expenseKrw: number;
    transferInKrw: number;
    transferOutKrw: number;
    netKrw: number;
  };
  includeTransfers?: boolean;
  daysCovered?: number;
  txCount?: number;
  notes?: string[];
};

export type CashflowResponse = {
  ok: true;
  monthly: CashflowMonthlyRow[];
  draftPatch: {
    suggestedMonthlyIncomeKrw: number;
    suggestedMonthlyEssentialSpendKrw: number;
    suggestedMonthlyDiscretionarySpendKrw: number;
    confidence: "high" | "mid" | "low";
    splitMode: "byCategory" | "byRatio" | "noSplit";
    fixedRatio?: number;
    variableRatio?: number;
    evidence: EvidenceRow[];
  };
  profilePatch: {
    monthlyIncomeNet: number;
    monthlyEssentialExpenses: number;
    monthlyDiscretionaryExpenses: number;
  };
};

export type DraftCreateResponse = {
  ok: true;
  id: string;
};

export type DraftSplitMode = "byCategory" | "byRatio" | "noSplit";

export type DraftCashflowRow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
};

export const CATEGORY_OPTIONS: TransactionCategory[] = [
  "income",
  "transfer",
  "fixed",
  "variable",
  "debt",
  "tax",
  "insurance",
  "housing",
  "food",
  "transport",
  "shopping",
  "health",
  "education",
  "etc",
  "unknown",
  "saving",
  "invest",
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isDetailResponse(payload: unknown): payload is DetailResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (
    !isRecord(payload.batch)
    || !Array.isArray(payload.sample)
    || !isRecord(payload.stats)
    || !Array.isArray(payload.monthsSummary)
  ) {
    return false;
  }
  return true;
}

export function isTransactionRow(value: unknown): value is TransactionRow {
  if (!isRecord(value)) return false;
  if (!asString(value.txnId) || !asString(value.date)) return false;
  if (!Number.isFinite(Number(value.amountKrw))) return false;
  const kind = asString(value.kind);
  const category = asString(value.category);
  if (!["income", "expense", "transfer"].includes(kind)) return false;
  if (!CATEGORY_OPTIONS.includes(category as TransactionCategory)) return false;
  return true;
}

export function isCategorizedResponse(payload: unknown): payload is CategorizedResponse {
  if (
    !isRecord(payload)
    || payload.ok !== true
    || !isRecord(payload.meta)
    || !Array.isArray(payload.data)
    || !Array.isArray(payload.breakdown)
  ) {
    return false;
  }
  return true;
}

export function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.name)) return false;
  const kind = asString(value.kind);
  return ["checking", "saving", "card", "cash", "other"].includes(kind);
}

export function isEvidenceRow(payload: unknown): payload is EvidenceRow {
  if (!isRecord(payload)) return false;
  if (!asString(payload.key) || !asString(payload.title)) return false;
  return isRecord(payload.inputs);
}

export function isCashflowResponse(payload: unknown): payload is CashflowResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!Array.isArray(payload.monthly) || !isRecord(payload.draftPatch) || !isRecord(payload.profilePatch)) {
    return false;
  }
  return Array.isArray(payload.draftPatch.evidence) && payload.draftPatch.evidence.every(isEvidenceRow);
}

export function isDraftCreateResponse(payload: unknown): payload is DraftCreateResponse {
  return isRecord(payload) && payload.ok === true && asString(payload.id).length > 0;
}

export function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

export function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

export function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatEvidenceInputs(inputs: Record<string, number | string>): string {
  const entries = Object.entries(inputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8);
  if (entries.length < 1) return "-";
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

export function buildSplitQuery(
  splitMode: DraftSplitMode,
  fixedRatioPct: number,
  variableRatioPct: number,
  includeTransfers: boolean,
): string {
  const params = new URLSearchParams();
  params.set("splitMode", splitMode);
  params.set("includeTransfers", includeTransfers ? "true" : "false");
  if (splitMode === "byRatio") {
    params.set("fixedRatio", String(fixedRatioPct / 100));
    params.set("variableRatio", String(variableRatioPct / 100));
  }
  return params.toString();
}

export function pickMonth(row: CashflowMonthlyRow): string {
  const month = asString(row.month);
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  const ym = asString(row.ym);
  if (/^\d{4}-\d{2}$/.test(ym)) return ym;
  return "";
}

export function toDraftCashflowRows(monthly: CashflowMonthlyRow[], fallbackTxCount: Map<string, number>): DraftCashflowRow[] {
  return monthly
    .map((row) => {
      const ym = pickMonth(row);
      if (!ym) return null;

      const incomeKrw = asNumber(row.incomeKrw ?? row.inflowKrw);
      const outflowKrw = Math.abs(asNumber(row.outflowKrw));
      const expenseFromRow = asNumber(row.expenseKrw);
      const expenseKrw = Number.isFinite(expenseFromRow) && expenseFromRow !== 0
        ? expenseFromRow
        : -outflowKrw;
      const netFromRow = asNumber(row.netKrw);
      const netKrw = Number.isFinite(netFromRow) && netFromRow !== 0
        ? netFromRow
        : incomeKrw + expenseKrw;
      const txCount = Math.max(
        0,
        Math.trunc(asNumber(row.txCount ?? fallbackTxCount.get(ym) ?? 0)),
      );

      return {
        ym,
        incomeKrw,
        expenseKrw,
        netKrw,
        txCount,
      };
    })
    .filter((row): row is DraftCashflowRow => Boolean(row));
}

export function buildAssumptions(
  splitMode: DraftSplitMode,
  fixedRatioPct: number,
  variableRatioPct: number,
  evidence: EvidenceRow[],
): string[] {
  const rows: string[] = [];
  rows.push(`split mode=${splitMode}`);
  if (splitMode === "byRatio") {
    rows.push(`ratio fixed=${fixedRatioPct}% variable=${variableRatioPct}%`);
  }

  for (const item of evidence) {
    const assumption = asString(item.assumption);
    if (assumption) rows.push(assumption.slice(0, 120));

    const formula = asString(item.formula);
    if (formula) rows.push(`rule: ${formula.slice(0, 120)}`);
  }

  return [...new Set(rows.filter((item) => item.length > 0))].slice(0, 20);
}

export function buildOverrideRefreshMessage(label: string): string {
  return `${label} 저장했습니다. 아래 카테고리 집계와 캐시플로우는 자동으로 다시 계산됩니다.`;
}

export function isTransferRow(row: TransactionRow): boolean {
  return row.kind === "transfer" || asString(row.transferGroupId).length > 0;
}

export function getTransferOverrideButtonLabel(row: TransactionRow): string {
  return isTransferRow(row) ? "일반으로 저장" : "이체로 저장";
}
