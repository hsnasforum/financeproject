import { describe, expect, it } from "vitest";

import {
  BROWSER_SETTINGS_STORAGE_WHITELIST,
  buildBundle,
  prepareBrowserSettingsBackup,
  restoreBrowserSettingsStorage,
  selectBrowserSettingsStorage,
} from "@/lib/backup/backupBundle";

describe("plain browser settings backup", () => {
  it("distinguishes stored strings, missing values, and read failures before download", () => {
    const storage = {
      getItem(key: string) {
        if (key === "products_compare_ids_v1") throw new Error("storage denied");
        if (key === "products_shelf_v1") return "[\"p1\"]";
        return null;
      },
    };

    const prepared = prepareBrowserSettingsBackup(storage);

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.failedKeys).toEqual(["products_compare_ids_v1"]);
    expect(prepared.values).toEqual({
      products_shelf_v1: "[\"p1\"]",
      finlife_planner_link_open_mode_v1: null,
    });
    expect(prepared.values).not.toHaveProperty("products_compare_ids_v1");
    expect(prepared.error).toContain("다운로드하지 않았습니다");
  });

  it("builds a complete bundle when every browser setting can be read", () => {
    const prepared = prepareBrowserSettingsBackup({
      getItem(key: string) {
        return key === "products_shelf_v1" ? "[]" : null;
      },
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.bundle.clientStorage).toEqual({
      products_shelf_v1: "[]",
      products_compare_ids_v1: null,
      finlife_planner_link_open_mode_v1: null,
    });
    expect(prepared.notice).toContain("저장값 1개, 비어 있음 2개");
  });

  it("exports only non-financial UI settings", () => {
    const selected = selectBrowserSettingsStorage({
      products_shelf_v1: "[]",
      products_compare_ids_v1: "[\"p1\"]",
      "planner:last": "{\"monthlyIncomeNet\":5000000}",
      finlife_planner_snapshots_v1: "{\"debts\":[]}",
      "finance:recommend:v2:alice:profile": "{\"purpose\":\"seed-money\"}",
      recommend_last_result_v1: "{\"items\":[]}",
      finlife_planner_checklist_checked_v1: JSON.stringify({
        "R_DEBT_01-월 상환액 재산정": true,
        "R_INSURANCE_01-보장 공백 확인": true,
        "R_EMERGENCY_01-비상금 자동이체": false,
      }),
    });
    const bundle = buildBundle({ serverFilesMap: {}, clientStorageMap: selected });

    expect(BROWSER_SETTINGS_STORAGE_WHITELIST).toEqual([
      "products_shelf_v1",
      "products_compare_ids_v1",
      "finlife_planner_link_open_mode_v1",
    ]);
    expect(bundle.clientStorage).toEqual({
      products_shelf_v1: "[]",
      products_compare_ids_v1: "[\"p1\"]",
    });
  });

  it("counts applied, removed, ignored, and failed entries independently", () => {
    const written = new Map<string, string>();
    const removed: string[] = [];
    const storage = {
      setItem(key: string, value: string) {
        if (key === "products_compare_ids_v1") throw new Error("quota");
        written.set(key, value);
      },
      removeItem(key: string) {
        removed.push(key);
      },
    };

    const result = restoreBrowserSettingsStorage(storage, {
      products_shelf_v1: "[\"p1\"]",
      products_compare_ids_v1: "[\"p2\"]",
      finlife_planner_link_open_mode_v1: null,
      "planner:last": "{\"monthlyIncomeNet\":5000000}",
      "finance:recommend:v2:alice:last-result": "{\"items\":[]}",
    });

    expect(result).toEqual({ applied: 1, removed: 1, ignored: 2, failed: 1 });
    expect(written.get("products_shelf_v1")).toBe("[\"p1\"]");
    expect(removed).toEqual(["finlife_planner_link_open_mode_v1"]);
  });

  it("ignores a legacy financial checklist without changing the current stored value", () => {
    const financialChecklistKey = "finlife_planner_checklist_checked_v1";
    const currentChecklist = JSON.stringify({ "R_DEBT_01-월 상환액 재산정": true });
    const legacyChecklist = JSON.stringify({
      "R_INSURANCE_01-보장 공백 확인": true,
      "R_EMERGENCY_01-비상금 자동이체": false,
    });
    const values = new Map<string, string>([[financialChecklistKey, currentChecklist]]);
    const writes: string[] = [];
    const removals: string[] = [];

    const result = restoreBrowserSettingsStorage({
      setItem(key: string, value: string) {
        writes.push(key);
        values.set(key, value);
      },
      removeItem(key: string) {
        removals.push(key);
        values.delete(key);
      },
    }, {
      [financialChecklistKey]: legacyChecklist,
    });

    expect(result).toEqual({ applied: 0, removed: 0, ignored: 1, failed: 0 });
    expect(values.get(financialChecklistKey)).toBe(currentChecklist);
    expect(writes).toEqual([]);
    expect(removals).toEqual([]);
  });
});
