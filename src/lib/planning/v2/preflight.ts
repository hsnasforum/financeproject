import { checkMonteCarloBudget } from "./budget";
import { type ProfileV2 } from "./types";
import { normalizeAprPctInput } from "./aprBoundary";
import { formatExpectedDebtIds, validateDebtOfferLiabilityIds } from "./debtOfferMapping";

export type PreflightIssue = {
  code: string;
  severity: "warn" | "block";
  message: string;
  fixHint?: string;
  data?: unknown;
};

type SnapshotSelection =
  | { mode: "latest" }
  | { mode: "history"; id: string };

type DebtOfferInput = {
  liabilityId: string;
  newAprPct: number;
  feeKrw?: number;
};

type PreflightRunArgs = {
  profile: ProfileV2 | Record<string, unknown>;
  selectedSnapshot?: SnapshotSelection;
  debtOffers?: DebtOfferInput[];
  assumptionsOverride?: Record<string, unknown>;
  monteCarlo?: {
    enabled?: boolean;
    paths?: number;
    horizonMonths?: number;
  };
};

type ProfileDebtLike = {
  id: string;
  aprPct?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractProfileDebts(profile: ProfileV2 | Record<string, unknown>): ProfileDebtLike[] {
  const row = asRecord(profile);
  const debtRows = asArray(row.debts);
  const liabilities = asArray(row.liabilities);
  const source = debtRows.length > 0 ? debtRows : liabilities;

  return source
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      id: asString(entry.id ?? entry.liabilityId),
      aprPct: (() => {
        const aprPct = asFiniteNumber(entry.aprPct);
        if (aprPct !== null) return aprPct;
        const aprDecimalLegacy = asFiniteNumber(entry.apr);
        return aprDecimalLegacy === null ? undefined : normalizeAprPctInput(aprDecimalLegacy);
      })(),
    }));
}

function extractGoalRows(profile: ProfileV2 | Record<string, unknown>): Array<{
  id: string;
  target: number | null;
  current: number | null;
}> {
  const row = asRecord(profile);
  return asArray(row.goals)
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      id: asString(entry.id),
      target: asFiniteNumber(entry.targetAmount ?? entry.targetKrw ?? entry.target),
      current: asFiniteNumber(entry.currentAmount ?? entry.currentKrw ?? entry.current),
    }));
}

function pushAprIssues(issues: PreflightIssue[], args: {
  codePrefix: "PROFILE_APR" | "DEBT_OFFER_APR";
  value: number;
  targetLabel: string;
  data?: Record<string, unknown>;
}): void {
  if (args.value < 0 || args.value > 100) {
    issues.push({
      code: "APR_OUT_OF_RANGE",
      severity: "block",
      message: `${args.targetLabel} APR은 0~100 범위여야 합니다.`,
      fixHint: "금리를 %로 입력하고 음수/100 초과 값을 제거하세요.",
      data: {
        codePrefix: args.codePrefix,
        value: args.value,
        ...args.data,
      },
    });
    return;
  }

  if (args.value > 0 && args.value <= 1) {
    issues.push({
      code: "APR_SCALE_SUSPECTED",
      severity: "warn",
      message: `${args.targetLabel} APR 값이 0~1 범위입니다.`,
      fixHint: "금리는 %로 입력하세요(예: 4.8).",
      data: {
        codePrefix: args.codePrefix,
        value: args.value,
        ...args.data,
      },
    });
  }
}

function pushSnapshotIssues(issues: PreflightIssue[], selectedSnapshot?: SnapshotSelection): void {
  if (!selectedSnapshot || selectedSnapshot.mode === "latest") return;

  const rawId = selectedSnapshot.id;
  const snapshotId = asString(rawId);
  if (!snapshotId) {
    issues.push({
      code: "SNAPSHOT_ID_REQUIRED",
      severity: "block",
      message: "history 스냅샷 선택 시 snapshotId가 필요합니다.",
      fixHint: "스냅샷 목록에서 항목을 다시 선택하세요.",
    });
    return;
  }

  if (/\s/.test(rawId)) {
    issues.push({
      code: "SNAPSHOT_ID_WHITESPACE",
      severity: "block",
      message: "snapshotId에 공백이 포함되어 있습니다.",
      fixHint: "snapshotId 공백을 제거하고 다시 선택하세요.",
      data: { snapshotId: rawId },
    });
  }

  if (snapshotId.length < 8) {
    issues.push({
      code: "SNAPSHOT_ID_TOO_SHORT",
      severity: "block",
      message: "snapshotId 형식이 너무 짧습니다.",
      fixHint: "history 목록에서 유효한 snapshotId를 다시 선택하세요.",
      data: { snapshotId },
    });
  }
}

