import { describe, expect, it } from "vitest";
import {
  PlanningPostgresReadinessMapperError,
  apiKrwNumberToPostgresBigInt,
  apiNumberToPostgresDecimalString,
  fromPostgresFinancialAccountRow,
  fromPostgresOpeningBalanceRow,
  fromPostgresTransactionRow,
  postgresBigIntToApiKrwNumber,
  postgresDecimalToApiNumber,
  toPostgresFinancialAccountRow,
  toPostgresOpeningBalanceRow,
  toPostgresTransactionRow,
} from "../../../src/lib/planning/postgres/readinessMapper";
import { type Account, type AccountTransaction, type OpeningBalance } from "../../../src/lib/planning/v3/domain/types";

const owner = {
  userId: "user-1",
  planningProfileId: "profile-1",
  now: "2026-06-22T00:00:00.000Z",
};

describe("PostgreSQL readiness mapper contract", () => {
  it("round-trips v3 account money through PostgreSQL BigInt rows while keeping API numbers", () => {
    const account: Account = {
      id: "acc-main",
      name: "주거래 계좌",
      kind: "bank",
      currency: "KRW",
      note: "월급",
      createdAt: "2026-06-01T00:00:00.000Z",
      startingBalanceKrw: 1_234_567,
    };

    const row = toPostgresFinancialAccountRow(account, owner);

    expect(row).toMatchObject({
      id: "acc-main",
      userId: "user-1",
      planningProfileId: "profile-1",
      accountType: "bank",
      currency: "KRW",
    });
    expect(row.balanceKrw).toBe(BigInt(1_234_567));
    expect(typeof row.balanceKrw).toBe("bigint");
    expect(fromPostgresFinancialAccountRow(row)).toMatchObject({
      id: "acc-main",
      name: "주거래 계좌",
      kind: "bank",
      currency: "KRW",
      note: "월급",
      startingBalanceKrw: 1_234_567,
    });
  });

  it("round-trips opening balances and transactions through PostgreSQL BigInt rows", () => {
    const openingBalance: OpeningBalance = {
      accountId: "acc-main",
      asOfDate: "2026-06-01",
      amountKrw: -500_000,
    };
    const transaction: AccountTransaction = {
      txnId: "txn-1",
      accountId: "acc-main",
      kind: "expense",
      categoryId: "housing",
      date: "2026-06-15",
      amountKrw: -120_000,
      description: "월세",
      source: "csv",
      meta: { rowIndex: 7 },
    };

    const openingRow = toPostgresOpeningBalanceRow(openingBalance, owner);
    const transactionRow = toPostgresTransactionRow(transaction, { ...owner, batchId: "batch-1" });

    expect(openingRow.amountKrw).toBe(BigInt(-500_000));
    expect(transactionRow).toMatchObject({
      id: "txn-1",
      userId: "user-1",
      batchId: "batch-1",
      financialAccountId: "acc-main",
      category: "housing",
      amountKrw: BigInt(-120_000),
    });
    expect(fromPostgresOpeningBalanceRow(openingRow)).toEqual(openingBalance);
    expect(fromPostgresTransactionRow(transactionRow)).toMatchObject({
      txnId: "txn-1",
      accountId: "acc-main",
      kind: "expense",
      categoryId: "housing",
      date: "2026-06-15",
      amountKrw: -120_000,
      description: "월세",
      source: "csv",
    });
  });

  it("rejects money values that cannot safely round-trip through the public number contract", () => {
    expect(() => apiKrwNumberToPostgresBigInt(1000.5, "amountKrw")).toThrow(PlanningPostgresReadinessMapperError);
    expect(() => apiKrwNumberToPostgresBigInt(Number.MAX_SAFE_INTEGER + 1, "amountKrw"))
      .toThrow("safe integer");
    expect(() => postgresBigIntToApiKrwNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), "amountKrw"))
      .toThrow("round-trip");
  });

  it("keeps PostgreSQL Decimal rates as fixed-scale strings and returns API numbers", () => {
    const annualRate = apiNumberToPostgresDecimalString(3.25, {
      field: "debt.annualRate",
      precision: 10,
      scale: 6,
    });
    const emergencyMonths = apiNumberToPostgresDecimalString(6.125, {
      field: "snapshot.emergencyMonths",
      precision: 10,
      scale: 4,
    });

    expect(annualRate).toBe("3.250000");
    expect(emergencyMonths).toBe("6.1250");
    expect(postgresDecimalToApiNumber({ toString: () => annualRate }, {
      field: "debt.annualRate",
      precision: 10,
      scale: 6,
    })).toBe(3.25);
  });

  it("rejects Decimal values that exceed target scale or precision", () => {
    expect(() => apiNumberToPostgresDecimalString(0.1234567, {
      field: "debt.annualRate",
      precision: 10,
      scale: 6,
    })).toThrow("6 decimal places");

    expect(() => apiNumberToPostgresDecimalString(10_000, {
      field: "debt.annualRate",
      precision: 10,
      scale: 6,
    })).toThrow("Decimal(10, 6)");
  });
});
