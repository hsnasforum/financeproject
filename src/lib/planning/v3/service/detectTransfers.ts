import {
  type AccountTransaction,
  type TransferDetectionResult,
  type TxnTransferOverride,
} from "../domain/types";

type DetectTransfersInput = {
  batchId: string;
  transactions: AccountTransaction[];
  overridesByTxnId?: Record<string, TxnTransferOverride>;
  allowAdjacentDate?: boolean;
};

type CandidatePair = {
  debitIndex: number;
  creditIndex: number;
  debitTxnId: string;
  creditTxnId: string;
  dateDiffDays: number;
  amountDiffKrw: number;
  isOverride: boolean;
  reason: string;
};

type TransferAnnotated = {
  detections: TransferDetectionResult[];
  txnIdToTransferGroupId: Record<string, string>;
  transactions: AccountTransaction[];
  candidateCount: number;
  unassignedCount: number;
};

type IndexedTxn = {
  index: number;
  txnId: string;
  date: string;
  amountKrw: number;
  accountId: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTxnId(value: unknown, fallbackIndex: number): string {
  const raw = asString(value).toLowerCase();
  if (raw) return raw;
  return `__idx_${String(fallbackIndex).padStart(6, "0")}`;
}

function normalizeAccountId(value: unknown): string {
  return asString(value) || "unassigned";
}

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ts = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ts) ? ts : null;
}

function dateDiffDays(leftDate: string, rightDate: string): number {
  const left = parseDate(leftDate);
  const right = parseDate(rightDate);
  if (left === null || right === null) return Number.MAX_SAFE_INTEGER;
  return Math.abs(Math.round((left - right) / 86_400_000));
}

function isForcedTransfer(override: TxnTransferOverride | undefined): boolean {
  return override?.forceTransfer === true;
}

function isForcedNonTransfer(override: TxnTransferOverride | undefined): boolean {
  return override?.forceNonTransfer === true;
}

function byTxnOrder(left: IndexedTxn, right: IndexedTxn): number {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  return left.txnId.localeCompare(right.txnId);
}

function canNaturalMatch(
  debit: IndexedTxn,
  credit: IndexedTxn,
  maxDiffDays: number,
): { ok: true; reason: string } | { ok: false } {
  if (Math.abs(debit.amountKrw) !== Math.abs(credit.amountKrw)) return { ok: false };

  const diffDays = dateDiffDays(debit.date, credit.date);
  if (diffDays > maxDiffDays) return { ok: false };

  const sameAccount = debit.accountId === credit.accountId;
  const bothUnassigned = debit.accountId === "unassigned" && credit.accountId === "unassigned";
  if (sameAccount && !bothUnassigned) return { ok: false };

  if (bothUnassigned) {
    return { ok: true, reason: diffDays === 0 ? "same-date-equal-amount-unassigned" : "adjacent-date-equal-amount-unassigned" };
  }
  return { ok: true, reason: diffDays === 0 ? "same-date-equal-amount" : "adjacent-date-equal-amount" };
}

function compareCandidates(left: CandidatePair, right: CandidatePair): number {
  if (left.isOverride !== right.isOverride) {
    return left.isOverride ? 1 : -1;
  }
  if (left.dateDiffDays !== right.dateDiffDays) {
    return left.dateDiffDays - right.dateDiffDays;
  }
  if (left.amountDiffKrw !== right.amountDiffKrw) {
    return left.amountDiffKrw - right.amountDiffKrw;
  }
  if (left.creditTxnId !== right.creditTxnId) {
    return left.creditTxnId.localeCompare(right.creditTxnId);
  }
  return left.debitTxnId.localeCompare(right.debitTxnId);
}

function pickConfidence(input: {
  reason: string;
  debit: IndexedTxn;
  credit: IndexedTxn;
  diffDays: number;
  isOverride: boolean;
}): "high" | "medium" | "low" {
  if (input.isOverride || input.reason === "override") return "low";
  const bothAssigned = input.debit.accountId !== "unassigned" && input.credit.accountId !== "unassigned";
  if (input.diffDays === 0 && bothAssigned && input.debit.accountId !== input.credit.accountId) {
    return "high";
  }
  if (input.debit.accountId === "unassigned" && input.credit.accountId === "unassigned") {
    return "low";
  }
  return "medium";
}

function withTransferTag(
  tx: AccountTransaction,
  groupId: string,
  direction: "out" | "in",
  matchedTxnId: string,
  counterpartyAccountId: string,
  confidence: "high" | "medium" | "low",
  reason: string,
): AccountTransaction {
  return {
    ...tx,
    kind: "transfer",
    category: "transfer",
    categoryId: "transfer",
    transferGroupId: groupId,
    classificationReason: `rule:${reason}`,
    transfer: {
      direction,
      ...(counterpartyAccountId ? { counterpartyAccountId } : {}),
      ...(matchedTxnId ? { matchedTxnId } : {}),
      confidence,
    },
  };
}

