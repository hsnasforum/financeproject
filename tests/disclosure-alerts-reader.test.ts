import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyDisclosureAlertsData, readDisclosureAlerts } from "../src/lib/dart/disclosureAlertsReader";

describe("disclosure alerts reader", () => {
  it("returns empty payload when file does not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-alerts-missing-"));
    const filePath = path.join(tmpDir, "missing.json");
    expect(readDisclosureAlerts(filePath)).toEqual(emptyDisclosureAlertsData());
  });

  it("parses disclosure_alerts.json payload", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-alerts-data-"));
    const filePath = path.join(tmpDir, "disclosure_alerts.json");
    fs.writeFileSync(filePath, JSON.stringify({
      generatedAt: "2026-02-26T10:00:00.000Z",
      newHigh: [{ corpName: "삼성전자", categoryLabel: "자본/증자/감자", title: "유상증자 결정", rceptNo: "2026000100", clusterScore: 98 }],
      newMid: [],
      updatedHigh: [],
      updatedMid: [{ corpName: "LG전자", categoryLabel: "공급계약/소송", title: "단일판매 공급계약 체결", rceptNo: "2026000200", clusterScore: 82 }],
    }), "utf-8");

    const parsed = readDisclosureAlerts(filePath);
    expect(parsed.generatedAt).toBe("2026-02-26T10:00:00.000Z");
    expect(parsed.newHigh).toHaveLength(1);
    expect(parsed.newHigh[0]?.rceptNo).toBe("2026000100");
    expect(parsed.updatedMid).toHaveLength(1);
  });
});
