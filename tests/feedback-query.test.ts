import { describe, expect, it } from "vitest";
import { filterAndSearch } from "../src/lib/feedback/feedbackQuery";

type Row = {
  id: string;
  status: "OPEN" | "DOING" | "DONE";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate: string | null;
  createdAt: string;
  tags: string[];
  message: string;
  url: string | null;
  traceId: string | null;
  note: string;
};

const rows: Row[] = [
  {
    id: "1",
    status: "OPEN",
    priority: "P1",
    dueDate: "2026-02-28",
    createdAt: "2026-02-27T10:00:00.000Z",
    tags: ["ui", "urgent"],
    message: "대시보드 버튼 정렬이 깨짐",
    url: "/dashboard",
    traceId: "trace-1",
    note: "모바일에서 재현",
  },
  {
    id: "2",
    status: "DOING",
    priority: "P0",
    dueDate: "2026-02-27",
    createdAt: "2026-02-27T11:00:00.000Z",
    tags: ["api"],
    message: "PATCH 저장 시 응답 지연",
    url: "/feedback/2",
    traceId: "trace-2",
    note: "백엔드 확인 중",
  },
  {
    id: "3",
    status: "DONE",
    priority: "P0",
    dueDate: "2026-02-26",
    createdAt: "2026-02-27T12:00:00.000Z",
    tags: ["ui", "copy"],
    message: "복사 버튼 성공 메시지 개선",
    url: "/feedback/3",
    traceId: "trace-3",
    note: "",
  },
];

describe("feedback query", () => {
  it("filters by status", () => {
    const result = filterAndSearch(rows, { status: "DOING" });
    expect(result.map((row) => row.id)).toEqual(["2"]);
  });

  it("filters by tag (case-insensitive)", () => {
    const result = filterAndSearch(rows, { tag: "UI" });
    expect(result.map((row) => row.id)).toEqual(["1", "3"]);
  });

  it("searches by message/url/traceId/note", () => {
    expect(filterAndSearch(rows, { q: "정렬" }).map((row) => row.id)).toEqual(["1"]);
    expect(filterAndSearch(rows, { q: "/feedback/2" }).map((row) => row.id)).toEqual(["2"]);
    expect(filterAndSearch(rows, { q: "trace-3" }).map((row) => row.id)).toEqual(["3"]);
    expect(filterAndSearch(rows, { q: "백엔드 확인" }).map((row) => row.id)).toEqual(["2"]);
  });

  it("applies combined filters", () => {
    const result = filterAndSearch(rows, {
      status: "DONE",
      tag: "copy",
      q: "복사",
    });
    expect(result.map((row) => row.id)).toEqual(["3"]);
  });

  it("sorts by status group, priority and dueDate", () => {
    const result = filterAndSearch(rows, {});
    expect(result.map((row) => row.id)).toEqual(["2", "1", "3"]);
  });
});
