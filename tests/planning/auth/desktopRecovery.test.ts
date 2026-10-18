import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanningAuthRequiredState } from "../../../src/components/planning/PlanningAuthRequiredState";
import { PlanningAuthError } from "../../../src/lib/planning/auth/currentUser";

describe("planning authentication recovery", () => {
  it("directs a missing desktop session to the launcher instead of external OAuth", () => {
    const error = Object.assign(new PlanningAuthError("UNAUTHENTICATED", "데스크톱 세션을 확인하지 못했습니다.", 401), {
      recovery: "desktop-launcher" as const,
    });
    const html = renderToStaticMarkup(createElement(PlanningAuthRequiredState, { error }));
    expect(html).toContain("앱 실행 경로로 다시 열어 주세요.");
    expect(html).toContain("외부 계정 로그인");
    expect(html).not.toContain("/api/auth/signin");
    expect(html).not.toContain("로그인하기");
  });

  it("returns a recovered desktop session to the dashboard it was opened from", () => {
    const error = new PlanningAuthError("UNAUTHENTICATED", "데스크톱 세션을 확인하지 못했습니다.", 401, "desktop-launcher");
    const html = renderToStaticMarkup(createElement(PlanningAuthRequiredState, { error, callbackPath: "/dashboard" }));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("세션 다시 확인");
    expect(html).not.toContain("/api/auth/signin");
  });

  it("keeps web authentication and its callback unchanged", () => {
    const error = new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
    const html = renderToStaticMarkup(createElement(PlanningAuthRequiredState, { error, callbackPath: "/settings/backup" }));
    expect(html).toContain("/api/auth/signin?callbackUrl=%2Fsettings%2Fbackup");
    expect(html).toContain("로그인하기");
    expect(html).not.toContain("앱 실행 경로로 다시 열어 주세요.");
  });
});