export function detectTransfers(input: DetectTransfersInput): TransferAnnotated {
  const maxDiffDays = input.allowAdjacentDate === false ? 0 : 1;
  const overridesByTxnId = input.overridesByTxnId ?? {};

  const normalized = input.transactions.map((tx, index): AccountTransaction => ({
    ...tx,
    txnId: normalizeTxnId(tx.txnId, index),
    accountId: normalizeAccountId(tx.accountId),
  }));

  const indexed: IndexedTxn[] = normalized.map((tx, index) => ({
    index,
    txnId: asString(tx.txnId).toLowerCase(),
    date: asString(tx.date),
    amountKrw: Math.round(Number(tx.amountKrw) || 0),
    accountId: normalizeAccountId(tx.accountId),
  }));

  const debits = indexed
    .filter((tx) => tx.amountKrw < 0)
    .sort(byTxnOrder);
  const credits = indexed
    .filter((tx) => tx.amountKrw > 0)
    .sort(byTxnOrder);

  const usedDebitIds = new Set<string>();
  const usedCreditIds = new Set<string>();
  const detections: TransferDetectionResult[] = [];
  const txnIdToTransferGroupId: Record<string, string> = {};
  let candidateCount = 0;

  function tryMatch(debit: IndexedTxn): CandidatePair | null {
    if (usedDebitIds.has(debit.txnId)) return null;
    const debitOverride = overridesByTxnId[debit.txnId];
    if (isForcedNonTransfer(debitOverride)) return null;

    const candidates: CandidatePair[] = [];
    for (const credit of credits) {
      if (usedCreditIds.has(credit.txnId)) continue;
      const creditOverride = overridesByTxnId[credit.txnId];
      if (isForcedNonTransfer(creditOverride)) continue;

      const natural = canNaturalMatch(debit, credit, maxDiffDays);
      const forced = isForcedTransfer(debitOverride) || isForcedTransfer(creditOverride);
      if (!natural.ok && !forced) continue;

      const diffDays = dateDiffDays(debit.date, credit.date);
      candidates.push({
        debitIndex: debit.index,
        creditIndex: credit.index,
        debitTxnId: debit.txnId,
        creditTxnId: credit.txnId,
        dateDiffDays: diffDays,
        amountDiffKrw: Math.abs(Math.abs(debit.amountKrw) - Math.abs(credit.amountKrw)),
        isOverride: !natural.ok && forced,
        reason: natural.ok ? natural.reason : "override",
      });
    }

    candidateCount += candidates.length;
    if (candidates.length < 1) return null;
    candidates.sort(compareCandidates);
    return candidates[0] ?? null;
  }

  function appendDetection(pair: CandidatePair): void {
    const debit = indexed[pair.debitIndex];
    const credit = indexed[pair.creditIndex];
    if (!debit || !credit) return;
    if (usedDebitIds.has(debit.txnId) || usedCreditIds.has(credit.txnId)) return;

    usedDebitIds.add(debit.txnId);
    usedCreditIds.add(credit.txnId);
    const groupId = `${sanitizeGroup(input.batchId)}:${debit.txnId}:${credit.txnId}`;
    const ym = debit.date.slice(0, 7);
    const confidence = pickConfidence({
      reason: pair.reason,
      debit,
      credit,
      diffDays: pair.dateDiffDays,
      isOverride: pair.isOverride,
    });

    detections.push({
      groupId,
      debitTxnId: debit.txnId,
      creditTxnId: credit.txnId,
      amountKrw: Math.abs(debit.amountKrw),
      ym: /^\d{4}-\d{2}$/.test(ym) ? ym : "0000-00",
      confidence,
      reason: pair.reason,
    });
    txnIdToTransferGroupId[debit.txnId] = groupId;
    txnIdToTransferGroupId[credit.txnId] = groupId;

    normalized[debit.index] = withTransferTag(
      normalized[debit.index]!,
      groupId,
      "out",
      credit.txnId,
      credit.accountId,
      confidence,
      pair.reason,
    );
    normalized[credit.index] = withTransferTag(
      normalized[credit.index]!,
      groupId,
      "in",
      debit.txnId,
      debit.accountId,
      confidence,
      pair.reason,
    );
  }

  for (const debit of debits) {
    const candidate = tryMatch(debit);
    if (candidate) appendDetection(candidate);
  }

  const unmatchedForcedCredits = credits.filter((credit) => (
    !usedCreditIds.has(credit.txnId) && isForcedTransfer(overridesByTxnId[credit.txnId])
  ));

  for (const credit of unmatchedForcedCredits) {
    const forceCandidateDebits = debits
      .filter((debit) => !usedDebitIds.has(debit.txnId))
      .map((debit) => ({
        debitIndex: debit.index,
        creditIndex: credit.index,
        debitTxnId: debit.txnId,
        creditTxnId: credit.txnId,
        dateDiffDays: dateDiffDays(debit.date, credit.date),
        amountDiffKrw: Math.abs(Math.abs(debit.amountKrw) - Math.abs(credit.amountKrw)),
        isOverride: true,
        reason: "override",
      }))
      .sort(compareCandidates);
    const picked = forceCandidateDebits[0];
    if (!picked) continue;
    appendDetection(picked);
  }

  const sortedDetections = [...detections].sort((left, right) => {
    if (left.ym !== right.ym) return left.ym.localeCompare(right.ym);
    if (left.debitTxnId !== right.debitTxnId) return left.debitTxnId.localeCompare(right.debitTxnId);
    return left.creditTxnId.localeCompare(right.creditTxnId);
  });
  const unassignedCount = normalized.filter((tx) => normalizeAccountId(tx.accountId) === "unassigned").length;

  return {
    detections: sortedDetections,
    txnIdToTransferGroupId,
    transactions: normalized,
    candidateCount,
    unassignedCount,
  };
}

function sanitizeGroup(batchId: string): string {
  const normalized = asString(batchId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized || "batch";
}
