import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  BackupClient,
  downloadBrowserSettingsBackup,
  formatBrowserSettingsRestoreResult,
} from "@/components/BackupClient";

describe("BackupClient browser settings flow", () => {
  it("does not start a download when one browser setting cannot be read", () => {
    const download = vi.fn();
    const result = downloadBrowserSettingsBackup({
      getItem(key: string) {
        if (key === "products_compare_ids_v1") {
          throw new Error("storage denied");
        }
        return key === "products_shelf_v1" ? "[\"p1\"]" : null;
      },
    }, download);

    expect(result).toMatchObject({
      ok: false,
      failedKeys: ["products_compare_ids_v1"],
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps normal missing values as null and downloads only UI settings", () => {
    const download = vi.fn();
    const result = downloadBrowserSettingsBackup({
      getItem(key: string) {
        return key === "products_shelf_v1" ? "[]" : null;
      },
    }, download);

    expect(result.ok).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    const [, content] = download.mock.calls[0] as [string, string, string];
    const bundle = JSON.parse(content) as {
      serverFiles: Record<string, string | null>;
      clientStorage: Record<string, string | null>;
    };
    expect(bundle.serverFiles).toEqual({});
    expect(bundle.clientStorage).toEqual({
      products_shelf_v1: "[]",
      products_compare_ids_v1: null,
      finlife_planner_link_open_mode_v1: null,
      finlife_planner_checklist_checked_v1: null,
    });
    expect(content).not.toContain("planner:last");
    expect(content).not.toContain("monthlyIncomeNet");
    expect(content).not.toContain("recommend");
  });

  it("states the actual export and legacy restore boundaries in the rendered UI", () => {
    const html = renderToStaticMarkup(<BackupClient ownerId="user-1" />);

    expect(html).toContain("브라우저 화면 설정 내보내기");
    expect(html).toContain("재무 프로필, 플래닝 기록, 추천 조건·결과·저장 실행과 서버 파일은 포함하지 않습니다.");
    expect(html).toContain("기존 백업도 읽을 수 있지만 브라우저에는 허용된 화면 설정만 적용합니다.");
    expect(html).toContain("실패가 있으면 전체 성공으로 표시하지 않습니다.");
    expect(html).toContain("적용");
    expect(html).toContain("제거");
    expect(html).toContain("무시");
    expect(html).toContain("실패");
  });

  it("formats applied, removed, ignored, and failed restore outcomes without false success", () => {
    expect(formatBrowserSettingsRestoreResult({
      applied: 2,
      removed: 1,
      ignored: 3,
      failed: 0,
    })).toEqual({
      notice: "브라우저 설정을 복원했습니다. 적용 2개, 제거 1개, 무시 3개, 실패 0개.",
      error: "",
    });

    expect(formatBrowserSettingsRestoreResult({
      applied: 1,
      removed: 0,
      ignored: 2,
      failed: 1,
    })).toEqual({
      notice: "",
      error: "일부 브라우저 설정을 복원하지 못했습니다. 적용 1개, 제거 0개, 무시 2개, 실패 1개.",
    });
  });
});
