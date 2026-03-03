import { describe, expect, it } from "vitest";
import { categorizeTransactions } from "../src/lib/planning/v3/service/categorizeTransactions";
import { type CategoryRule, type TxnOverride } from "../src/lib/planning/v3/domain/types";
import { type StoredTransaction } from "../src/lib/planning/v3/domain/transactions";

const BASE_TX: StoredTransaction = {
  batchId: "batch-1",
  txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  date: "2026-03-01",
  amountKrw: -10000,
  description: "Cafe Latte",
  source: "csv",
};

function tx(patch: Partial<StoredTransaction> = {}): StoredTransaction {
  return { ...BASE_TX, ...patch };
}

function rule(input: Partial<CategoryRule>): CategoryRule {
  return {
    id: input.id ?? "rule-1",
    categoryId: input.categoryId ?? "food",
    match: input.match ?? { type: "contains", value: "cafe" },
    priority: input.priority ?? 10,
    enabled: input.enabled ?? true,
    ...(input.note ? { note: input.note } : {}),
  };
}

describe("planning v3 categorizeTransactions", () => {
  it("applies override before rule", () => {
    const overrides: Record<string, TxnOverride> = {
      aaaaaaaaaaaaaaaaaaaaaaaa: {
        batchId: "batch-1",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        categoryId: "tax",
        updatedAt: "2026-03-03T00:00:00.000Z",
      },
    };
    const rows = categorizeTransactions({
      transactions: [tx()],
      rules: [rule({ categoryId: "food" })],
      overridesByTxnId: overrides,
    });
    expect(rows[0]?.categoryId).toBe("tax");
    expect(rows[0]?.categorySource).toBe("override");
  });

  it("picks highest priority rule first", () => {
    const rows = categorizeTransactions({
      transactions: [tx()],
      rules: [
        rule({ id: "r-low", categoryId: "food", priority: 5 }),
        rule({ id: "r-high", categoryId: "shopping", priority: 50 }),
      ],
      overridesByTxnId: {},
    });
    expect(rows[0]?.categoryId).toBe("shopping");
    expect(rows[0]?.categorySource).toBe("rule");
  });

  it("matches contains case-insensitively", () => {
    const rows = categorizeTransactions({
      transactions: [tx({ description: "CREDIT CARD Fee" })],
      rules: [rule({ id: "r1", categoryId: "etc", match: { type: "contains", value: "credit card" } })],
      overridesByTxnId: {},
    });
    expect(rows[0]?.categoryId).toBe("etc");
  });

  it("ignores disabled rule and falls back to default", () => {
    const rows = categorizeTransactions({
      transactions: [tx({ amountKrw: -5000, description: "마트" })],
      rules: [rule({ id: "r1", categoryId: "food", enabled: false })],
      overridesByTxnId: {},
    });
    expect(rows[0]?.categoryId).toBe("unknown");
    expect(rows[0]?.categorySource).toBe("default");
  });
});

