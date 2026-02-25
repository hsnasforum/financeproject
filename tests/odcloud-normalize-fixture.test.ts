import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { __test__ as benefitsTest } from "../src/lib/publicApis/providers/benefits";
import { __test__ as subscriptionTest } from "../src/lib/publicApis/providers/subscription";

function loadFixture(name: string): Record<string, unknown>[] {
  const file = join(process.cwd(), "tests", "fixtures", name);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { data?: unknown };
  return Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>[]) : [];
}

describe("odcloud fixture normalization", () => {
  it("normalizes benefits fixture into non-empty items", () => {
    const rows = loadFixture("benefits_serviceList.sample.json");
    const normalized = benefitsTest.normalizeBenefits(rows);
    expect(normalized.items.length).toBeGreaterThan(0);
    expect(normalized.items[0]?.id).toBeTruthy();
    expect(normalized.items[0]?.title).toBeTruthy();
  });

  it("normalizes subscription fixture into non-empty items", () => {
    const rows = loadFixture("subscription_APTLttotPblancDetail.sample.json");
    const normalized = subscriptionTest.normalizeSubscription(rows, "전국");
    expect(normalized.items.length).toBeGreaterThan(0);
    expect(normalized.items[0]?.id).toBeTruthy();
    expect(normalized.items[0]?.title).toBeTruthy();
  });
});
