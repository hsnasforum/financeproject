import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/dev/dart/alerts/route";

const ALERTS_PATH = path.join(process.cwd(), "tmp", "dart", "disclosure_alerts.json");

describe("dart alerts route", () => {
  it("returns empty data when alerts file is missing", async () => {
    const backup = fs.existsSync(ALERTS_PATH) ? fs.readFileSync(ALERTS_PATH, "utf-8") : null;
    if (backup === null && fs.existsSync(ALERTS_PATH)) fs.unlinkSync(ALERTS_PATH);
    if (backup !== null) fs.unlinkSync(ALERTS_PATH);

    try {
      const response = await GET();
      const json = (await response.json()) as { ok?: boolean; data?: { generatedAt: string | null; newHigh: unknown[] } };
      expect(response.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data?.generatedAt).toBeNull();
      expect(Array.isArray(json.data?.newHigh)).toBe(true);
      expect(json.data?.newHigh).toHaveLength(0);
    } finally {
      if (backup !== null) {
        fs.mkdirSync(path.dirname(ALERTS_PATH), { recursive: true });
        fs.writeFileSync(ALERTS_PATH, backup, "utf-8");
      }
    }
  });
});
