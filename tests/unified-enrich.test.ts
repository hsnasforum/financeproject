import { describe, expect, it } from "vitest";
import {
  applyDepositProtectionOnViews,
  integrateCanonicalWithMatches,
} from "../src/lib/sources/unifiedEnrichPolicy";

type TestRow = {
  externalKey: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
};

function row(code: string, matched: boolean): TestRow {
  return {
    externalKey: code,
    signals: {
      depositProtection: matched ? "matched" : "unknown",
      kdbMatched: false,
    },
  };
}

describe("applyDepositProtectionOnViews", () => {
  it("keeps all items in any mode", () => {
    const out = applyDepositProtectionOnViews({
      mode: "any",
      items: [row("A", true), row("B", false)],
    });

    expect(out.map((item) => item.externalKey)).toEqual(["A", "B"]);
  });

  it("keeps input order in prefer mode", () => {
    const out = applyDepositProtectionOnViews({
      mode: "prefer",
      items: [row("B", false), row("A", true)],
    });

    expect(out.map((item) => item.externalKey)).toEqual(["B", "A"]);
  });

  it("keeps all items in require mode", () => {
    const out = applyDepositProtectionOnViews({
      mode: "require",
      items: [row("A", true), row("B", false)],
    });

    expect(out.map((item) => item.externalKey)).toEqual(["A", "B"]);
  });
});

describe("integrateCanonicalWithMatches", () => {
  it("adds kdb badges/signals and keeps kdbOnly extras", () => {
    const out = integrateCanonicalWithMatches({
      canonicalItems: [
        { externalKey: "FIN1", badges: ["FINLIFE"] },
        { externalKey: "FIN2", badges: ["FINLIFE"] },
      ] as TestRow[],
      isKdbMatched: (item) => item.externalKey === "FIN2",
      kdbOnlyItems: [
        { externalKey: "KDB_ONLY_1", badges: ["KDB_ONLY"] },
      ] as TestRow[],
    });

    expect(out.items.map((item) => item.externalKey)).toEqual(["FIN1", "FIN2"]);
    expect(out.items[1]?.badges).toContain("KDB_MATCHED");
    expect(out.extras?.kdbOnly?.map((item) => item.externalKey)).toEqual(["KDB_ONLY_1"]);
  });
});
