import type { FeedbackItem, FeedbackRecordKind } from "./feedbackStore";

export type { FeedbackRecordKind } from "./feedbackStore";

export type FeedbackPublicReceipt = {
  ok: true;
};

export type FeedbackAdminRecord = {
  recordKind: FeedbackRecordKind;
  id: string;
  createdAt: string;
  category: FeedbackItem["category"];
  message: string;
  traceId: string | null;
  userAgent: string | null;
  url: string | null;
  appVersion: string | null;
  status: FeedbackItem["status"];
  tags: string[];
  note: string;
  priority: FeedbackItem["priority"];
  dueDate: string | null;
  tasks: FeedbackItem["tasks"];
  snapshot?: FeedbackItem["snapshot"];
};

export function toFeedbackPublicReceipt(): FeedbackPublicReceipt {
  return { ok: true };
}

export function toFeedbackAdminRecord(item: FeedbackItem): FeedbackAdminRecord {
  return {
    recordKind: item.recordKind,
    id: item.id,
    createdAt: item.createdAt,
    category: item.category,
    message: item.message,
    traceId: item.traceId,
    userAgent: item.userAgent,
    url: item.url,
    appVersion: item.appVersion,
    status: item.status,
    tags: [...item.tags],
    note: item.note,
    priority: item.priority,
    dueDate: item.dueDate,
    tasks: item.tasks.map((task) => ({ ...task })),
    ...(item.snapshot ? { snapshot: item.snapshot } : {}),
  };
}
