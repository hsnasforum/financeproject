import { describe, expect, it } from "vitest";
import { type MonthlyCashflow, type AccountTransaction, type TxnOverride } from "../src/lib/planning/v3/domain/types";
import { aggregateMonthlyCashflow } from "../src/lib/planning/v3/service/aggregateMonthlyCashflow";
import {
  buildProfileDraftEstimateFromCashflow,
  ProfileDraftFromCashflowInputError,
} from "../src/lib/planning/v3/service/draftFromCashflow";

function monthRow(input: {
  ym: string;
  incomeKrw: number;
  fixedOutflowKrw: number;
  variableOutflowKrw: number;
}): MonthlyCashflow {
  return {
    ym: input.ym,
    month: input.ym,
    incomeKrw: input.incomeKrw,
    expenseKrw: -(input.fixedOutflowKrw + input.variableOutflowKrw),
    inflowKrw: input.incomeKrw,
    outflowKrw: input.fixedOutflowKrw + input.variableOutflowKrw,
    fixedOutflowKrw: input.fixedOutflowKrw,
    variableOutflowKrw: input.variableOutflowKrw,
    netKrw: input.incomeKrw - input.fixedOutflowKrw - input.variableOutflowKrw,
    txCount: 1,
  };
}

function tx(input: {
  txnId: string;
  date: string;
  amountKrw: number;
  description: string;
  accountId?: string;
}): AccountTransaction {
  return {
    txnId: input.txnId,
    date: input.date,
    amountKrw: input.amountKrw,
    description: input.description,
    source: "csv",
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
}

describe("planning v3 buildProfileDraftEstimateFromCashflow", () => {
  it("computes deterministic odd-count income median", () => {
    const result = buildProfileDraftEstimateFromCashflow([
      monthRow({ ym: "2026-01", incomeKrw: 1_000_000, fixedOutflowKrw: 300_000, variableOutflowKrw: 200_000 }),
      monthRow({ ym: "2026-02", incomeKrw: 1_200_000, fixedOutflowKrw: 310_000, variableOutflowKrw: 210_000 }),
      monthRow({ ym: "2026-03", incomeKrw: 1_100_000, fixedOutflowKrw: 320_000, variableOutflowKrw: 220_000 }),
    ]);

    expect(result.patch.monthlyIncomeNet).toBe(1_100_000);
  });

  it("computes deterministic even-count income median", () => {
    const result = buildProfileDraftEstimateFromCashflow([
      monthRow({ ym: "2026-01", incomeKrw: 1_000_000, fixedOutflowKrw: 300_000, variableOutflowKrw: 200_000 }),
      monthRow({ ym: "2026-02", incomeKrw: 1_200_000, fixedOutflowKrw: 310_000, variableOutflowKrw: 210_000 }),
      monthRow({ ym: "2026-03", incomeKrw: 1_400_000, fixedOutflowKrw: 320_000, variableOutflowKrw: 220_000 }),
      monthRow({ ym: "2026-04", incomeKrw: 1_800_000, fixedOutflowKrw: 330_000, variableOutflowKrw: 230_000 }),
    ], { recentMonths: 4, minMonths: 4, maxMonths: 6 });

    expect(result.patch.monthlyIncomeNet).toBe(1_300_000);
  });

  it("computes fixed/variable medians independently", () => {
    const result = buildProfileDraftEstimateFromCashflow([
      monthRow({ ym: "2026-01", incomeKrw: 1_000_000, fixedOutflowKrw: 400_000, variableOutflowKrw: 100_000 }),
      monthRow({ ym: "2026-02", incomeKrw: 1_100_000, fixedOutflowKrw: 500_000, variableOutflowKrw: 200_000 }),
      monthRow({ ym: "2026-03", incomeKrw: 1_200_000, fixedOutflowKrw: 450_000, variableOutflowKrw: 150_000 }),
    ]);

    expect(result.patch.monthlyEssentialExpenses).toBe(450_000);
    expect(result.patch.monthlyDiscretionaryExpenses).toBe(150_000);
    expect(result.patch.emergencyFundTargetKrw).toBe(1_350_000);
  });

  it("uses the most recent N months and excludes missing months naturally", () => {
    const result = buildProfileDraftEstimateFromCashflow([
      monthRow({ ym: "2026-01", incomeKrw: 900_000, fixedOutflowKrw: 300_000, variableOutflowKrw: 200_000 }),
      monthRow({ ym: "2026-03", incomeKrw: 1_100_000, fixedOutflowKrw: 310_000, variableOutflowKrw: 210_000 }),
      monthRow({ ym: "2026-05", incomeKrw: 1_300_000, fixedOutflowKrw: 320_000, variableOutflowKrw: 220_000 }),
      monthRow({ ym: "2026-06", incomeKrw: 1_500_000, fixedOutflowKrw: 330_000, variableOutflowKrw: 230_000 }),
    ]);

    expect(result.evidence.monthsUsed).toEqual(["2026-03", "2026-05", "2026-06"]);
  });

  it("throws insufficient-data error when fewer than minimum months are available", () => {
    expect(() => buildProfileDraftEstimateFromCashflow([
      monthRow({ ym: "2026-01", incomeKrw: 1_000_000, fixedOutflowKrw: 300_000, variableOutflowKrw: 200_000 }),
      monthRow({ ym: "2026-02", incomeKrw: 1_100_000, fixedOutflowKrw: 320_000, variableOutflowKrw: 210_000 }),
    ])).toThrowError(ProfileDraftFromCashflowInputError);
  });

  it("keeps profile draft result identical regardless of includeTransfers option in monthly aggregation", () => {
    const input = [
      tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2_000_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-01-02", amountKrw: -500_000, description: "월세", accountId: "acc-a" }),
      tx({ txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2_100_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "dddddddddddddddddddddddd", date: "2026-02-02", amountKrw: -510_000, description: "월세", accountId: "acc-a" }),
      tx({ txnId: "eeeeeeeeeeeeeeeeeeeeeeee", date: "2026-03-01", amountKrw: 2_200_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "ffffffffffffffffffffffff", date: "2026-03-02", amountKrw: -520_000, description: "월세", accountId: "acc-a" }),
      tx({ txnId: "111111111111111111111111", date: "2026-03-10", amountKrw: -300_000, description: "이체", accountId: "acc-a" }),
      tx({ txnId: "222222222222222222222222", date: "2026-03-10", amountKrw: 300_000, description: "이체", accountId: "acc-b" }),
    ];

    const monthlyExcluded = aggregateMonthlyCashflow(input, { includeTransfers: false });
    const monthlyIncluded = aggregateMonthlyCashflow(input, { includeTransfers: true });

    const draftExcluded = buildProfileDraftEstimateFromCashflow(monthlyExcluded);
    const draftIncluded = buildProfileDraftEstimateFromCashflow(monthlyIncluded);

    expect(draftIncluded.patch).toEqual(draftExcluded.patch);
  });

  it("changes draft result when overrides change category assignment", () => {
    const input = [
      tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2_000_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-01-02", amountKrw: -100_000, description: "마트", accountId: "acc-a" }),
      tx({ txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2_000_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "dddddddddddddddddddddddd", date: "2026-02-02", amountKrw: -100_000, description: "마트", accountId: "acc-a" }),
      tx({ txnId: "eeeeeeeeeeeeeeeeeeeeeeee", date: "2026-03-01", amountKrw: 2_000_000, description: "급여", accountId: "acc-a" }),
      tx({ txnId: "ffffffffffffffffffffffff", date: "2026-03-02", amountKrw: -100_000, description: "마트", accountId: "acc-a" }),
    ];
    const overrides: Record<string, TxnOverride> = {
      bbbbbbbbbbbbbbbbbbbbbbbb: { txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", category: "fixed", updatedAt: "2026-03-01T00:00:00.000Z" },
      dddddddddddddddddddddddd: { txnId: "dddddddddddddddddddddddd", category: "fixed", updatedAt: "2026-03-01T00:00:00.000Z" },
      ffffffffffffffffffffffff: { txnId: "ffffffffffffffffffffffff", category: "fixed", updatedAt: "2026-03-01T00:00:00.000Z" },
    };

    const baseMonthly = aggregateMonthlyCashflow(input, { includeTransfers: false });
    const overrideMonthly = aggregateMonthlyCashflow(input, { includeTransfers: false, overridesByTxnId: overrides });

    const baseDraft = buildProfileDraftEstimateFromCashflow(baseMonthly);
    const overrideDraft = buildProfileDraftEstimateFromCashflow(overrideMonthly);

    expect(baseDraft.patch.monthlyEssentialExpenses).toBe(0);
    expect(overrideDraft.patch.monthlyEssentialExpenses).toBe(100_000);
  });

  it("keeps evidence free from raw description markers", () => {
    const marker = "PII_SHOULD_NOT_LEAK";
    const input = [
      tx({ txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2_000_000, description: marker, accountId: "acc-a" }),
      tx({ txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-01-02", amountKrw: -100_000, description: marker, accountId: "acc-a" }),
      tx({ txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2_100_000, description: marker, accountId: "acc-a" }),
      tx({ txnId: "dddddddddddddddddddddddd", date: "2026-02-02", amountKrw: -110_000, description: marker, accountId: "acc-a" }),
      tx({ txnId: "eeeeeeeeeeeeeeeeeeeeeeee", date: "2026-03-01", amountKrw: 2_200_000, description: marker, accountId: "acc-a" }),
      tx({ txnId: "ffffffffffffffffffffffff", date: "2026-03-02", amountKrw: -120_000, description: marker, accountId: "acc-a" }),
    ];
    const monthly = aggregateMonthlyCashflow(input, { includeTransfers: false });
    const built = buildProfileDraftEstimateFromCashflow(monthly);

    const evidenceJson = JSON.stringify(built.evidence);
    expect(evidenceJson.includes(marker)).toBe(false);
  });
});
