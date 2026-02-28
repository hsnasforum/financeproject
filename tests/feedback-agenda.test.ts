import { describe, expect, it } from "vitest";
import { buildAgenda } from "../src/lib/feedback/feedbackAgenda";

type Row = {
  id: string;
  status: "OPEN" | "DOING" | "DONE";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate: string | null;
  createdAt: string;
};

const now = new Date("2026-02-27T03:00:00.000Z"); // 2026-02-27 12:00 KST (Fri)

describe("feedback agenda", () => {
  it("groups items into overdue/today/thisWeek/noDueHigh", () => {
    const rows: Row[] = [
      { id: "over", status: "OPEN", priority: "P1", dueDate: "2026-02-26", createdAt: "2026-02-27T01:00:00.000Z" },
      { id: "today", status: "DOING", priority: "P2", dueDate: "2026-02-27", createdAt: "2026-02-27T02:00:00.000Z" },
      { id: "week", status: "OPEN", priority: "P3", dueDate: "2026-03-01", createdAt: "2026-02-27T03:00:00.000Z" },
      { id: "high", status: "OPEN", priority: "P0", dueDate: null, createdAt: "2026-02-27T04:00:00.000Z" },
      { id: "done", status: "DONE", priority: "P0", dueDate: "2026-02-27", createdAt: "2026-02-27T05:00:00.000Z" },
    ];

    const agenda = buildAgenda(rows, now);
    expect(agenda.overdue.map((item) => item.id)).toEqual(["over"]);
    expect(agenda.today.map((item) => item.id)).toEqual(["today"]);
    expect(agenda.thisWeek.map((item) => item.id)).toEqual(["week"]);
    expect(agenda.noDueHigh.map((item) => item.id)).toEqual(["high"]);
  });

  it("keeps sorting priority and dueDate order inside each group", () => {
    const rows: Row[] = [
      { id: "a", status: "OPEN", priority: "P2", dueDate: "2026-02-26", createdAt: "2026-02-27T01:00:00.000Z" },
      { id: "b", status: "OPEN", priority: "P0", dueDate: "2026-02-25", createdAt: "2026-02-27T02:00:00.000Z" },
      { id: "c", status: "DOING", priority: "P0", dueDate: "2026-02-26", createdAt: "2026-02-27T03:00:00.000Z" },
      { id: "d", status: "OPEN", priority: "P1", dueDate: "2026-03-01", createdAt: "2026-02-27T04:00:00.000Z" },
      { id: "e", status: "OPEN", priority: "P0", dueDate: "2026-03-01", createdAt: "2026-02-27T05:00:00.000Z" },
      { id: "f", status: "OPEN", priority: "P1", dueDate: null, createdAt: "2026-02-27T06:00:00.000Z" },
      { id: "g", status: "OPEN", priority: "P0", dueDate: null, createdAt: "2026-02-27T07:00:00.000Z" },
    ];

    const agenda = buildAgenda(rows, now);
    expect(agenda.overdue.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(agenda.thisWeek.map((item) => item.id)).toEqual(["e", "d"]);
    expect(agenda.noDueHigh.map((item) => item.id)).toEqual(["g", "f"]);
  });
});

