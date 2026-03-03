"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken, withDevCsrf } from "@/lib/dev/clientCsrf";

type Batch = {
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

type Account = {
  id: string;
  name: string;
  kind: "checking" | "saving" | "card" | "cash" | "other";
  currency: "KRW";
  note?: string;
};

type SampleRow = {
  line: number;
  dateIso?: string;
  amountKrw?: number;
  descMasked?: string;
  ok: boolean;
  reason?: string;
};

type DetailResponse = {
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

type TransactionKind = "income" | "expense" | "transfer";
type TransactionCategory = "fixed" | "variable" | "saving" | "invest" | "unknown";

type TransactionRow = {
  txnId: string;
  date: string;
  amountKrw: number;
  description?: string;
  kind: TransactionKind;
  category: TransactionCategory;
};

type EvidenceRow = {
  key: string;
  title: string;
  formula?: string;
  inputs: Record<string, number | string>;
  assumption?: string;
  note?: string;
};

type CashflowMonthlyRow = {
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

type CashflowResponse = {
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

type DraftCreateResponse = {
  ok: true;
  id: string;
};

type DraftSplitMode = "byCategory" | "byRatio" | "noSplit";

type DraftCashflowRow = {
  ym: string;
  incomeKrw: number;
  expenseKrw: number;
  netKrw: number;
  txCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDetailResponse(payload: unknown): payload is DetailResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!isRecord(payload.batch) || !Array.isArray(payload.sample) || !isRecord(payload.stats) || !Array.isArray(payload.monthsSummary)) return false;
  return true;
}

function isTransactionRow(value: unknown): value is TransactionRow {
  if (!isRecord(value)) return false;
  if (!asString(value.txnId) || !asString(value.date)) return false;
  if (!Number.isFinite(Number(value.amountKrw))) return false;
  const kind = asString(value.kind);
  const category = asString(value.category);
  if (!["income", "expense", "transfer"].includes(kind)) return false;
  if (!["fixed", "variable", "saving", "invest", "unknown"].includes(category)) return false;
  return true;
}

function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) return false;
  if (!asString(value.id) || !asString(value.name)) return false;
  const kind = asString(value.kind);
  return ["checking", "saving", "card", "cash", "other"].includes(kind);
}

function isEvidenceRow(payload: unknown): payload is EvidenceRow {
  if (!isRecord(payload)) return false;
  if (!asString(payload.key) || !asString(payload.title)) return false;
  return isRecord(payload.inputs);
}

function isCashflowResponse(payload: unknown): payload is CashflowResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  if (!Array.isArray(payload.monthly) || !isRecord(payload.draftPatch) || !isRecord(payload.profilePatch)) return false;
  if (!Array.isArray(payload.draftPatch.evidence) || !payload.draftPatch.evidence.every(isEvidenceRow)) return false;
  return true;
}

function isDraftCreateResponse(payload: unknown): payload is DraftCreateResponse {
  if (!isRecord(payload) || payload.ok !== true) return false;
  return asString(payload.id).length > 0;
}