function pushDebtOfferIssues(
  issues: PreflightIssue[],
  debts: ProfileDebtLike[],
  debtOffers: DebtOfferInput[],
): void {
  if (debtOffers.length === 0) return;

  const knownIds = new Set(
    debts
      .map((debt) => debt.id)
      .filter((id) => id.length > 0),
  );
  const mapping = validateDebtOfferLiabilityIds(
    debtOffers.map((offer) => ({ liabilityId: offer.liabilityId })),
    Array.from(knownIds),
  );

  if (!mapping.ok) {
    issues.push({
      code: "DEBT_OFFER_ID_MISMATCH",
      severity: "block",
      message: `debt offer의 liabilityId가 프로필 대출 id와 일치하지 않습니다. expected ids: ${formatExpectedDebtIds(mapping.expectedIds)}`,
      fixHint: "offers의 liabilityId를 대출 id와 동일하게 맞추세요.",
      data: {
        mismatchedIds: mapping.mismatchedIds,
        expectedIds: mapping.expectedIds,
      },
    });
  }

  debtOffers.forEach((offer, index) => {
    const apr = asFiniteNumber(offer.newAprPct);
    if (apr === null) {
      issues.push({
        code: "DEBT_OFFER_APR_INVALID",
        severity: "block",
        message: `debt offer #${index + 1}의 newAprPct가 숫자가 아닙니다.`,
        fixHint: "newAprPct에 숫자를 입력하세요.",
      });
      return;
    }
    pushAprIssues(issues, {
      codePrefix: "DEBT_OFFER_APR",
      value: apr,
      targetLabel: `debt offer #${index + 1}`,
      data: {
        index,
        liabilityId: offer.liabilityId,
      },
    });
  });
}

function pushGoalIssues(issues: PreflightIssue[], profile: ProfileV2 | Record<string, unknown>): void {
  const goals = extractGoalRows(profile);
  goals.forEach((goal, index) => {
    const target = goal.target;
    const current = goal.current ?? 0;

    if (target !== null && target < 0) {
      issues.push({
        code: "GOAL_NEGATIVE_AMOUNT",
        severity: "block",
        message: `목표 #${index + 1}의 targetAmount는 0 이상이어야 합니다.`,
        fixHint: "목표 금액을 0 이상으로 수정하세요.",
        data: { goalId: goal.id, target },
      });
    }

    if (goal.current !== null && goal.current < 0) {
      issues.push({
        code: "GOAL_NEGATIVE_CURRENT",
        severity: "block",
        message: `목표 #${index + 1}의 currentAmount는 0 이상이어야 합니다.`,
        fixHint: "현재 금액을 0 이상으로 수정하세요.",
        data: { goalId: goal.id, current: goal.current },
      });
    }

    if (target !== null && target < current) {
      issues.push({
        code: "GOAL_TARGET_LT_CURRENT",
        severity: "block",
        message: `목표 #${index + 1}의 targetAmount가 currentAmount보다 작습니다.`,
        fixHint: "targetAmount를 currentAmount 이상으로 조정하세요.",
        data: { goalId: goal.id, target, current },
      });
    }
  });
}

function pushBudgetIssues(issues: PreflightIssue[], args: PreflightRunArgs): void {
  if (!args.monteCarlo?.enabled) return;
  const paths = Number(args.monteCarlo.paths);
  const horizonMonths = Number(args.monteCarlo.horizonMonths);
  if (!Number.isFinite(paths) || !Number.isFinite(horizonMonths)) return;

  const budget = checkMonteCarloBudget({
    paths: Math.trunc(paths),
    horizonMonths: Math.trunc(horizonMonths),
  });
  if (!budget.ok) {
    issues.push({
      code: budget.code || "BUDGET_EXCEEDED",
      severity: "block",
      message: budget.message,
      fixHint: "paths 또는 기간을 줄여 계산 예산 안으로 조정하세요.",
      data: budget.data,
    });
  }
}

export function preflightRun(args: PreflightRunArgs): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  const debts = extractProfileDebts(args.profile);
  debts.forEach((debt, index) => {
    if (typeof debt.aprPct !== "number") return;
    pushAprIssues(issues, {
      codePrefix: "PROFILE_APR",
      value: debt.aprPct,
      targetLabel: `대출 #${index + 1}`,
      data: { debtId: debt.id },
    });
  });

  pushDebtOfferIssues(issues, debts, Array.isArray(args.debtOffers) ? args.debtOffers : []);
  pushGoalIssues(issues, args.profile);
  pushSnapshotIssues(issues, args.selectedSnapshot);
  pushBudgetIssues(issues, args);

  return issues;
}
