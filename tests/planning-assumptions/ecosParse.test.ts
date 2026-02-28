import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type EcosKeyStatRow } from "../../src/lib/planning/assumptions/fetchers/ecosClient";
import { parseEcosKeyStats } from "../../src/lib/planning/assumptions/fetchers/ecosParse";

function fixtureRows(name: string): EcosKeyStatRow[] {
  const filePath = path.join(process.cwd(), "tests", "fixtures", "planning-assumptions", name);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as EcosKeyStatRow[];
}

describe("parseEcosKeyStats", () => {
  it("parses policy and short-term rates", () => {
    const parsed = parseEcosKeyStats(fixtureRows("ecos-key-stats.json"));
    expect(parsed.policyRatePct).toBe(2.5);
    expect(parsed.cd91Pct).toBe(2.88);
    expect(parsed.koribor3mPct).toBe(2.95);
    expect(parsed.callOvernightPct).toBe(2.73);
    expect(parsed.msb364Pct).toBe(2.91);
  });

  it("normalizes cycle date and selects latest asOf", () => {
    const parsed = parseEcosKeyStats(fixtureRows("ecos-key-stats.json"));
    expect(parsed.asOf).toBe("2026-02-20");
    expect(parsed.warnings).toContain("MONTH_CYCLE_NORMALIZED");
  });

  it("adds warnings for missing items and invalid values", () => {
    const parsed = parseEcosKeyStats([
      {
        CLASS_NAME: "금리",
        KEYSTAT_NAME: "한국은행 기준금리",
        DATA_VALUE: "not-a-number",
        CYCLE: "BAD",
      },
    ]);

    expect(parsed.policyRatePct).toBeUndefined();
    expect(parsed.callOvernightPct).toBeUndefined();
    expect(parsed.warnings).toContain("ECOS_INVALID_NUMBER:한국은행 기준금리");
    expect(parsed.warnings.some((warning) => warning.startsWith("ECOS_INVALID_CYCLE:"))).toBe(true);
    expect(parsed.warnings).toContain("ECOS_MISSING_CALL_OVERNIGHT");
    expect(parsed.warnings).toContain("ECOS_MISSING_CD91");
    expect(parsed.warnings).toContain("ECOS_MISSING_KORIBOR3M");
    expect(parsed.warnings).toContain("ECOS_MISSING_MSB364");
  });
});