function buildCsrfQuery(): string {
  const csrf = readDevCsrfToken();
  if (!csrf) return "";
  return `?csrf=${encodeURIComponent(csrf)}`;
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatEvidenceInputs(inputs: Record<string, number | string>): string {
  const entries = Object.entries(inputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8);
  if (entries.length < 1) return "-";
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function buildSplitQuery(
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

function pickMonth(row: CashflowMonthlyRow): string {
  const month = asString(row.month);
  if (/^\d{4}-\d{2}$/.test(month)) return month;
  const ym = asString(row.ym);
  if (/^\d{4}-\d{2}$/.test(ym)) return ym;
  return "";
}

function toDraftCashflowRows(monthly: CashflowMonthlyRow[], fallbackTxCount: Map<string, number>): DraftCashflowRow[] {
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
        : (incomeKrw + expenseKrw);
      const txCount = Math.max(
        0,
        Math.trunc(asNumber(row.txCount || fallbackTxCount.get(ym) || 0)),
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

function buildAssumptions(
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

export function TransactionBatchDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountSaveLoading, setAccountSaveLoading] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [cashflowMessage, setCashflowMessage] = useState("");
  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [splitMode, setSplitMode] = useState<DraftSplitMode>("byCategory");
  const [excludeTransfers, setExcludeTransfers] = useState(true);
  const [fixedRatioPct, setFixedRatioPct] = useState(60);
  const [variableRatioPct, setVariableRatioPct] = useState(40);
  const [cashflowNonce, setCashflowNonce] = useState(0);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [txnKindDrafts, setTxnKindDrafts] = useState<Record<string, TransactionKind>>({});
  const [txnCategoryDrafts, setTxnCategoryDrafts] = useState<Record<string, TransactionCategory>>({});
  const [txnOverrideSavingId, setTxnOverrideSavingId] = useState("");
  const [txnOverrideMessage, setTxnOverrideMessage] = useState("");

  const batchMonthRange = useMemo(() => {
    const months = (detail?.monthsSummary ?? [])
      .map((row) => asString(row.ym))
      .filter((month) => /^\d{4}-\d{2}$/.test(month));
    if (months.length < 1) return "-";
    return `${months[0]} ~ ${months[months.length - 1]}`;
  }, [detail?.monthsSummary]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const ratioValid = splitMode !== "byRatio"
    || (
      Number.isFinite(fixedRatioPct)
      && Number.isFinite(variableRatioPct)
      && fixedRatioPct >= 0
      && variableRatioPct >= 0
      && fixedRatioPct <= 100
      && variableRatioPct <= 100
      && (fixedRatioPct + variableRatioPct === 100)
    );

  const hasBatchAccount = asString(detail?.batch.accountId).length > 0;

  const transferSummary = useMemo(() => {
    const monthly = cashflow?.monthly ?? [];
    let income = 0;
    let expense = 0;
    let transferIn = 0;
    let transferOut = 0;
    for (const row of monthly) {
      income += asNumber(row.totals?.incomeKrw ?? row.incomeKrw ?? row.inflowKrw);
      expense += asNumber(row.totals?.expenseKrw ?? row.expenseKrw);
      transferIn += asNumber(row.totals?.transferInKrw ?? row.transferInKrw);
      transferOut += asNumber(row.totals?.transferOutKrw ?? row.transferOutKrw);
    }
    return { income, expense, transferIn, transferOut };
  }, [cashflow?.monthly]);

  useEffect(() => {
    let disposed = false;

    async function loadDetail() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch(`/api/planning/v3/transactions/batches/${encodeURIComponent(id)}${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !isDetailResponse(payload)) {
          if (!disposed) {
            setDetail(null);
            setMessage("배치 상세를 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          const normalizedTransactions = Array.isArray(payload.transactions)
            ? payload.transactions.filter(isTransactionRow).map((row) => ({
              txnId: asString(row.txnId).toLowerCase(),
              date: asString(row.date),
              amountKrw: asNumber(row.amountKrw),
              ...(asString(row.description) ? { description: asString(row.description) } : {}),
              kind: asString(row.kind) as TransactionKind,
              category: asString(row.category) as TransactionCategory,
            }))
            : [];
          setDetail({
            ...payload,
            transactions: normalizedTransactions,
          });
          setTxnKindDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, row.kind]),
          ) as Record<string, TransactionKind>);
          setTxnCategoryDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, row.category]),
          ) as Record<string, TransactionCategory>);
          setSelectedAccountId(asString(payload.batch.accountId));
        }
      } catch {
        if (!disposed) {
          setDetail(null);
          setMessage("배치 상세를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void loadDetail();

    return () => {
      disposed = true;
    };
  }, [id]);

  useEffect(() => {
    let disposed = false;

    async function loadAccounts() {
      setAccountLoading(true);
      setAccountMessage("");
      try {
        const response = await fetch(`/api/planning/v3/accounts${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isRecord(payload) || payload.ok !== true || !Array.isArray(payload.items)) {
          if (!disposed) {
            setAccounts([]);
            setAccountMessage("계좌 목록을 불러오지 못했습니다.");
          }
          return;
        }
        if (!disposed) {
          const items = payload.items.filter(isAccount);
          setAccounts(items);
          if (items.length > 0) {
            setSelectedAccountId((prev) => prev || items[0].id);
          }
        }
      } catch {
        if (!disposed) {
          setAccounts([]);
          setAccountMessage("계좌 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setAccountLoading(false);
      }
    }

    void loadAccounts();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadCashflow() {
      if (!hasBatchAccount) {
        if (!disposed) {
          setCashflow(null);
          setCashflowMessage("배치 계좌를 먼저 선택해 주세요.");
          setCashflowLoading(false);
        }
        return;
      }

      setCashflowLoading(true);
      setCashflowMessage("");

      const splitQuery = buildSplitQuery(splitMode, fixedRatioPct, variableRatioPct, !excludeTransfers);
      const csrfQuery = buildCsrfQuery();
      const connector = csrfQuery ? "&" : "?";
      const url = `/api/planning/v3/transactions/batches/${encodeURIComponent(id)}/cashflow${csrfQuery}${connector}${splitQuery}`;

      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !isCashflowResponse(payload)) {
          if (!disposed) {
            setCashflow(null);
            setCashflowMessage("캐시플로우 집계를 불러오지 못했습니다.");
          }
          return;
        }

        if (!disposed) {
          setCashflow(payload);
          setDraftMessage("");
        }
      } catch {
        if (!disposed) {
          setCashflow(null);
          setCashflowMessage("캐시플로우 집계를 불러오지 못했습니다.");
        }
      } finally {
        if (!disposed) setCashflowLoading(false);
      }
    }

    void loadCashflow();

    return () => {
      disposed = true;
    };
  }, [id, splitMode, fixedRatioPct, variableRatioPct, excludeTransfers, cashflowNonce, hasBatchAccount]);

  async function saveBatchAccount() {
    if (!selectedAccountId || accountSaveLoading) return;
    setAccountSaveLoading(true);
    setAccountMessage("");

    try {
      const response = await fetch(`/api/planning/v3/transactions/batches/${encodeURIComponent(id)}/account`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          accountId: selectedAccountId,
        })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.batch)) {
        setAccountMessage("배치 계좌 연결에 실패했습니다.");
        return;
      }
      const batchPayload = payload.batch;

      const appliedAccountId = asString(batchPayload.accountId);
      if (!appliedAccountId) {
        setAccountMessage("배치 계좌 연결에 실패했습니다.");
        return;
      }

      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          batch: {
            ...prev.batch,
            accountId: appliedAccountId,
            accountHint: asString(batchPayload.accountHint) || appliedAccountId,
          },
        };
      });
      setSelectedAccountId(appliedAccountId);
      setCashflowNonce((value) => value + 1);
      setAccountMessage("배치 계좌를 연결했습니다.");
    } catch {
      setAccountMessage("배치 계좌 연결에 실패했습니다.");
    } finally {
      setAccountSaveLoading(false);
    }
  }

  async function createDraftAndGoToReview() {
    if (!detail || !cashflow) {
      setDraftMessage("드래프트 생성 대상 데이터가 없습니다.");
      return;
    }
    if (!asString(detail.batch.accountId)) {
      setDraftMessage("배치 계좌를 먼저 선택해 주세요.");
      return;
    }

    const txCountByMonth = new Map<string, number>();
    for (const row of detail.monthsSummary) {
      const month = asString(row.ym);
      if (!month) continue;
      txCountByMonth.set(month, Math.max(0, Math.trunc(asNumber(row.txCount))));
    }

    const draftCashflow = toDraftCashflowRows(cashflow.monthly, txCountByMonth);
    if (draftCashflow.length < 1) {
      setDraftMessage("저장할 월별 캐시플로우가 없습니다.");
      return;
    }

    const assumptions = buildAssumptions(
      splitMode,
      fixedRatioPct,
      variableRatioPct,
      cashflow.draftPatch.evidence,
    );

    const draftPatch = {
      monthlyIncomeNet: asNumber(cashflow.profilePatch.monthlyIncomeNet),
      monthlyEssentialExpenses: asNumber(cashflow.profilePatch.monthlyEssentialExpenses),
      monthlyDiscretionaryExpenses: asNumber(cashflow.profilePatch.monthlyDiscretionaryExpenses),
      assumptions,
      monthsConsidered: draftCashflow.length,
    };

    setDraftSaving(true);
    setDraftMessage("");

    try {
      const response = await fetch("/api/planning/v3/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          source: {
            kind: "csv",
            ...(asString(detail.batch.fileName) ? { filename: asString(detail.batch.fileName) } : {}),
            rows: Math.max(0, Math.trunc(asNumber(detail.stats.total))),
            months: draftCashflow.length,
          },
          cashflow: draftCashflow,
          draftPatch,
        })),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !isDraftCreateResponse(payload)) {
        setDraftMessage("드래프트 저장에 실패했습니다.");
        return;
      }

      router.push(`/planning/v3/drafts/${encodeURIComponent(payload.id)}`);
    } catch {
      setDraftMessage("드래프트 저장에 실패했습니다.");
    } finally {
      setDraftSaving(false);
    }
  }

  async function saveTxnOverride(txnId: string) {
    if (txnOverrideSavingId) return;
    const kind = txnKindDrafts[txnId];
    const category = txnCategoryDrafts[txnId];
    if (!kind || !category) {
      setTxnOverrideMessage("거래 분류값을 확인해 주세요.");
      return;
    }

    setTxnOverrideSavingId(txnId);
    setTxnOverrideMessage("");
    try {
      const response = await fetch("/api/planning/v3/transactions/overrides", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          txnId,
          kind,
          category,
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.override)) {
        setTxnOverrideMessage("거래 오버라이드 저장에 실패했습니다.");
        return;
      }

      const savedKind = asString(payload.override.kind);
      const savedCategory = asString(payload.override.category);
      if (!["income", "expense", "transfer"].includes(savedKind) || !["fixed", "variable", "saving", "invest", "unknown"].includes(savedCategory)) {
        setTxnOverrideMessage("거래 오버라이드 저장에 실패했습니다.");
        return;
      }

      setDetail((prev) => {
        if (!prev) return prev;
        const rows = (prev.transactions ?? []).map((row) => (
          row.txnId === txnId
            ? {
              ...row,
              kind: savedKind as TransactionKind,
              category: savedCategory as TransactionCategory,
            }
            : row
        ));
        return {
          ...prev,
          transactions: rows,
        };
      });
      setCashflowNonce((value) => value + 1);
      setTxnOverrideMessage("거래 분류 오버라이드를 저장했습니다.");
    } catch {
      setTxnOverrideMessage("거래 오버라이드 저장에 실패했습니다.");
    } finally {
      setTxnOverrideSavingId("");
    }
  }

  return (
    <PageShell>
      <div className="space-y-5" data-testid="v3-batch-detail">
        <Card className="space-y-3">
          <h1 className="text-xl font-black text-slate-900">Planning v3 Batch Detail</h1>
          <p className="text-sm text-slate-600">id: <span className="font-mono">{id}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/transactions">
              배치 목록
            </Link>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/accounts">
              계좌 관리
            </Link>
            <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/import">
              CSV Import
            </Link>
          </div>
          {message ? <p className="text-sm font-semibold text-rose-700">{message}</p> : null}
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-slate-600">상세를 불러오는 중...</p>
          </Card>
        ) : null}

        {detail ? (
          <>
            <Card className="space-y-2" data-testid="v3-batch-meta">
              <h2 className="text-sm font-bold text-slate-900">업로드/집계 상태</h2>
              <p className="text-sm text-slate-700">
                총 거래 {asNumber(detail.stats.total).toLocaleString("ko-KR")}건 / 파싱 성공 {asNumber(detail.stats.ok).toLocaleString("ko-KR")}건 / 파싱 실패 {asNumber(detail.stats.failed).toLocaleString("ko-KR")}건
              </p>
              <p className="text-sm text-slate-700" data-testid="v3-batch-range">
                기간 {batchMonthRange}
              </p>
              {asNumber(detail.stats.failed) > 0 ? (
                <p className="text-xs font-semibold text-amber-700">
                  일부 행은 형식 불일치로 제외되었습니다. 컬럼 매핑/금액 형식을 확인해 주세요.
                </p>
              ) : (
                <p className="text-xs font-semibold text-emerald-700">
                  파싱 실패 없이 집계되었습니다.
                </p>
              )}
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">계좌 선택</h2>
              <p className="text-xs text-slate-600">
                배치 집계/초안 생성은 계좌(accountId)가 연결된 상태에서만 진행됩니다.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-72 text-sm font-semibold text-slate-700">
                  거래 계좌
                  <select
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    data-testid="v3-batch-account-select"
                    disabled={accountLoading || accounts.length < 1}
                    onChange={(event) => {
                      setSelectedAccountId(event.currentTarget.value);
                      setAccountMessage("");
                    }}
                    value={selectedAccountId}
                  >
                    <option value="">선택</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.kind})
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  disabled={!selectedAccountId || accountSaveLoading}
                  onClick={() => {
                    void saveBatchAccount();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {accountSaveLoading ? "적용 중..." : "이 배치에 적용"}
                </Button>
                <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-2" href="/planning/v3/accounts">
                  계좌 관리
                </Link>
              </div>
              <p className="text-sm text-slate-700" data-testid="v3-batch-account-selected">
                선택 계좌: {selectedAccount ? `${selectedAccount.name} (${selectedAccount.id})` : "미선택"}
              </p>
              {accountMessage ? <p className="text-sm font-semibold text-slate-700">{accountMessage}</p> : null}
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Batch</h2>
              <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div><dt className="font-semibold">createdAt</dt><dd>{formatDateTime(detail.batch.createdAt)}</dd></div>
                <div><dt className="font-semibold">file</dt><dd>{detail.batch.fileName ?? "-"}</dd></div>
                <div><dt className="font-semibold">accountId</dt><dd className="font-mono text-xs">{detail.batch.accountId ?? "-"}</dd></div>
                <div><dt className="font-semibold">sha256</dt><dd className="font-mono text-xs">{detail.batch.sha256 ?? "-"}</dd></div>
                <div><dt className="font-semibold">total</dt><dd>{asNumber(detail.batch.total).toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">ok</dt><dd>{asNumber(detail.batch.ok).toLocaleString("ko-KR")}</dd></div>
                <div><dt className="font-semibold">failed</dt><dd>{asNumber(detail.batch.failed).toLocaleString("ko-KR")}</dd></div>
              </dl>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Sample (Redacted)</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">line</th>
                      <th className="px-3 py-2 text-left">date</th>
                      <th className="px-3 py-2 text-right">amount</th>
                      <th className="px-3 py-2 text-left">desc(masked)</th>
                      <th className="px-3 py-2 text-left">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.sample.length > 0 ? detail.sample.map((row, index) => (
                      <tr key={`sample-${index}-${row.line}`}>
                        <td className="px-3 py-2 text-slate-800">{asNumber(row.line)}</td>
                        <td className="px-3 py-2 text-slate-800">{asString(row.dateIso) || "-"}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{Number.isFinite(Number(row.amountKrw)) ? formatKrw(asNumber(row.amountKrw)) : "-"}</td>
                        <td className="px-3 py-2 text-slate-700">{asString(row.descMasked) || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={row.ok ? "success" : "destructive"}>{row.ok ? "OK" : "FAIL"}</Badge>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={5}>샘플이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">거래 목록 (수동 분류 정정)</h2>
              <p className="text-xs text-slate-600">
                kind/category 정정값은 오버라이드로 저장되며, 월별 집계 계산에 즉시 반영됩니다.
              </p>
              {txnOverrideMessage ? <p className="text-sm font-semibold text-slate-700">{txnOverrideMessage}</p> : null}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">date</th>
                      <th className="px-3 py-2 text-right">amount</th>
                      <th className="px-3 py-2 text-left">desc</th>
                      <th className="px-3 py-2 text-left">kind</th>
                      <th className="px-3 py-2 text-left">category</th>
                      <th className="px-3 py-2 text-left">action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detail.transactions ?? []).length > 0 ? (detail.transactions ?? []).map((row) => (
                      <tr data-testid={`v3-txn-row-${row.txnId}`} key={row.txnId}>
                        <td className="px-3 py-2 text-slate-800">{row.date}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(row.amountKrw)}</td>
                        <td className="px-3 py-2 text-slate-700">{asString(row.description) || "-"}</td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            data-testid={`v3-txn-kind-${row.txnId}`}
                            onChange={(event) => {
                              const next = event.currentTarget.value as TransactionKind;
                              setTxnKindDrafts((prev) => ({ ...prev, [row.txnId]: next }));
                            }}
                            value={txnKindDrafts[row.txnId] ?? row.kind}
                          >
                            <option value="income">income</option>
                            <option value="expense">expense</option>
                            <option value="transfer">transfer</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            data-testid={`v3-txn-category-${row.txnId}`}
                            onChange={(event) => {
                              const next = event.currentTarget.value as TransactionCategory;
                              setTxnCategoryDrafts((prev) => ({ ...prev, [row.txnId]: next }));
                            }}
                            value={txnCategoryDrafts[row.txnId] ?? row.category}
                          >
                            <option value="fixed">fixed</option>
                            <option value="variable">variable</option>
                            <option value="saving">saving</option>
                            <option value="invest">invest</option>
                            <option value="unknown">unknown</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            data-testid={`v3-txn-override-save-${row.txnId}`}
                            disabled={Boolean(txnOverrideSavingId && txnOverrideSavingId !== row.txnId)}
                            onClick={() => {
                              void saveTxnOverride(row.txnId);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {txnOverrideSavingId === row.txnId ? "저장 중..." : "저장"}
                          </Button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={6}>거래 목록이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">월별 요약</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">YYYY-MM</th>
                      <th className="px-3 py-2 text-right">income</th>
                      <th className="px-3 py-2 text-right">expense</th>
                      <th className="px-3 py-2 text-right">net</th>
                      <th className="px-3 py-2 text-right">txCount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.monthsSummary.length > 0 ? detail.monthsSummary.map((row) => (
                      <tr key={row.ym}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.ym}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.incomeKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.expenseKrw))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={5}>월별 요약이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">계좌별 월별 Net (읽기 전용)</h2>
              <p className="text-xs text-slate-600">
                초기잔액을 입력하기 전에는 실제 잔액(balance)을 계산할 수 없습니다. 현재는 월별 순유입(net)만 표시합니다.
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">account</th>
                      <th className="px-3 py-2 text-left">YYYY-MM</th>
                      <th className="px-3 py-2 text-right">net</th>
                      <th className="px-3 py-2 text-right">txCount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detail.accountMonthlyNet ?? []).length > 0 ? (detail.accountMonthlyNet ?? []).map((row, index) => (
                      <tr key={`${row.accountId}-${row.ym}-${index}`}>
                        <td className="px-3 py-2 text-slate-800">
                          {(accounts.find((account) => account.id === row.accountId)?.name ?? row.accountId)}
                        </td>
                        <td className="px-3 py-2 text-slate-800">{row.ym}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.netKrw))}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{asNumber(row.txCount).toLocaleString("ko-KR")}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td className="px-3 py-2 text-slate-500" colSpan={4}>계좌별 월 net 데이터가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {cashflowLoading ? (
              <Card>
                <p className="text-sm text-slate-600">재집계 캐시플로우를 계산하는 중...</p>
              </Card>
            ) : null}

            {cashflowMessage ? (
              <Card>
                <p className="text-sm font-semibold text-rose-700">{cashflowMessage}</p>
              </Card>
            ) : null}

            {cashflow ? (
              <>
                <Card className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">초안 생성 옵션</h2>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={excludeTransfers}
                      data-testid="v3-toggle-exclude-transfers"
                      onChange={(event) => {
                        setExcludeTransfers(event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    이체 제외
                  </label>
                  <div className="space-y-2 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        checked={splitMode === "byCategory"}
                        data-testid="v3-splitmode-byCategory"
                        name="v3-split-mode"
                        onChange={() => {
                          setSplitMode("byCategory");
                        }}
                        type="radio"
                      />
                      자동 분류 기반
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        checked={splitMode === "byRatio"}
                        data-testid="v3-splitmode-byRatio"
                        name="v3-split-mode"
                        onChange={() => {
                          setSplitMode("byRatio");
                        }}
                        type="radio"
                      />
                      수동 비율 입력
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        checked={splitMode === "noSplit"}
                        data-testid="v3-splitmode-noSplit"
                        name="v3-split-mode"
                        onChange={() => {
                          setSplitMode("noSplit");
                        }}
                        type="radio"
                      />
                      분할 안 함(전체 지출)
                    </label>
                  </div>

                  {splitMode === "byRatio" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        fixed %
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          data-testid="v3-ratio-fixed"
                          max={100}
                          min={0}
                          onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            const fixed = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
                            setFixedRatioPct(fixed);
                            setVariableRatioPct(100 - fixed);
                          }}
                          type="number"
                          value={fixedRatioPct}
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        variable %
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          data-testid="v3-ratio-variable"
                          max={100}
                          min={0}
                          onChange={(event) => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            const variable = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
                            setVariableRatioPct(variable);
                            setFixedRatioPct(100 - variable);
                          }}
                          type="number"
                          value={variableRatioPct}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={cashflowLoading || !ratioValid}
                      onClick={() => {
                        setCashflowNonce((value) => value + 1);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      초안 미리보기
                    </Button>
                    {ratioValid ? (
                      <p className="text-xs font-semibold text-slate-600">선택한 옵션으로 집계가 반영됩니다.</p>
                    ) : (
                      <p className="text-xs font-semibold text-rose-700">비율 합계는 100%여야 합니다.</p>
                    )}
                  </div>
                  <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                    <div>
                      <dt className="font-semibold">income</dt>
                      <dd data-testid="v3-summary-income">{formatKrw(transferSummary.income)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">expense</dt>
                      <dd data-testid="v3-summary-expense">{formatKrw(transferSummary.expense)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">transfer</dt>
                      <dd data-testid="v3-summary-transfer">
                        in {formatKrw(transferSummary.transferIn)} / out {formatKrw(transferSummary.transferOut)}
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card className="space-y-3" data-testid="v3-cashflow-table">
                  <h2 className="text-sm font-bold text-slate-900">월별 캐시플로우 v2</h2>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">YYYY-MM</th>
                          <th className="px-3 py-2 text-right">inflow</th>
                          <th className="px-3 py-2 text-right">outflow</th>
                          <th className="px-3 py-2 text-right">net</th>
                          <th className="px-3 py-2 text-right">fixed</th>
                          <th className="px-3 py-2 text-right">variable</th>
                          <th className="px-3 py-2 text-right">transfer</th>
                          <th className="px-3 py-2 text-right">days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cashflow.monthly.length > 0 ? cashflow.monthly.map((row, index) => (
                          <tr key={`${pickMonth(row) || "month"}-${index}`}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{pickMonth(row) || "-"}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.inflowKrw ?? row.incomeKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-800">{formatKrw(asNumber(row.outflowKrw ?? Math.abs(asNumber(row.expenseKrw))))}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatKrw(asNumber(row.netKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.fixedOutflowKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.variableOutflowKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{formatKrw(asNumber(row.transferNetKrw))}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{typeof row.daysCovered === "number" ? row.daysCovered : "-"}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td className="px-3 py-2 text-slate-500" colSpan={8}>월별 캐시플로우가 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="space-y-3" data-testid="v3-draftpatch-summary">
                  <h2 className="text-sm font-bold text-slate-900">초안 패치 요약</h2>
                  <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div><dt className="font-semibold">추천 월 소득</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyIncomeKrw))}</dd></div>
                    <div><dt className="font-semibold">추천 필수지출</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyEssentialSpendKrw))}</dd></div>
                    <div><dt className="font-semibold">추천 재량지출</dt><dd>{formatKrw(asNumber(cashflow.draftPatch.suggestedMonthlyDiscretionarySpendKrw))}</dd></div>
                    <div><dt className="font-semibold">confidence</dt><dd className="uppercase">{asString(cashflow.draftPatch.confidence) || "-"}</dd></div>
                  </dl>

                  <div className="space-y-2" data-testid="v3-draftpatch-evidence">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">evidence</h3>
                    <ul className="space-y-1 text-sm text-slate-700">
                      {cashflow.draftPatch.evidence.length > 0 ? cashflow.draftPatch.evidence.map((item, index) => (
                        <li key={`evidence-${index}-${item.key}`}>
                          <p className="font-semibold">{item.title}</p>
                          {asString(item.formula) ? <p className="text-xs text-slate-600">{item.formula}</p> : null}
                          <p className="text-xs text-slate-600">{formatEvidenceInputs(item.inputs)}</p>
                          {asString(item.assumption) ? <p className="text-xs text-slate-500">assumption: {item.assumption}</p> : null}
                        </li>
                      )) : (
                        <li>근거가 없습니다.</li>
                      )}
                    </ul>
                  </div>
                </Card>

                <Card className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">Draft 리뷰</h2>
                  <p className="text-sm text-slate-700">
                    현재 집계 결과로 v3 Draft를 생성한 뒤 리뷰 페이지에서 merged profile 미리보기 및 JSON export를 진행할 수 있습니다.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      data-testid="v3-go-draft-review"
                      disabled={!ratioValid || draftSaving || !hasBatchAccount}
                      onClick={() => {
                        void createDraftAndGoToReview();
                      }}
                      size="sm"
                      type="button"
                    >
                      {draftSaving ? "Draft 생성 중..." : "Draft 리뷰로 이동"}
                    </Button>
                    {draftMessage ? <p className="text-sm font-semibold text-slate-700">{draftMessage}</p> : null}
                  </div>
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
