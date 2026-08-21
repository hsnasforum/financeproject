import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../src/app/page";

function countExactTextNode(html: string, text: string): number {
  return html.split(`>${text}<`).length - 1;
}

describe("home landing page", () => {
  it("renders as a public landing page without planning run store dependencies", () => {
    const source = readFileSync("src/app/page.tsx", "utf8");

    expect(source).not.toMatch(/listRuns|safeBuildReportVMFromRun|getProfile|buildPlanningBenefitSignals/);

    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("재무 상태 진단 시작");
    expect(html).toContain("샘플 결과 미리보기");
    expect(html).toContain("출처와 기준 시점을 같이 봅니다");
  });

  it("keeps the savings-only destination aligned with its visible label and Korean copy", () => {
    const html = renderToStaticMarkup(<Home />);
    const savingsAnchor = html.match(/<a[^>]*href="\/products\/catalog\?kind=saving"[^>]*>[\s\S]*?<\/a>/)?.[0];

    expect(savingsAnchor).toBeDefined();
    expect(savingsAnchor).toContain(">적금<");
    expect(savingsAnchor).toContain("적금 금리 비교 후 바로 플랜에 연결");
    expect(savingsAnchor).not.toContain("예적금");

    const expectedCopyCounts: Array<[string, number]> = [
      ["MMD 핵심 기능", 1],
      ["살펴보기 →", 4],
      ["미리보기", 1],
      ["데이터 안내", 1],
      ["오늘의 실행", 1],
      ["시작하기 →", 3],
    ];
    for (const [copy, count] of expectedCopyCounts) {
      expect(countExactTextNode(html, copy)).toBe(count);
    }

    for (const oldCopy of ["MMD Core Features", "Explore →", "Preview", "Data Notice", "Daily Action", "Start →"]) {
      expect(countExactTextNode(html, oldCopy)).toBe(0);
    }
  });
});
