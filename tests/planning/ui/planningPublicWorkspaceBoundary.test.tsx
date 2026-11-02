import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanningAuthError } from "../../../src/lib/planning/auth/currentUser";
import { PlanningAuthRequiredState } from "../../../src/components/planning/PlanningAuthRequiredState";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

describe("planning public workspace boundary", () => {
  it("renders only a sign-in path when planning authentication is required", () => {
    const html = renderToStaticMarkup(createElement(PlanningAuthRequiredState, {
      error: new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401),
    }));

    expect(html).toContain("로그인 후 재무 설계를 시작해 주세요.");
    expect(html).toContain("callbackUrl=%2Fplanning");
    expect(html).not.toContain("월 잉여금");
    expect(html).not.toContain("샘플 불러오기");
  });

  it("keeps duplicate onboarding and ops links out of the public workspace", () => {
    const topSurface = read("src/components/planning/workspace/panels/topSurfacePanel.tsx");
    const snapshotPicker = read("src/components/planning/workspace/SnapshotPicker.tsx");
    const execution = read("src/components/planning/workspace/panels/executionPanel.tsx");
    const results = read("src/components/planning/workspace/panels/resultsPanel.tsx");

    expect(topSurface).not.toContain("PlanningOnboardingWizard");
    expect(snapshotPicker).not.toContain('href="/ops/assumptions');
    expect(execution).not.toContain('href="/ops/assumptions');
    expect(results).not.toContain("/ops/assumptions");
    expect(snapshotPicker).toContain('href="/settings/data-sources"');
  });

  it("shows developer editors only behind the debug feature flag", () => {
    const profilePanel = read("src/components/planning/workspace/panels/profilePanel.tsx");
    const executionPanel = read("src/components/planning/workspace/panels/executionPanel.tsx");
    const resultsPanel = read("src/components/planning/workspace/panels/resultsPanel.tsx");

    expect(profilePanel).toContain("{debugEnabled ? (");
    expect(executionPanel).toContain("{debugEnabled && !beginnerMode ? (");
    expect(resultsPanel).toContain("debugEnabled && warningsGoalsDebugSections.length");
  });
});
