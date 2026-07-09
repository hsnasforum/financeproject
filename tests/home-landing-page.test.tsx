import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../src/app/page";

describe("home landing page", () => {
  it("renders as a public landing page without planning run store dependencies", () => {
    const source = readFileSync("src/app/page.tsx", "utf8");

    expect(source).not.toMatch(/listRuns|safeBuildReportVMFromRun|getProfile|buildPlanningBenefitSignals/);

    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("재무 상태 진단 시작");
    expect(html).toContain("샘플 결과 미리보기");
    expect(html).toContain("출처와 기준 시점을 같이 봅니다");
  });
});
