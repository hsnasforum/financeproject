import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  NewsAlertsClient,
  NEWS_ALERT_RULES_SETTINGS_HREF,
} from "../src/app/planning/v3/news/_components/NewsAlertsClient";

vi.mock("next/navigation", () => ({
  usePathname: () => "/planning/v3/news/alerts",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("planning v3 news alerts ui", () => {
  it("renders write-side hero CTA and filter surface", () => {
    const html = renderToStaticMarkup(<NewsAlertsClient csrf="" />);

    expect(NEWS_ALERT_RULES_SETTINGS_HREF).toBe("/planning/v3/news/settings#news-settings-alert-rules");
    expect(html).toContain("중요 알림");
    expect(html).toContain("오늘 브리핑");
    expect(html).toContain("흐름 보기");
    expect(html).toContain("뉴스 탐색");
    expect(html).toContain(NEWS_ALERT_RULES_SETTINGS_HREF);
    expect(html).toContain("설정");
    expect(html).toContain("빠른 필터");
    expect(html).toContain(">7일<");
    expect(html).toContain(">30일<");
    expect(html).toContain("표시중");
    expect(html).toContain("미확인");
    expect(html).toContain("확인 완료");
    expect(html).toContain("숨김");
    expect(html).toContain("중요");
    expect(html).toContain("전체 출처");
    expect(html).toContain("알림 브리핑");
    expect(html).toContain('href="/planning/v3/news/settings#news-settings-alert-rules"');
  });

  it("shows loading-state guidance before alerts data arrives", () => {
    const html = renderToStaticMarkup(<NewsAlertsClient csrf="" />);

    expect(html).toContain("필터 결과 0건");
    expect(html).toContain("중요도 상 알림 수");
    expect(html).toContain("숨김을 제외하고 아직 읽지 않은 알림");
    expect(html).toContain("숨김 / 확인 완료 알림 수");
    expect(html).toContain("알림 이벤트");
    expect(html).toContain("중요한 신호를 먼저 확인하고 상태를 관리하세요.");
    expect(html).toContain("필터 결과 0건");
    expect(html).toContain("불러오는 중...");
  });
});
