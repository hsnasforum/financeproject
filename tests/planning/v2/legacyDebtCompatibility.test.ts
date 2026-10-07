import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCanonicalProfile } from "../../../src/lib/planning/v2/loadCanonicalProfile";
import { migrateProfileRecord } from "../../../src/lib/planning/migrations/profileMigrate";

function fixture() {
  return JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/compat/profile-record-v1.json"), "utf8"));
}

describe("legacy debt compatibility through public canonical load", () => {
  it("preserves the repository v1 payment together with principal, APR, duration and goals", () => {
    const raw = fixture();
    const result = loadCanonicalProfile(raw.profile);
    expect(result.migratedFrom).toBe(1);
    expect(result.profile.debts).toEqual([{
      id: "loan-compat-1", name: "주담대", balance: 120_000_000,
      aprPct: 4.2, remainingMonths: 220, minimumPayment: 920_000, repaymentType: "amortizing",
    }]);
    expect(result.profile.goals).toEqual([{ ...raw.profile.goals[0], name: "Emergency Fund" }]);
    expect(migrateProfileRecord(raw).data?.profile).toEqual(result.profile);
  });

  it.each(["ratePct", "apr"])("preserves liabilities-only input with existing %s alias", aprKey => {
    const raw = fixture().profile;
    delete raw.debts;
    delete raw.debtOffers;
    raw.liabilities = [{
      liabilityId: "loan-legacy", principalKrw: 120_000_000,
      [aprKey]: aprKey === "apr" ? 0.042 : 4.2,
      termMonths: 220, monthlyPayment: 920_000,
    }];
    expect(loadCanonicalProfile(raw).profile.debts).toEqual([{
      id: "loan-legacy", name: "Debt 1", balance: 120_000_000,
      aprPct: 4.2, remainingMonths: 220, minimumPayment: 920_000, repaymentType: "amortizing",
    }]);
  });

  it.each([false, true])("keeps the existing debts array precedence, including empty=%s", empty => {
    const raw = fixture().profile;
    delete raw.debtOffers;
    raw.debts = empty ? [] : [{ ...raw.debts[0], minimumPayment: 810_000 }];
    const expected = loadCanonicalProfile(raw).profile;
    expect(loadCanonicalProfile({ ...raw, liabilities: [{ liabilityId: "ignored", monthlyPayment: 999_000 }] }).profile).toEqual(expected);
  });

  it.each(["minimumPayment", "minimumPaymentKrw", "monthlyPaymentKrw", "monthlyPayment"])("preserves explicit %s without estimating", alias => {
    const raw = fixture().profile;
    delete raw.debts[0].monthlyPayment;
    raw.debts[0][alias] = 920_000;
    expect(loadCanonicalProfile(raw).profile.debts[0].minimumPayment).toBe(920_000);
  });

  it("retains payment alias precedence", () => {
    const raw = fixture().profile;
    Object.assign(raw.debts[0], { minimumPayment: 910_000, minimumPaymentKrw: 920_000, monthlyPaymentKrw: 930_000, monthlyPayment: 940_000 });
    for (const [alias, expected] of [["minimumPayment", 910_000], ["minimumPaymentKrw", 920_000], ["monthlyPaymentKrw", 930_000], ["monthlyPayment", 940_000]] as const) {
      expect(loadCanonicalProfile(raw).profile.debts[0].minimumPayment).toBe(expected);
      delete raw.debts[0][alias];
    }
  });

  it("retains the established amortizing fallback only when payment is omitted", () => {
    const raw = fixture().profile;
    delete raw.debts[0].monthlyPayment;
    expect(loadCanonicalProfile(raw).profile.debts[0].minimumPayment).toBe(783_050);
  });

  it("keeps an explicit zero payment", () => {
    const raw = fixture().profile;
    raw.debts[0].monthlyPayment = 0;
    expect(loadCanonicalProfile(raw).profile.debts[0].minimumPayment).toBe(0);
  });

  it("leaves a normal current v2 payload canonical and idempotent", () => {
    const profile = {
      schemaVersion: 2, monthlyIncomeNet: 5_100_000, monthlyEssentialExpenses: 2_200_000,
      monthlyDiscretionaryExpenses: 700_000, liquidAssets: 8_000_000, investmentAssets: 12_000_000,
      debts: [{ id: "current", name: "Current", balance: 120_000_000, aprPct: 4.2, remainingMonths: 220, minimumPayment: 920_000, repaymentType: "amortizing" }],
      goals: [],
    };
    const result = loadCanonicalProfile(profile);
    const { schemaVersion, ...expected } = profile;
    expect(result.schemaVersion).toBe(schemaVersion);
    expect(result.migratedFrom).toBeUndefined();
    expect(result.profile).toEqual(expected);
    expect(loadCanonicalProfile(result.profile).profile).toEqual(result.profile);
  });
});
