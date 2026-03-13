import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildAlertRuleDraftEffective,
  buildAlertRuleItemTargetCandidates,
  buildAlertRuleScenarioTargetCandidates,
  canSaveNewsSettings,
  clearAlertRuleOverride,
  getAlertRulesApplyStatus,
  getAlertRuleTargetIdSuggestions,
  getAlertRuleTargetPickerHint,
  getAlertRulesSectionStatus,
  getNewsSettingsSaveDetail,
  getNewsSettingsSaveStatus,
  hasAlertRulesDraftChanges,
  NewsSettingsClient,
  parseAlertRuleOverridesJson,
  setAlertRuleOverrideFields,
  setAlertRuleEnabledOverride,
  shouldOpenAlertRulesPanel,
} from "../src/app/planning/v3/news/settings/_components/NewsSettingsClient";

describe("planning v3 news settings ui", () => {
  it("renders alert rule override section in advanced settings", () => {
    const html = renderToStaticMarkup(<NewsSettingsClient csrf="" />);

    expect(html).toContain("알림 규칙 오버라이드");
    expect(html).toContain("먼저 아래 토글과 빠른 조정으로 규칙 조건을 바꾸고");
    expect(html).toContain("현재 유효 규칙");
    expect(html).toContain("불러오는 중...");
    expect(html).toContain("href=\"#news-settings-alert-rules\"");
    expect(html).toContain("뉴스 기준과 내 상황 프로필 설정을 불러오는 중입니다.");
    expect(html).toContain("알림 규칙 현재 적용 상태를 불러오는 중입니다.");
    expect(html).toContain("뉴스 기준/내 상황 저장");
    expect(html).toContain("마지막 적용 시각");
    expect(html).toContain("적용 뒤 결과 확인");
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

  it("drops enabled override when toggled back to default", () => {
    const next = setAlertRuleEnabledOverride(
      [{ id: "topic_burst_high", enabled: false }],
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
      true,
    );

    expect(next).toEqual([]);
  });

  it("drops field override when edited value matches default rule", () => {
    const next = setAlertRuleOverrideFields(
      [{ id: "topic_burst_high", enabled: false, minTodayCount: 4 }],
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
      { minTodayCount: 2 },
    );

    expect(next).toEqual([{ id: "topic_burst_high", enabled: false }]);
  });

  it("clears the whole override row when reset is requested", () => {
    const next = clearAlertRuleOverride(
      [
        { id: "topic_burst_high", enabled: false },
        { id: "indicator_fx_zscore_high", threshold: 1.5 },
      ],
      "topic_burst_high",
    );

    expect(next).toEqual([{ id: "indicator_fx_zscore_high", threshold: 1.5 }]);
  });

  it("keeps the alert rules panel open when load error exists", () => {
    expect(shouldOpenAlertRulesPanel(0, "")).toBe(false);
    expect(shouldOpenAlertRulesPanel(2, "")).toBe(true);
    expect(shouldOpenAlertRulesPanel(0, "알림 규칙을 불러오지 못했습니다.")).toBe(true);
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
    expect(getNewsSettingsSaveDetail(true, true)).toBe("메인 저장은 뉴스 기준과 내 상황 프로필만 처리합니다. 알림 규칙은 아래 섹션에서 먼저 적용해 주세요.");
    expect(getNewsSettingsSaveDetail(false, true)).toBe("알림 규칙은 이 섹션의 적용 버튼으로만 반영되며, 메인 저장에는 포함되지 않습니다.");
    expect(getNewsSettingsSaveDetail(false, false, false)).toBe("뉴스 기준과 내 상황 프로필은 현재 저장 전 변경이 없습니다. 알림 규칙 적용 상태는 다시 불러와 확인해 주세요.");
    expect(getAlertRulesApplyStatus(true)).toBe("알림 규칙에 적용 전 변경이 있습니다. 적용 전까지는 마지막 적용 기준이 계속 사용됩니다.");
    expect(getAlertRulesApplyStatus(false)).toBe("알림 규칙은 이 섹션에서만 적용되며, 메인 저장과 별개입니다.");
    expect(getAlertRulesApplyStatus(false, false)).toBe("알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 다시 불러온 뒤 적용 여부를 확인하세요.");
    expect(getAlertRulesSectionStatus(false, "reloading")).toBe("알림 규칙 현재 적용값을 불러오는 중입니다.");
    expect(getAlertRulesSectionStatus(false, "applying")).toBe("알림 규칙을 적용 중입니다.");
    expect(getAlertRulesSectionStatus(false, "idle", false)).toBe("알림 규칙 현재 적용 상태를 아직 확인하지 못했습니다. 다시 불러온 뒤 적용 여부를 확인하세요.");
  });

  it("returns guided target id suggestions for topic, series, and scenario targets", () => {
    expect(getAlertRuleTargetIdSuggestions("topic", [
      { id: "fx", label: "환율", defaultKeywords: [], overrideKeywords: null, effectiveKeywords: [] },
      { id: "rates", label: "금리", defaultKeywords: [], overrideKeywords: null, effectiveKeywords: [] },
    ], [])).toEqual(["fx", "rates"]);

    expect(getAlertRuleTargetIdSuggestions("series", [], [
      {
        id: "kr_usdkrw",
        sourceId: "bok",
        externalId: "731Y003/0000003",
        name: "USDKRW",
        frequency: "D",
        annotation: { seriesId: "kr_usdkrw", category: "fx", label: "환율" },
        displayLabel: "USDKRW",
      },
    ])).toEqual(["kr_usdkrw"]);

    expect(getAlertRuleTargetIdSuggestions("scenario", [], [])).toEqual(["Base", "Bull", "Bear"]);
    expect(getAlertRuleTargetIdSuggestions("item", [], [], {
      itemCandidates: [{ id: "https://example.com/item-1", label: "기사 1" }],
    })).toEqual(["https://example.com/item-1"]);
    expect(getAlertRuleTargetIdSuggestions("scenario", [], [], {
      scenarioCandidates: [{ id: "Stress", label: "Stress" }],
    })).toEqual(["Stress"]);
  });

  it("builds guided picker candidates from digest items and scenarios", () => {
    expect(buildAlertRuleItemTargetCandidates({
      topItems: [
        {
          title: "환율 급등 기사",
          url: "https://example.com/item-1",
          topicLabel: "환율",
          sourceName: "Example News",
        },
        {
          title: "중복 기사",
          url: "https://example.com/item-1",
          topicLabel: "환율",
          sourceName: "Example News",
        },
      ],
    })).toEqual([
      {
        id: "https://example.com/item-1",
        label: "환율 급등 기사",
        detail: "환율 · Example News",
      },
    ]);

    expect(buildAlertRuleScenarioTargetCandidates({
      scenarios: [
        {
          name: "Bull",
          linkedTopics: ["fx", "rates"],
          triggerSummary: "환율 상승 시나리오",
        },
        {
          name: "Bear",
          observation: "방어 시나리오",
        },
      ],
    })).toEqual([
      {
        id: "Bull",
        label: "Bull · fx, rates",
        detail: "환율 상승 시나리오",
      },
      {
        id: "Bear",
        label: "Bear",
        detail: "방어 시나리오",
      },
    ]);
  });

  it("returns clearer picker fallback hints for item and scenario targets", () => {
    expect(getAlertRuleTargetPickerHint("item", 0)).toBe("최근 digest Top Links 캐시가 없어 기사 URL을 직접 입력해야 합니다. 적용 뒤 Digest에서 결과를 확인하세요.");
    expect(getAlertRuleTargetPickerHint("item", 2)).toBe("최근 기사 후보 2개를 바로 고른 뒤 적용하면 Digest에서 결과를 확인할 수 있습니다.");
    expect(getAlertRuleTargetPickerHint("scenario", 0)).toBe("현재 시나리오 캐시가 없어 이름을 직접 입력해야 합니다. 적용 뒤 알림함이나 Digest에서 결과를 확인하세요.");
    expect(getAlertRuleTargetPickerHint("scenario", 3)).toBe("현재 시나리오 후보 3개를 바로 고른 뒤 적용하면 알림함이나 Digest에서 결과를 확인할 수 있습니다.");
  });
});
