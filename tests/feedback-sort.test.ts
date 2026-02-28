import { describe, expect, it } from "vitest";
import { compareFeedback } from "../src/lib/feedback/feedbackSort";

type Row = {
  id: string;
  status: "OPEN" | "DOING" | "DONE";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate: string | null;
  createdAt: string;
};

function sortRows(rows: Row[]): Row[] {
  return rows.slice().sort(compareFeedback);
}

describe("feedback sort", () => {
  it("prioritizes OPEN/DOING over DONE", () => {
    const rows: Row[] = [
      { id: "done", status: "DONE", priority: "P0", dueDate: "2026-02-27", createdAt: "2026-02-27T12:00:00.000Z" },
      { id: "open", status: "OPEN", priority: "P3", dueDate: null, createdAt: "2026-02-27T10:00:00.000Z" },
    ];
    expect(sortRows(rows).map((row) => row.id)).toEqual(["open", "done"]);
  });

  it("orders by priority within same status group", () => {
    const rows: Row[] = [
      { id: "p2", status: "OPEN", priority: "P2", dueDate: null, createdAt: "2026-02-27T09:00:00.000Z" },
      { id: "p0", status: "OPEN", priority: "P0", dueDate: null, createdAt: "2026-02-27T08:00:00.000Z" },
      { id: "p1", status: "OPEN", priority: "P1", dueDate: null, createdAt: "2026-02-27T07:00:00.000Z" },
    ];
    expect(sortRows(rows).map((row) => row.id)).toEqual(["p0", "p1", "p2"]);
  });

  it("orders by dueDate then createdAt desc", () => {
    const rows: Row[] = [
      { id: "no-due", status: "DOING", priority: "P1", dueDate: null, createdAt: "2026-02-27T12:00:00.000Z" },
      { id: "due-late", status: "DOING", priority: "P1", dueDate: "2026-03-01", createdAt: "2026-02-27T09:00:00.000Z" },
      { id: "due-early", status: "DOING", priority: "P1", dueDate: "2026-02-28", createdAt: "2026-02-27T08:00:00.000Z" },
      { id: "due-early-new", status: "DOING", priority: "P1", dueDate: "2026-02-28", createdAt: "2026-02-27T13:00:00.000Z" },
    ];
    expect(sortRows(rows).map((row) => row.id)).toEqual(["due-early-new", "due-early", "due-late", "no-due"]);
  });
});

