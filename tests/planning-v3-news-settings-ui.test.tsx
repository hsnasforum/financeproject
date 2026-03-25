import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildAlertRuleDraftEffective,
  canSaveNewsSettings,
  getAlertRulesApplyStatus,
  getAlertRulesSectionStatus,
  getNewsSettingsSaveStatus,
  hasAlertRulesDraftChanges,
  NewsSettingsClient,
  parseAlertRuleOverridesJson,
} from "../src/app/planning/v3/news/settings/_components/NewsSettingsClient";

vi.mock("next/navigation", () => ({
  usePathname: () => "/planning/v3/news/settings",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("planning v3 news settings ui", () => {
  it("renders alert rule override section in advanced settings", () => {
    const html = renderToStaticMarkup(<NewsSettingsClient csrf="" />);

    expect(html).toContain("뉴스 기준 설정");
    expect(html).toContain("고급 관리 및 알림 규칙");
    expect(html).toContain("알림 규칙 오버라이드 (JSON)");
    expect(html).toContain("href=\"#news-settings-alert-rules\"");
    expect(html).toContain("로딩 중...");
    expect(html).toContain("알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다.");
    expect(html).toContain("뉴스 기준/내 상황 저장");
    expect(html).toContain("href=\"/planning/v3/news/alerts\"");
    expect(html).toContain("알림함 확인");
  });

  it("builds draft effective rows from JSON overrides", () => {
    const parsed = parseAlertRuleOverridesJson(JSON.stringify([
      { id: "topic_burst_high", enabled: false },
    ]));
    const rows = buildAlertRuleDraftEffective([
      {
        id: "topic_burst_high",
        name: "토픽 급증(상)",
        kind: "topic_burst",
        enabled: true,
        level: "high",
        topicId: "*",
        minBurstLevel: "상",
        minTodayCount: 2,
      },
    ], parsed.rules);

    expect(parsed.error).toBe("");
    expect(rows[0]?.enabled).toBe(false);
  });

  it("treats alert-rule draft changes separately from main settings save", () => {
    expect(hasAlertRulesDraftChanges("[]\n", "[]\n")).toBe(false);
    expect(hasAlertRulesDraftChanges("[{\"id\":\"topic_burst_high\",\"enabled\":false}]\n", "[]\n")).toBe(true);
    expect(canSaveNewsSettings(true, false)).toBe(true);
    expect(canSaveNewsSettings(true, true)).toBe(false);
    expect(getNewsSettingsSaveStatus(false, true)).toBe("알림 규칙은 아직 적용 전이며 메인 저장에는 포함되지 않습니다.");
    expect(getNewsSettingsSaveStatus(true, true)).toBe("알림 규칙 미적용 변경이 있어 뉴스 기준/내 상황 저장을 잠시 막았습니다.");
    expect(getNewsSettingsSaveStatus(true, false)).toBe("뉴스 기준 또는 내 상황 프로필에 저장 전 변경이 있습니다.");
    expect(getNewsSettingsSaveStatus(false, false)).toBe("뉴스 기준 저장 대상과 알림 규칙 적용 상태가 현재 화면과 같습니다.");
    expect(getNewsSettingsSaveStatus(false, false, false)).toBe("뉴스 기준과 내 상황 프로필은 현재 저장 전 변경이 없고, 알림 규칙 적용 상태는 다시 확인이 필요합니다.");
    expect(getAlertRulesApplyStatus(true)).toBe("알림 규칙에 적용 전 변경이 있습니다. 적용 전까지는 마지막 적용 기준이 계속 사용됩니다.");
    expect(getAlertRulesApplyStatus(false)).toBe("알림 규칙은 이 섹션에서만 적용되며, 메인 저장과 별개입니다.");
    expect(getAlertRulesApplyStatus(false, false)).toBe("알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 다시 불러온 뒤 적용 여부를 확인하세요.");
    expect(getAlertRulesSectionStatus(false, "reloading")).toBe("알림 규칙 현재 적용값을 불러오는 중입니다.");
    expect(getAlertRulesSectionStatus(false, "applying")).toBe("알림 규칙을 적용 중입니다.");
    expect(getAlertRulesSectionStatus(false, "idle", false)).toBe("알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 다시 불러온 뒤 적용 여부를 확인하세요.");
  });
});
