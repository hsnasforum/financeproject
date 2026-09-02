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
      finlife_planner_checklist_checked_v1: null,
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
      finlife_planner_checklist_checked_v1: null,
    });
    expect(prepared.notice).toContain("저장값 1개, 비어 있음 3개");
  });

  it("exports only non-financial UI settings", () => {
    const selected = selectBrowserSettingsStorage({
      products_shelf_v1: "[]",
      products_compare_ids_v1: "[\"p1\"]",
      "planner:last": "{\"monthlyIncomeNet\":5000000}",
      finlife_planner_snapshots_v1: "{\"debts\":[]}",
      "finance:recommend:v2:alice:profile": "{\"purpose\":\"seed-money\"}",
      recommend_last_result_v1: "{\"items\":[]}",
    });
    const bundle = buildBundle({ serverFilesMap: {}, clientStorageMap: selected });

    expect(BROWSER_SETTINGS_STORAGE_WHITELIST).toEqual([
      "products_shelf_v1",
      "products_compare_ids_v1",
      "finlife_planner_link_open_mode_v1",
      "finlife_planner_checklist_checked_v1",
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
});
