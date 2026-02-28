import { describe, expect, it } from "vitest";
import { buildTodoSummary } from "../src/lib/feedback/todoSummary";

type Row = {
  id: string;
  status: "OPEN" | "DOING" | "DONE";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate: string | null;
  createdAt: string;
  message: string;
};

const now = new Date("2026-02-27T03:00:00.000Z"); // 2026-02-27 12:00 KST

describe("todo summary", () => {
  it("calculates overdue and today(P0/P1) counts for active statuses", () => {
    const rows: Row[] = [
      { id: "over-1", status: "OPEN", priority: "P1", dueDate: "2026-02-26", createdAt: "2026-02-27T01:00:00.000Z", message: "A" },
      { id: "over-2", status: "DOING", priority: "P0", dueDate: "2026-02-25", createdAt: "2026-02-27T02:00:00.000Z", message: "B" },
      { id: "today-1", status: "OPEN", priority: "P2", dueDate: "2026-02-27", createdAt: "2026-02-27T03:00:00.000Z", message: "C" },
      { id: "today-2", status: "OPEN", priority: "P1", dueDate: "2026-02-27", createdAt: "2026-02-27T04:00:00.000Z", message: "D" },
      { id: "done", status: "DONE", priority: "P0", dueDate: "2026-02-26", createdAt: "2026-02-27T05:00:00.000Z", message: "E" },
    ];

    const summary = buildTodoSummary(rows, now);
    expect(summary.overdueCount).toBe(2);
    expect(summary.todayHighCount).toBe(1);
  });

  it("sorts top lists by priority, dueDate and createdAt", () => {
    const rows: Row[] = [
      { id: "a", status: "OPEN", priority: "P1", dueDate: "2026-02-26", createdAt: "2026-02-27T01:00:00.000Z", message: "A" },
      { id: "b", status: "DOING", priority: "P0", dueDate: "2026-02-25", createdAt: "2026-02-27T02:00:00.000Z", message: "B" },
      { id: "c", status: "OPEN", priority: "P0", dueDate: "2026-02-26", createdAt: "2026-02-27T03:00:00.000Z", message: "C" },
      { id: "d", status: "OPEN", priority: "P2", dueDate: "2026-02-27", createdAt: "2026-02-27T04:00:00.000Z", message: "D" },
      { id: "e", status: "OPEN", priority: "P1", dueDate: "2026-02-27", createdAt: "2026-02-27T05:00:00.000Z", message: "E" },
      { id: "f", status: "DOING", priority: "P0", dueDate: "2026-02-27", createdAt: "2026-02-27T06:00:00.000Z", message: "F" },
    ];

    const summary = buildTodoSummary(rows, now);
    expect(summary.topOverdue.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(summary.topToday.map((item) => item.id)).toEqual(["f", "e", "d"]);
  });
});
