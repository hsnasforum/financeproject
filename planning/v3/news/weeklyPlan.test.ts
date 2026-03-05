import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  currentKstWeekOf,
  normalizeWeeklyPlanInput,
  readWeeklyPlan,
  resolveWeeklyPlanPath,
  writeWeeklyPlan,
} from "./weeklyPlan";

describe("planning v3 news weekly plan", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("normalizes and deduplicates topics/series ids", () => {
    const normalized = normalizeWeeklyPlanInput({
      topics: ["Rates", " rates ", "Inflation", "oil", ""],
      seriesIds: ["KR_BOK_BASE_RATE", "kr_base_rate", " KR_USDKRW "],
    });

    expect(normalized.topics).toEqual(["rates", "inflation", "commodities"]);
    expect(normalized.seriesIds).toEqual(["kr_base_rate", "kr_usdkrw"]);
  });

  it("writes and reads weekly plan from local store", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-news-weekly-plan-"));

    const saved = writeWeeklyPlan({
      topics: ["rates", "fx"],
      seriesIds: ["KR_BOK_BASE_RATE", "kr_usdkrw"],
      weekOf: "2026-03-02",
    }, root);

    expect(saved.weekOf).toBe("2026-03-02");
    expect(saved.topics).toEqual(["rates", "fx"]);
    expect(saved.seriesIds).toEqual(["kr_base_rate", "kr_usdkrw"]);
    expect(fs.existsSync(resolveWeeklyPlanPath(root))).toBe(true);

    const loaded = readWeeklyPlan(root);
    expect(loaded).not.toBeNull();
    expect(loaded?.weekOf).toBe("2026-03-02");
    expect(loaded?.topics).toEqual(["rates", "fx"]);
    expect(loaded?.seriesIds).toEqual(["kr_base_rate", "kr_usdkrw"]);
  });

  it("computes monday week-of in KST", () => {
    expect(currentKstWeekOf(new Date("2026-03-05T03:00:00.000Z"))).toBe("2026-03-02");
    expect(currentKstWeekOf(new Date("2026-03-08T15:00:00.000Z"))).toBe("2026-03-09");
  });
});
