import { isOpsTicket } from "./opsTicketParser";

type OpsBriefFeedbackItem = {
  id?: string;
  createdAt?: string;
  dueDate?: string | null;
  status?: string;
  priority?: string;
  message?: string;
  traceId?: string | null;
  tags?: string[];
  note?: string;
};

export type OpsBriefSummary = {
  lines: string[];
};

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeDueDate(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function toDateMillis(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function summarizeMessage(message: string, maxLength = 64): string {
  const compact = message.trim().replace(/\s+/g, " ");
  const withoutPrefix = compact.replace(/^\[OPS\]\[[^\]]+\]\s*실패:\s*/i, "");
  if (withoutPrefix.length <= maxLength) return withoutPrefix;
  return `${withoutPrefix.slice(0, maxLength)}...`;
}

function compareOpsItem(a: OpsBriefFeedbackItem, b: OpsBriefFeedbackItem): number {
  const dueA = normalizeDueDate(a.dueDate);
  const dueB = normalizeDueDate(b.dueDate);
  if (dueA && dueB && dueA !== dueB) return dueA.localeCompare(dueB);
  if (dueA && !dueB) return -1;
  if (!dueA && dueB) return 1;
  return toDateMillis(b.createdAt) - toDateMillis(a.createdAt);
}

function toOpsLine(item: OpsBriefFeedbackItem): string {
  const id = asString(item.id) || "unknown";
  const message = summarizeMessage(asString(item.message) || "운영 이슈");
  const traceId = asString(item.traceId);
  const tracePart = traceId ? ` (traceId: ${traceId})` : "";
  return `- [OPS][P0] ${message} → /feedback/${id}${tracePart}`;
}

export function buildOpsBriefSummary(items: OpsBriefFeedbackItem[]): OpsBriefSummary {
  if (!Array.isArray(items) || items.length < 1) return { lines: [] };
  const selected = items
    .filter((item) => (item.status === "OPEN" || item.status === "DOING") && item.priority === "P0" && isOpsTicket(item))
    .slice()
    .sort(compareOpsItem)
    .slice(0, 3);

  return {
    lines: selected.map(toOpsLine),
  };
}
