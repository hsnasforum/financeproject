import { compareFeedback } from "./feedbackSort";
import type { FeedbackPriority, FeedbackStatus } from "./feedbackStore";

export type TodoSummaryItem = {
  id: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  createdAt: string;
  message: string;
};

export type TodoSummary = {
  overdueCount: number;
  todayHighCount: number;
  topOverdue: TodoSummaryItem[];
  topToday: TodoSummaryItem[];
};

function todayKeyInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((entry) => entry.type === "year")?.value ?? "1970";
  const month = parts.find((entry) => entry.type === "month")?.value ?? "01";
  const day = parts.find((entry) => entry.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function isActiveStatus(value: FeedbackStatus): boolean {
  return value === "OPEN" || value === "DOING";
}

function isHighPriority(value: FeedbackPriority): boolean {
  return value === "P0" || value === "P1";
}

export function buildTodoSummary(
  items: TodoSummaryItem[],
  now = new Date(),
  tz = "Asia/Seoul",
): TodoSummary {
  const todayKey = todayKeyInTimeZone(now, tz);
  const active = items.filter((item) => isActiveStatus(item.status));
  const overdue = active.filter((item) => Boolean(item.dueDate) && String(item.dueDate) < todayKey);
  const today = active.filter((item) => item.dueDate === todayKey);
  const todayHigh = today.filter((item) => isHighPriority(item.priority));

  return {
    overdueCount: overdue.length,
    todayHighCount: todayHigh.length,
    topOverdue: overdue.slice().sort(compareFeedback),
    topToday: today.slice().sort(compareFeedback),
  };
}

