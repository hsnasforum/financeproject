import { describe, expect, it } from "vitest";
import { buildFinalReportMarkdown } from "../../../src/lib/planning/release/finalReportTemplate";

describe("buildFinalReportMarkdown", () => {
  it("renders gate table and key sections", () => {
    const markdown = buildFinalReportMarkdown({
      version: "0.1.0",
      createdAt: "2026-02-28T10:00:00.000Z",
      doneHighlights: ["사용자 플로우 완료", "OPS 플로우 완료"],
      userScope: ["프로필 생성/실행/저장"],
      opsScope: ["snapshot sync/rollback"],
      gates: [
        {
          id: "complete",
          command: "pnpm planning:v2:complete",
          status: "PASS",
          logPath: ".data/planning/release/logs/final-report-0.1.0-complete.log",
        },
        {
          id: "acceptance",
          command: "pnpm planning:v2:acceptance",
          status: "SKIPPED",
          logPath: ".data/planning/release/logs/final-report-0.1.0-acceptance.log",
          note: "base-url-not-provided",
        },
      ],
      docsIncluded: ["docs/planning-v2-onepage.md"],
      releaseNotesPath: "docs/releases/planning-v2-0.1.0.md",
      knownLimitations: ["가정 기반 결과이며 보장이 아님"],
      nextCandidates: ["운영 지표 대시보드 고도화"],
    });

    expect(markdown).toContain("# Planning v2 Final Report (0.1.0)");
    expect(markdown).toContain("| complete | PASS |");
    expect(markdown).toContain("| acceptance | SKIPPED |");
    expect(markdown).toContain("docs/planning-v2-onepage.md");
    expect(markdown).toContain("docs/releases/planning-v2-0.1.0.md");
  });
});

