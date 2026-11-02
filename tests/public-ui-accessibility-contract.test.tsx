import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PlanningAuthRequiredState } from "../src/components/planning/PlanningAuthRequiredState";
import { CompareAddNotice } from "../src/components/recommend/CompareAddNotice";
import { resolveRecommendAuthCallbackPath } from "../src/components/recommend/RecommendAuthRequiredState";
import { ButtonLink } from "../src/components/ui/Button";
import { PlanningAuthError } from "../src/lib/planning/auth/currentUser";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function nestedInteractivePairs(sourcePath: string): string[] {
  const sourceText = read(sourcePath);
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  function interactiveRole(node: ts.JsxElement | ts.JsxSelfClosingElement): "link" | "button" | null {
    const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
    const tag = tagName.getText(sourceFile).split(".").at(-1);
    if (tag === "Link" || tag === "ButtonLink" || tag === "a") return "link";
    if (tag === "Button" || tag === "button") return "button";
    return null;
  }

  function visit(node: ts.Node, ancestors: Array<"link" | "button">): void {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const role = interactiveRole(node);
      if (role && ancestors.length > 0) {
        violations.push(`${sourcePath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
      }
      const nextAncestors = role ? [...ancestors, role] : ancestors;
      ts.forEachChild(node, (child) => visit(child, nextAncestors));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, ancestors));
  }

  visit(sourceFile, []);
  return violations;
}

describe("public UI accessibility contract", () => {
  it("renders button-styled navigation as one anchor without a nested button", () => {
    const html = renderToStaticMarkup(
      <ButtonLink href="/planning" variant="primary">재무진단 열기</ButtonLink>,
    );

    expect(html).toMatch(/<a\b[^>]*href="\/planning"/);
    expect(html).not.toContain("<button");
  });

  it("keeps planning auth callbacks on the requested public destination", () => {
    const error = new PlanningAuthError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
    const planningHtml = renderToStaticMarkup(<PlanningAuthRequiredState error={error} />);
    const backupHtml = renderToStaticMarkup(
      <PlanningAuthRequiredState error={error} callbackPath="/settings/backup" />,
    );

    expect(planningHtml).toContain("callbackUrl=%2Fplanning");
    expect(backupHtml).toContain("callbackUrl=%2Fsettings%2Fbackup");
    expect(planningHtml).not.toContain("<button");
  });

  it("allows only canonical recommend paths as sign-in callbacks", () => {
    expect(resolveRecommendAuthCallbackPath("/recommend")).toBe("/recommend");
    expect(resolveRecommendAuthCallbackPath("/recommend/history")).toBe("/recommend/history");
    expect(resolveRecommendAuthCallbackPath("/recommend/history/other")).toBe("/recommend");
    expect(resolveRecommendAuthCallbackPath("/ops")).toBe("/recommend");
    expect(resolveRecommendAuthCallbackPath(null)).toBe("/recommend");
  });

  it("keeps every owned public-stable CTA source free of nested interactive controls", () => {
    const sources = [
      "src/app/recommend/layout.tsx",
      "src/components/DartCompanyPageClient.tsx",
      "src/components/FeedbackFormClient.tsx",
      "src/components/MaintenanceSettingsClient.tsx",
      "src/components/PlanningReportsDashboardClient.tsx",
      "src/components/PlanningRunsClient.tsx",
      "src/components/UnifiedProductDetailClient.tsx",
      "src/components/VaultLockScreenClient.tsx",
      "src/components/recommend/RecommendAuthRequiredState.tsx",
      "src/components/planning/PlanningAuthRequiredState.tsx",
      "src/components/RecommendHistoryClient.tsx",
      "src/components/planning/InterpretationGuide.tsx",
      "src/components/OpsBackupClient.tsx",
      "src/components/RecoveryClient.tsx",
    ];

    for (const sourcePath of sources) {
      expect(nestedInteractivePairs(sourcePath), sourcePath).toEqual([]);
    }
  });

  it("uses a 390px-safe grid summary and announces async public feedback", () => {
    const history = read("src/components/RecommendHistoryClient.tsx");
    const backup = read("src/components/OpsBackupClient.tsx");
    const detail = read("src/components/UnifiedProductDetailClient.tsx");
    const feedback = read("src/components/FeedbackFormClient.tsx");
    const compareNotice = renderToStaticMarkup(<CompareAddNotice
      result={{ id: "deposit-1", status: "added", count: 1, max: 4, droppedLabels: [] }}
      onClose={() => undefined}
    />);

    expect(history).toContain('data-testid="recommend-history-compare-summary"');
    expect(history).toContain("grid-cols-3");
    expect(history).not.toContain("min-w-[100px]");
    expect(backup).toMatch(/role="status" aria-live="polite"/);
    expect(backup).toMatch(/role="alert"/);
    expect(compareNotice).toMatch(/role="status"\s+aria-live="polite"/);
    expect(detail).toMatch(/role="status"\s+aria-live="polite"/);
    expect(feedback).toMatch(/role="status" aria-live="polite"/);
    expect(feedback).toMatch(/role="alert"/);
  });
});
