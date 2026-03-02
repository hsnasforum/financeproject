import { compareFeedback, type FeedbackSortable } from "./feedbackSort";
import type { FeedbackPriority, FeedbackStatus } from "./feedbackStore";
import { isOpsTicket } from "../ops/opsTicketParser";

export type AgendaItem = FeedbackSortable & {
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  createdAt: string;
  message?: string;
  tags?: string[];
  note?: string;
};

export type FeedbackAgenda<T extends AgendaItem> = {
  opsTop: T[];
  overdue: T[];
  today: T[];
  thisWeek: T[];
  noDueHigh: T[];
};

function dateKeyInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((entry) => entry.type === "year")?.value ?? "1970";
  const month = parts.find((entry) => entry.type === "month")?.value ?? "01";
  const day = parts.find((entry) => entry.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map((entry) => Number(entry));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateKey;
  const base = Date.UTC(year, month - 1, day);
  const shifted = new Date(base + (days * 86_400_000));
  return shifted.toISOString().slice(0, 10);
}

function endOfWeek(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map((entry) => Number(entry));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateKey;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  const daysUntilSunday = (7 - weekday) % 7;
  return addDays(dateKey, daysUntilSunday);
}

function isActiveStatus(value: FeedbackStatus): boolean {
  return value === "OPEN" || value === "DOING";
}

function isHighPriorityWithoutDue(item: AgendaItem): boolean {
  return !item.dueDate && (item.priority === "P0" || item.priority === "P1");
}

export function buildAgenda<T extends AgendaItem>(
  items: T[],
  now = new Date(),
  tz = "Asia/Seoul",
): FeedbackAgenda<T> {
  const todayKey = dateKeyInTimeZone(now, tz);
  const endOfWeekKey = endOfWeek(todayKey);

  const opsTop = items
    .filter((item) => (item.status === "OPEN" || item.status === "DOING") && item.priority === "P0" && isOpsTicket(item))
    .slice()
    .sort(compareFeedback)
    .slice(0, 3);

  const overdue: T[] = [];
  const today: T[] = [];
  const thisWeek: T[] = [];
  const noDueHigh: T[] = [];

  for (const item of items) {
    if (!isActiveStatus(item.status)) continue;

    if (item.dueDate) {
      if (item.dueDate < todayKey) {
        overdue.push(item);
        continue;
      }
      if (item.dueDate === todayKey) {
        today.push(item);
        continue;
      }
      if (item.dueDate > todayKey && item.dueDate <= endOfWeekKey) {
        thisWeek.push(item);
        continue;
      }
      continue;
    }

    if (isHighPriorityWithoutDue(item)) {
      noDueHigh.push(item);
    }
  }

  return {
    opsTop,
    overdue: overdue.slice().sort(compareFeedback),
    today: today.slice().sort(compareFeedback),
    thisWeek: thisWeek.slice().sort(compareFeedback),
    noDueHigh: noDueHigh.slice().sort(compareFeedback),
  };
}
