import { describe, expect, it } from "vitest";
import { formatKstCompactDate, formatKstIsoDate, shiftKstIsoDate } from "../src/lib/format/kstCalendarDate";

describe("KST calendar date", () => {
  it("uses the Korea calendar date when UTC is still the previous day", () => {
    const instant = new Date("2026-08-31T15:30:00.000Z");

    expect(formatKstIsoDate(instant)).toBe("2026-09-01");
    expect(formatKstCompactDate(instant)).toBe("20260901");
  });

  it("keeps the previous Korea date until local midnight", () => {
    expect(formatKstIsoDate(new Date("2026-08-31T14:59:59.999Z"))).toBe("2026-08-31");
  });

  it("subtracts calendar days across month and year boundaries", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z");

    expect(shiftKstIsoDate(instant, -1)).toBe("2025-12-31");
    expect(shiftKstIsoDate(instant, -90)).toBe("2025-10-03");
  });
});
