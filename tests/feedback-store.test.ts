import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFeedback, getFeedbackById, listFeedback, listRecent, updateFeedback } from "../src/lib/feedback/feedbackStore";

const TEST_STORE_PATH = path.join(process.cwd(), "tmp", "user_feedback.test.json");

let previousStorePath: string | undefined;

function cleanup() {
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
}

describe("feedback store", () => {
  beforeEach(() => {
    previousStorePath = process.env.FEEDBACK_STORE_PATH;
    process.env.FEEDBACK_STORE_PATH = TEST_STORE_PATH;
    cleanup();
  });

  afterEach(() => {
    cleanup();
    if (typeof previousStorePath === "string") process.env.FEEDBACK_STORE_PATH = previousStorePath;
    else delete process.env.FEEDBACK_STORE_PATH;
  });

  it("adds feedback and returns recent rows", () => {
    const saved = addFeedback({
      category: "bug",
      message: "검색 필터 적용 시 결과가 비어 보입니다.",
      traceId: "trace-1",
      userAgent: "test-agent",
      url: "http://localhost:3000/feedback",
      appVersion: "test",
    });

    const rows = listRecent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(saved.id);
    expect(rows[0]?.category).toBe("bug");
    expect(rows[0]?.message).toContain("검색 필터");
  });

  it("keeps only latest 200 rows", () => {
    for (let i = 0; i < 205; i += 1) {
      addFeedback({
        category: "improve",
        message: `개선 제안 ${i} 상세 내용`,
        traceId: null,
        userAgent: null,
        url: null,
        appVersion: "test",
      });
    }

    const rows = listRecent(500);
    expect(rows).toHaveLength(200);
    expect(rows[0]?.message).toContain("204");
    expect(rows[199]?.message).toContain("5");
  });

  it("applies list limit from latest order", () => {
    for (let i = 0; i < 8; i += 1) {
      addFeedback({
        category: "question",
        message: `질문 ${i} 상세`,
        traceId: null,
        userAgent: null,
        url: null,
        appVersion: "test",
      });
    }

    const rows = listFeedback(3);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.message).toContain("7");
    expect(rows[1]?.message).toContain("6");
    expect(rows[2]?.message).toContain("5");
  });

  it("finds item by id and returns null for unknown id", () => {
    const one = addFeedback({
      category: "improve",
      message: "설명 텍스트를 더 직관적으로 수정해 주세요.",
      traceId: "trace-find",
      userAgent: null,
      url: "/feedback",
      appVersion: "test",
    });

    const found = getFeedbackById(one.id);
    expect(found?.id).toBe(one.id);
    expect(found?.message).toContain("직관적으로");

    const missing = getFeedbackById("missing-id");
    expect(missing).toBeNull();
  });

  it("updates status/tags/note/priority/dueDate/tasks by id", () => {
    const saved = addFeedback({
      category: "bug",
      message: "업데이트 테스트",
      traceId: "trace-update",
      userAgent: null,
      url: "/feedback",
      appVersion: "test",
    });

    const updated = updateFeedback(saved.id, {
      status: "DOING",
      tags: ["api", "urgent"],
      note: "원인 분석 중",
      priority: "P0",
      dueDate: "2026-03-01",
      tasks: [
        { id: "t1", text: "재현 단계 정리", done: true },
        { id: "t2", text: "패치 검증", done: false },
      ],
    });
    expect(updated?.status).toBe("DOING");
    expect(updated?.tags).toEqual(["api", "urgent"]);
    expect(updated?.note).toBe("원인 분석 중");
    expect(updated?.priority).toBe("P0");
    expect(updated?.dueDate).toBe("2026-03-01");
    expect(updated?.tasks).toHaveLength(2);
    expect(updated?.tasks[0]?.done).toBe(true);
  });

  it("resets file when stored json is invalid", () => {
    fs.mkdirSync(path.dirname(TEST_STORE_PATH), { recursive: true });
    fs.writeFileSync(TEST_STORE_PATH, "{ invalid json", "utf-8");

    const rows = listRecent(20);
    expect(rows).toEqual([]);

    const repaired = JSON.parse(fs.readFileSync(TEST_STORE_PATH, "utf-8")) as unknown;
    expect(repaired).toEqual([]);
  });
});
