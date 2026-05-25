"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import {
  asNumber,
  asString,
  buildAssumptions,
  buildCsrfQuery,
  buildOverrideRefreshMessage,
  buildSplitQuery,
  CATEGORY_OPTIONS,
  type Account,
  type BreakdownRow,
  type CashflowResponse,
  type DetailResponse,
  type DraftSplitMode,
  getTransferOverrideButtonLabel,
  isAccount,
  isCategorizedResponse,
  isCashflowResponse,
  isDetailResponse,
  isDraftCreateResponse,
  isRecord,
  isTransactionRow,
  type TransactionCategory,
  type TransactionKind,
  type TransactionKindOverride,
  type TransactionRow,
  toDraftCashflowRows,
} from "./shared";

type TransactionBatchDetailControllerInput = {
  id: string;
};

type TransactionBatchDetailTopSurface = {
  id: string;
  loading: boolean;
  message: string;
};

type TransactionBatchDetailOverview = {
  detail: DetailResponse | null;
  batchMonthRange: string;
};

type TransactionBatchDetailTransferOverview = {
  transferCount: number;
  unassignedCount: number;
  expenseInclTransfer: number;
  expenseExclTransfer: number;
};

type TransactionBatchDetailAccountBinding = {
  accounts: Account[];
  accountLoading: boolean;
  selectedAccountId: string;
  selectedAccount: Account | null;
  accountMessage: string;
  accountSaveLoading: boolean;
  onSelectedAccountIdChange: (value: string) => void;
  onSaveBatchAccount: () => Promise<void>;
};

type TransactionBatchDetailOverrides = {
  accounts: Account[];
  breakdownRows: BreakdownRow[];
  categorizedLoading: boolean;
  categorizedMessage: string;
  txnKindDrafts: Record<string, TransactionKindOverride>;
  txnCategoryDrafts: Record<string, TransactionCategory>;
  txnAccountDrafts: Record<string, string>;
  txnOverrideSavingId: string;
  txnTransferSavingId: string;
  txnAccountSavingId: string;
  txnOverrideMessage: string;
  categoryOptions: TransactionCategory[];
  getTransferOverrideButtonLabel: typeof getTransferOverrideButtonLabel;
  onTxnAccountChange: (txnId: string, value: string) => void;
  onSaveTxnAccountOverride: (txnId: string) => Promise<void>;
  onSaveTxnTransferOverride: (txnId: string, nextTransfer: boolean) => Promise<void>;
  onTxnKindChange: (txnId: string, value: TransactionKindOverride) => void;
  onTxnCategoryChange: (txnId: string, value: TransactionCategory) => void;
  onSaveTxnOverride: (txnId: string) => Promise<void>;
};

type TransactionBatchDetailCashflow = {
  cashflowLoading: boolean;
  cashflowMessage: string;
  cashflow: CashflowResponse | null;
  splitMode: DraftSplitMode;
  excludeTransfers: boolean;
  fixedRatioPct: number;
  variableRatioPct: number;
  ratioValid: boolean;
  transferSummary: {
    income: number;
    expense: number;
    transferIn: number;
    transferOut: number;
  };
  onExcludeTransfersChange: (value: boolean) => void;
  onSplitModeChange: (value: DraftSplitMode) => void;
  onFixedRatioChange: (value: number) => void;
  onVariableRatioChange: (value: number) => void;
  onPreviewDraft: () => void;
};

type TransactionBatchDetailDraftReview = {
  hasBatchAccount: boolean;
  ratioValid: boolean;
  draftSaving: boolean;
  draftMessage: string;
  onCreateDraftAndGoToReview: () => Promise<void>;
};

export type TransactionBatchDetailController = {
  topSurface: TransactionBatchDetailTopSurface;
  overview: TransactionBatchDetailOverview;
  accountBinding: TransactionBatchDetailAccountBinding;
  transferOverview: TransactionBatchDetailTransferOverview;
  overrides: TransactionBatchDetailOverrides;
  cashflow: TransactionBatchDetailCashflow;
  draftReview: TransactionBatchDetailDraftReview;
};

