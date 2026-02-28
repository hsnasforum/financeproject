import { describe, expect, it } from "vitest";
import { buildIssueMarkdown } from "../src/lib/feedback/issueTemplate";

describe("issue template builder", () => {
  it("includes required sections", () => {
    const markdown = buildIssueMarkdown(
      {
        id: "fb_1",
        createdAt: "2026-02-27T09:00:00.000Z",
        category: "bug",
        message: "필터를 적용하면 화면이 비어 보입니다.",
        traceId: "trace-1",
        userAgent: "vitest",
        url: "http://localhost:3000/feedback/1",
        appVersion: "1.2.3",
        snapshot: {
          generatedAt: "2026-02-27T09:01:00.000Z",
          appVersion: "1.2.3",
          page: { url: "http://localhost:3000/feedback/1", userAgent: "vitest" },
          recentErrors: [
            {
              time: "2026-02-27T09:00:55.000Z",
              traceId: "trace-1",
              route: "/api/feedback",
              source: "feedback",
              code: "ERR_TEST",
              message: "sample",
              status: 500,
              elapsedMs: 34,
            },
          ],
          dailyRefresh: {
            generatedAt: "2026-02-27T08:00:00.000Z",
            ok: true,
            steps: [
              { name: "finlife", status: "ok", tookMs: 1200 },
              { name: "dart", status: "skipped", tookMs: 0 },
            ],
          },
          dartArtifacts: {
            dirExists: true,
            items: [{ name: "corp_codes.json", exists: true, updatedAt: "2026-02-27T07:00:00.000Z" }],
          },
          localStateSummary: {
            planner_last_snapshot_v1: { exists: true, savedAt: "2026-02-27T06:00:00.000Z" },
          },
        },
      },
      { includeFullSnapshot: true },
    );

    expect(markdown).toContain("## 요약");
    expect(markdown).toContain("## 현상");
    expect(markdown).toContain("## 재현 절차");
    expect(markdown).toContain("## 기대 동작");
    expect(markdown).toContain("## 실제 동작");
    expect(markdown).toContain("## 진단 요약");
    expect(markdown).toContain("### 최근 오류 Top5");
    expect(markdown).toContain("### Daily Refresh");
    expect(markdown).toContain("### DART Artifacts");
    expect(markdown).toContain("## Snapshot JSON");
  });

  it("applies snapshot length limit", () => {
    const markdown = buildIssueMarkdown(
      {
        id: "fb_2",
        createdAt: "2026-02-27T10:00:00.000Z",
        category: "improve",
        message: "템플릿 길이 제한 확인",
        traceId: null,
        userAgent: null,
        url: null,
        appVersion: null,
        snapshot: {
          generatedAt: "2026-02-27T10:01:00.000Z",
          appVersion: "1.0.0",
          page: { url: "/feedback/2", userAgent: "test" },
          recentErrors: [],
          dailyRefresh: null,
          dartArtifacts: {
            dirExists: true,
            items: Array.from({ length: 80 }, (_, index) => ({
              name: `artifact_${index}.json`,
              exists: true,
              updatedAt: "2026-02-27T10:00:00.000Z",
            })),
          },
          localStateSummary: null,
        },
      },
      { includeFullSnapshot: true, maxSnapshotChars: 700 },
    );

    expect(markdown).toContain("... [truncated]");
  });

  it("handles empty fields safely", () => {
    const markdown = buildIssueMarkdown({
      id: "fb_3",
      createdAt: "invalid-date",
      category: "question",
      message: "   ",
      traceId: null,
      userAgent: null,
      url: "",
      appVersion: null,
    });

    expect(markdown).toContain("- 시간: -");
    expect(markdown).toContain("- URL: -");
    expect(markdown).toContain("메시지가 비어 있습니다.");
    expect(markdown).toContain("- 최근 오류 없음");
    expect(markdown).not.toContain("## Snapshot JSON");
  });
});

