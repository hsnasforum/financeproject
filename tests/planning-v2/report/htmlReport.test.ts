import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderHtmlReport } from "../../../src/lib/planning/v2/report/htmlReport";
import { type ResultDtoV1 } from "../../../src/lib/planning/v2/resultDto";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "planning-v2", "report", "fixtures");

function loadFixture(name: "dto-ok" | "dto-warn" | "dto-risk"): ResultDtoV1 {
  const filePath = path.join(FIXTURE_DIR, `${name}.json`);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ResultDtoV1;
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, " ").trim();
}

function sectionBlock(html: string, headingKeyword: string): string {
  const pattern = new RegExp(`<section class="section">[\\s\\S]*?<h2>${headingKeyword}[\\s\\S]*?</section>`);
  const matched = html.match(pattern);
  return matched?.[0] ?? "";
}

function tableRowCount(section: string): number {
  const tbody = section.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const rows = tbody.match(/<tr\b/gi) ?? [];
  return rows.length;
}

describe("planning v2 html report quality", () => {
  it("renders required sections and blocks raw dump patterns for 3 fixtures", () => {
    const fixtureNames: Array<"dto-ok" | "dto-warn" | "dto-risk"> = ["dto-ok", "dto-warn", "dto-risk"];

    for (const fixtureName of fixtureNames) {
      const html = normalizeHtml(renderHtmlReport(loadFixture(fixtureName), { title: `Sample ${fixtureName}` }));

      expect(html).toContain("Executive Summary");
      expect(html).toContain("Warnings Summary");
      expect(html).toContain("Goals Table");
      expect(html).toContain("Action Plan Top3");
      expect(html).toContain("보장하지 않고 투자 권유가 아닙니다");

      expect(html).not.toContain("```json");
      expect(html).not.toContain("<pre>{");
      expect(html).not.toContain("요약 지표를 찾을 수 없습니다");

      expect(html).toMatch(/₩-?\d[\d,]*/);
      expect(html).toMatch(/\d+(?:\.\d+)?%/);

      const warningsSection = sectionBlock(html, "Warnings");
      const goalsSection = sectionBlock(html, "Goals");
      expect(tableRowCount(warningsSection)).toBeGreaterThanOrEqual(1);
      expect(tableRowCount(goalsSection)).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows risk wording for dto-risk", () => {
    const html = normalizeHtml(renderHtmlReport(loadFixture("dto-risk"), { title: "Sample risk" }));

    expect(html).toContain("위험");
    expect(html).toContain("badge-risk");
  });

  it("shows explicit no-warning row for dto-ok", () => {
    const html = normalizeHtml(renderHtmlReport(loadFixture("dto-ok"), { title: "Sample ok" }));
    const warningsSection = sectionBlock(html, "Warnings");

    expect(tableRowCount(warningsSection)).toBe(1);
    expect(warningsSection).toContain("경고 없음");
  });
});
