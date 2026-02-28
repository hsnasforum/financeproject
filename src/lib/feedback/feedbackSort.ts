import type { FeedbackPriority, FeedbackStatus } from "./feedbackStore";

export type FeedbackSortable = {
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  createdAt: string;
};

function statusRank(value: FeedbackStatus): number {
  if (value === "OPEN") return 0;
  if (value === "DOING") return 0;
  return 1;
}

function priorityRank(value: FeedbackPriority): number {
  if (value === "P0") return 0;
  if (value === "P1") return 1;
  if (value === "P2") return 2;
  return 3;
}

function parseDateOnly(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareFeedback<T extends FeedbackSortable>(a: T, b: T): number {
  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff;

  const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const dueA = parseDateOnly(a.dueDate);
  const dueB = parseDateOnly(b.dueDate);
  if (dueA !== null && dueB !== null) {
    if (dueA !== dueB) return dueA - dueB;
  } else if (dueA !== null) {
    return -1;
  } else if (dueB !== null) {
    return 1;
  }

  return parseDateTime(b.createdAt) - parseDateTime(a.createdAt);
}

