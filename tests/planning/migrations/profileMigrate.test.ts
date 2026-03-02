import { describe, expect, it } from "vitest";
import { migrateProfileRecord } from "../../../src/lib/planning/migrations/profileMigrate";

function validProfileRecord() {
  return {
    version: 1,
    id: "profile-1",
    name: "기본",
    profile: {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 600_000,
      liquidAssets: 1_000_000,
      investmentAssets: 2_000_000,
      debts: [],
      goals: [],
    },
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
  };
}

describe("migrateProfileRecord", () => {
  it("defaults missing version to 1 and fills missing name", () => {
    const row = {
      ...validProfileRecord(),
      version: undefined,
      name: " ",
    };
    const result = migrateProfileRecord(row);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.warnings).toContain("VERSION_MISSING_DEFAULTED");
    expect(result.warnings).toContain("NAME_MISSING_DEFAULTED");
    expect(result.data?.version).toBe(1);
    expect(result.data?.name).toBe("Unnamed");
  });

  it("rejects missing date fields", () => {
    const row = {
      ...validProfileRecord(),
      createdAt: "",
    };
    const result = migrateProfileRecord(row);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("MISSING_DATE_CREATED_AT");
  });

  it("upgrades valid v1 record with schemaVersion", () => {
    const row = validProfileRecord();
    const result = migrateProfileRecord(row);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.data?.schemaVersion).toBe(2);
  });

  it("normalizes duplicate monthly fields and apr units", () => {
    const row = {
      ...validProfileRecord(),
      profile: {
        ...validProfileRecord().profile,
        monthlyIncomeNet: 4_000_000,
        cashflow: {
          monthlyIncomeKrw: 4_500_000,
        },
        debts: [
          {
            id: "loan-1",
            name: "대출",
            balance: 10_000_000,
            minimumPayment: 200_000,
            apr: 5.4,
          },
        ],
      },
    };
    const result = migrateProfileRecord(row);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("DUPLICATE_FIELD_MISMATCH"))).toBe(true);
    expect(result.data?.profile.monthlyIncomeNet).toBe(4_500_000);
    expect((result.data?.profile.debts?.[0] as { aprPct?: number } | undefined)?.aprPct).toBeCloseTo(5.4, 8);
  });
});