export function useTransactionBatchDetailController({
  id,
}: TransactionBatchDetailControllerInput): TransactionBatchDetailController {
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
  const [txnKindDrafts, setTxnKindDrafts] = useState<Record<string, TransactionKindOverride>>({});
  const [txnCategoryDrafts, setTxnCategoryDrafts] = useState<Record<string, TransactionCategory>>({});
  const [txnAccountDrafts, setTxnAccountDrafts] = useState<Record<string, string>>({});
  const [txnOverrideSavingId, setTxnOverrideSavingId] = useState("");
  const [txnTransferSavingId, setTxnTransferSavingId] = useState("");
  const [txnAccountSavingId, setTxnAccountSavingId] = useState("");
  const [txnOverrideMessage, setTxnOverrideMessage] = useState("");
  const [breakdownRows, setBreakdownRows] = useState<BreakdownRow[]>([]);
  const [categorizedLoading, setCategorizedLoading] = useState(false);
  const [categorizedMessage, setCategorizedMessage] = useState("");

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
      && fixedRatioPct + variableRatioPct === 100
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

  const transferOverview = useMemo(() => {
    const rows = detail?.transactions ?? [];
    let transferCount = 0;
    let unassignedCount = 0;
    let expenseInclTransfer = 0;
    let expenseExclTransfer = 0;
    for (const row of rows) {
      const isTransfer = row.kind === "transfer" || asString(row.transferGroupId).length > 0;
      const accountId = asString(row.accountId) || "unassigned";
      if (accountId === "unassigned") unassignedCount += 1;
      if (isTransfer) transferCount += 1;
      if (row.amountKrw < 0) {
        const magnitude = Math.abs(row.amountKrw);
        expenseInclTransfer += magnitude;
        if (!isTransfer) expenseExclTransfer += magnitude;
      }
    }
    return { transferCount, unassignedCount, expenseInclTransfer, expenseExclTransfer };
  }, [detail?.transactions]);

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
                accountId: asString(row.accountId) || "unassigned",
                date: asString(row.date),
                amountKrw: asNumber(row.amountKrw),
                ...(asString(row.description) ? { description: asString(row.description) } : {}),
                kind: asString(row.kind) as TransactionKind,
                category: asString(row.category) as TransactionCategory,
                ...(asString(row.transferGroupId) ? { transferGroupId: asString(row.transferGroupId) } : {}),
              }))
            : [];
          setDetail({
            ...payload,
            transactions: normalizedTransactions,
          });
          setTxnKindDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, row.kind]),
          ) as Record<string, TransactionKindOverride>);
          setTxnCategoryDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, row.category]),
          ) as Record<string, TransactionCategory>);
          setTxnAccountDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, asString(row.accountId) || "unassigned"]),
          ));
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

    async function loadCategorized() {
      setCategorizedLoading(true);
      setCategorizedMessage("");
      try {
        const response = await fetch(`/api/planning/v3/transactions/batches/${encodeURIComponent(id)}/categorized${buildCsrfQuery()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !isCategorizedResponse(payload)) {
          if (!disposed) {
            setBreakdownRows([]);
            setCategorizedMessage("카테고리 집계를 다시 불러오지 못했습니다. 오버라이드 저장 후였다면 아래 월별 집계를 다시 확인해 주세요.");
          }
          return;
        }

        if (!disposed) {
          const normalizedTransactions: TransactionRow[] = payload.data.map((row) => ({
            batchId: asString(row.batchId),
            txnId: asString(row.txnId).toLowerCase(),
            accountId: asString(row.accountId) || "unassigned",
            date: asString(row.date),
            amountKrw: asNumber(row.amountKrw),
            ...(asString(row.description) ? { description: asString(row.description) } : {}),
            kind: row.kind,
            category: row.categoryId,
            categoryId: row.categoryId,
            categorySource: row.categorySource,
            ...(asString(row.transferGroupId) ? { transferGroupId: asString(row.transferGroupId) } : {}),
            ...(row.transferConfidence ? { transferConfidence: row.transferConfidence } : {}),
          }));
          setDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              transactions: normalizedTransactions,
            };
          });
          setTxnCategoryDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, row.category]),
          ) as Record<string, TransactionCategory>);
          setTxnAccountDrafts(Object.fromEntries(
            normalizedTransactions.map((row) => [row.txnId, asString(row.accountId) || "unassigned"]),
          ));
          setBreakdownRows(payload.breakdown.map((row) => ({
            ym: asString(row.ym),
            incomeKrw: asNumber(row.incomeKrw),
            expenseKrw: asNumber(row.expenseKrw),
            transferKrw: asNumber(row.transferKrw),
            byCategory: isRecord(row.byCategory)
              ? Object.fromEntries(Object.entries(row.byCategory).map(([key, value]) => [key, asNumber(value)]))
              : {},
          })));
        }
      } catch {
        if (!disposed) {
          setBreakdownRows([]);
          setCategorizedMessage("카테고리 집계를 다시 불러오지 못했습니다. 오버라이드 저장 후였다면 아래 월별 집계를 다시 확인해 주세요.");
        }
      } finally {
        if (!disposed) setCategorizedLoading(false);
      }
    }

    void loadCategorized();

    return () => {
      disposed = true;
    };
  }, [id, cashflowNonce]);

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
            setSelectedAccountId((previous) => previous || items[0].id);
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
      setAccountMessage("배치 계좌를 연결했습니다. 아래 캐시플로우는 자동으로 다시 계산됩니다.");
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
    const currentRow = (detail?.transactions ?? []).find((row) => row.txnId === txnId);
    const category = txnCategoryDrafts[txnId] ?? currentRow?.category;
    const kind = txnKindDrafts[txnId] ?? currentRow?.kind ?? "auto";
    if (!category && kind === "auto") {
      setTxnOverrideMessage("거래 분류값을 확인해 주세요.");
      return;
    }
    const batchId = asString(detail?.batch.id || id);
    if (!batchId) {
      setTxnOverrideMessage("batchId를 확인할 수 없습니다.");
      return;
    }

    setTxnOverrideSavingId(txnId);
    setTxnOverrideMessage("");
    try {
      const response = await fetch(`/api/planning/v3/batches/${encodeURIComponent(batchId)}/txn-overrides`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          txnId,
          kind,
          ...(category ? { categoryId: category } : {}),
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
        setTxnOverrideMessage("거래 오버라이드 저장에 실패했습니다.");
        return;
      }

      if (payload.data.deleted === true) {
        setCashflowNonce((value) => value + 1);
        setTxnOverrideMessage("거래 분류 오버라이드를 초기화했습니다. 아래 카테고리 집계와 캐시플로우는 자동으로 다시 계산됩니다.");
        return;
      }

      const savedKind = asString(payload.data.kind) as TransactionKind;
      const savedCategory = asString(payload.data.categoryId || payload.data.category);

      setDetail((prev) => {
        if (!prev) return prev;
        const rows: TransactionRow[] = (prev.transactions ?? []).map((row): TransactionRow => {
          if (row.txnId !== txnId) return row;
          return {
            ...row,
            ...(savedKind === "income" || savedKind === "expense" || savedKind === "transfer"
              ? { kind: savedKind }
              : {}),
            ...(CATEGORY_OPTIONS.includes(savedCategory as TransactionCategory)
              ? {
                  category: savedCategory as TransactionCategory,
                  categoryId: savedCategory as TransactionRow["categoryId"],
                }
              : {}),
            categorySource: "override",
          };
        });
        return {
          ...prev,
          transactions: rows,
        };
      });
      setCashflowNonce((value) => value + 1);
      setTxnOverrideMessage(buildOverrideRefreshMessage("거래 분류 오버라이드를"));
    } catch {
      setTxnOverrideMessage("거래 오버라이드 저장에 실패했습니다.");
    } finally {
      setTxnOverrideSavingId("");
    }
  }

  async function saveTxnAccountOverride(txnId: string) {
    if (txnAccountSavingId) return;
    const batchId = asString(detail?.batch.id || id);
    const accountId = asString(txnAccountDrafts[txnId]) || "unassigned";
    if (!batchId) {
      setTxnOverrideMessage("batchId를 확인할 수 없습니다.");
      return;
    }

    setTxnAccountSavingId(txnId);
    setTxnOverrideMessage("");
    try {
      const response = await fetch("/api/planning/v3/transactions/account-overrides", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          batchId,
          txnId,
          accountId,
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.override)) {
        setTxnOverrideMessage("거래 계좌 매핑 저장에 실패했습니다.");
        return;
      }
      setCashflowNonce((value) => value + 1);
      setTxnOverrideMessage(buildOverrideRefreshMessage("거래 계좌 매핑을"));
    } catch {
      setTxnOverrideMessage("거래 계좌 매핑 저장에 실패했습니다.");
    } finally {
      setTxnAccountSavingId("");
    }
  }

  async function saveTxnTransferOverride(txnId: string, nextTransfer: boolean) {
    if (txnTransferSavingId) return;
    const batchId = asString(detail?.batch.id || id);
    if (!batchId) {
      setTxnOverrideMessage("batchId를 확인할 수 없습니다.");
      return;
    }

    setTxnTransferSavingId(txnId);
    setTxnOverrideMessage("");
    try {
      const response = await fetch("/api/planning/v3/transactions/transfer-overrides", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(withDevCsrf({
          batchId,
          txnId,
          ...(nextTransfer ? { forceTransfer: true } : { forceNonTransfer: true }),
        })),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.override)) {
        setTxnOverrideMessage("이체 판정 저장에 실패했습니다.");
        return;
      }
      setCashflowNonce((value) => value + 1);
      setTxnOverrideMessage(buildOverrideRefreshMessage("이체 판정을"));
    } catch {
      setTxnOverrideMessage("이체 판정 저장에 실패했습니다.");
    } finally {
      setTxnTransferSavingId("");
    }
  }

  return {
    topSurface: {
      id,
      loading,
      message,
    },
    overview: {
      detail,
      batchMonthRange,
    },
    accountBinding: {
      accounts,
      accountLoading,
      selectedAccountId,
      selectedAccount,
      accountMessage,
      accountSaveLoading,
      onSelectedAccountIdChange: (value) => {
        setSelectedAccountId(value);
        setAccountMessage("");
      },
      onSaveBatchAccount: saveBatchAccount,
    },
    transferOverview,
    overrides: {
      accounts,
      breakdownRows,
      categorizedLoading,
      categorizedMessage,
      txnKindDrafts,
      txnCategoryDrafts,
      txnAccountDrafts,
      txnOverrideSavingId,
      txnTransferSavingId,
      txnAccountSavingId,
      txnOverrideMessage,
      categoryOptions: CATEGORY_OPTIONS,
      getTransferOverrideButtonLabel,
      onTxnAccountChange: (txnId, value) => {
        setTxnAccountDrafts((prev) => ({ ...prev, [txnId]: value }));
      },
      onSaveTxnAccountOverride: saveTxnAccountOverride,
      onSaveTxnTransferOverride: saveTxnTransferOverride,
      onTxnKindChange: (txnId, value) => {
        setTxnKindDrafts((prev) => ({ ...prev, [txnId]: value }));
      },
      onTxnCategoryChange: (txnId, value) => {
        setTxnCategoryDrafts((prev) => ({ ...prev, [txnId]: value }));
      },
      onSaveTxnOverride: saveTxnOverride,
    },
    cashflow: {
      cashflowLoading,
      cashflowMessage,
      cashflow,
      splitMode,
      excludeTransfers,
      fixedRatioPct,
      variableRatioPct,
      ratioValid,
      transferSummary,
      onExcludeTransfersChange: setExcludeTransfers,
      onSplitModeChange: setSplitMode,
      onFixedRatioChange: (value) => {
        const fixed = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
        setFixedRatioPct(fixed);
        setVariableRatioPct(100 - fixed);
      },
      onVariableRatioChange: (value) => {
        const variable = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
        setVariableRatioPct(variable);
        setFixedRatioPct(100 - variable);
      },
      onPreviewDraft: () => {
        setCashflowNonce((value) => value + 1);
      },
    },
    draftReview: {
      hasBatchAccount,
      ratioValid,
      draftSaving,
      draftMessage,
      onCreateDraftAndGoToReview: createDraftAndGoToReview,
    },
  };
}
