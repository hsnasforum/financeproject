import type { FeedbackStatus } from "./feedbackStore";

export type FeedbackStatItem = {
  status: FeedbackStatus;
  createdAt: string;
};

export type FeedbackStats = {
  OPEN: number;
  DOING: number;
  DONE: number;
  total: number;
};

type PickTopOptions = {
  statuses?: FeedbackStatus[];
  limit?: number;
};

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function computeStats<T extends FeedbackStatItem>(items: T[]): FeedbackStats {
  let open = 0;
  let doing = 0;
  let done = 0;

  for (const item of items) {
    if (item.status === "OPEN") open += 1;
    else if (item.status === "DOING") doing += 1;
    else if (item.status === "DONE") done += 1;
  }

  return {
    OPEN: open,
    DOING: doing,
    DONE: done,
    total: open + doing + done,
  };
}

export function pickTop<T extends FeedbackStatItem>(items: T[], options: PickTopOptions = {}): T[] {
  const limitRaw = options.limit ?? 5;
  const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.trunc(limitRaw)) : 5;
  if (limit <= 0) return [];
  const statuses = Array.isArray(options.statuses) && options.statuses.length > 0
    ? new Set(options.statuses)
    : null;

  const filtered = statuses
    ? items.filter((item) => statuses.has(item.status))
    : items.slice();

  return filtered
    .slice()
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
    .slice(0, limit);
}

