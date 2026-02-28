import { compareFeedback } from "./feedbackSort";
import type { FeedbackPriority, FeedbackStatus } from "./feedbackStore";

export type FeedbackQuery = {
  q?: string | null;
  status?: FeedbackStatus | "ALL" | null;
  tag?: string | null;
};

export type FeedbackQueryable = {
  createdAt: string;
  message: string;
  url: string | null;
  traceId: string | null;
  note: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  tags: string[];
};

function norm(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function filterAndSearch<T extends FeedbackQueryable>(items: T[], query: FeedbackQuery): T[] {
  const search = norm(query.q);
  const status = query.status && query.status !== "ALL" ? query.status : null;
  const tag = norm(query.tag);

  const filtered = items.filter((item) => {
    if (status && item.status !== status) return false;

    if (tag) {
      const hasTag = item.tags.some((entry) => norm(entry) === tag);
      if (!hasTag) return false;
    }

    if (!search) return true;
    const haystack = [item.message, item.url ?? "", item.traceId ?? "", item.note ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
  return filtered.slice().sort(compareFeedback);
}
