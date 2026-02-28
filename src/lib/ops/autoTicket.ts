import {
  addFeedback,
  appendNote,
  findRecentByFingerprint,
  listFeedback,
  updateFeedback,
} from "../feedback/feedbackStore";

type OpsTicketType = "FIX" | "CHAIN";

type CreateOrAppendOpsTicketInput = {
  type: OpsTicketType;
  id: string;
  cause: string;
  summary: string;
  stderrTail?: string;
  stdoutTail?: string;
  suggestedFixIds?: string[];
  tookMs?: number;
};

type ResolveOpsTicketInput = {
  type: OpsTicketType;
  id: string;
  summary?: string;
  historyId?: string;
  tookMs?: number;
};

const RECENT_WINDOW_MS = 60 * 60 * 1000;

function normalizeToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const compact = value.trim().replace(/\s+/g, "_").toUpperCase();
  return compact || fallback;
}

function tail(value: unknown, max = 1200): string {
  if (typeof value !== "string") return "";
  if (value.length <= max) return value;
  return value.slice(value.length - max);
}

function uniqueSuggestedFixIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const fixId = row.trim();
    if (!fixId) continue;
    const key = fixId.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fixId);
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function hasIdInMessage(message: unknown, id: string): boolean {
  if (typeof message !== "string") return false;
  const matched = message.match(/\[OPS\]\[([^\]]+)\]/i);
  if (!matched?.[1]) return false;
  return matched[1].trim().toUpperCase() === id.toUpperCase();
}

function buildRecoveryNote(input: ResolveOpsTicketInput): string {
  const now = new Date().toISOString();
  const summary = typeof input.summary === "string" && input.summary.trim()
    ? input.summary.trim()
    : "복구 실행 성공";
  const tookMs = Number.isFinite(input.tookMs) ? Math.max(0, Math.trunc(input.tookMs as number)) : 0;
  const lines = [
    `[AUTO][OPS][RECOVERED] ${now}`,
    `- type: ${input.type}`,
    `- id: ${input.id}`,
    `- summary: ${summary}`,
    `- tookMs: ${tookMs}`,
    `- historyId: ${typeof input.historyId === "string" && input.historyId.trim() ? input.historyId.trim() : "-"}`,
  ];
  return lines.join("\n");
}

function buildOccurrenceNote(input: CreateOrAppendOpsTicketInput): string {
  const now = new Date().toISOString();
  const stdoutTail = tail(input.stdoutTail);
  const stderrTail = tail(input.stderrTail);
  const suggested = uniqueSuggestedFixIds(input.suggestedFixIds);
  const tookMs = Number.isFinite(input.tookMs) ? Math.max(0, Math.trunc(input.tookMs as number)) : 0;

  const lines = [
    `[AUTO][OPS] ${now}`,
    `- type: ${input.type}`,
    `- id: ${input.id}`,
    `- cause: ${input.cause}`,
    `- summary: ${input.summary}`,
    `- tookMs: ${tookMs}`,
    `- suggestedFixIds: ${suggested.length > 0 ? suggested.join(", ") : "-"}`,
    `- stdoutTail:`,
    stdoutTail || "(empty)",
    `- stderrTail:`,
    stderrTail || "(empty)",
  ];
  return lines.join("\n");
}

export function buildFingerprint(type: OpsTicketType, id: string, cause: string): string {
  return [
    "OPS",
    normalizeToken(type, "UNKNOWN"),
    normalizeToken(id, "UNKNOWN"),
    normalizeToken(cause, "UNKNOWN"),
  ].join(":");
}

export function createOrAppendOpsTicket(input: CreateOrAppendOpsTicketInput): {
  ok: true;
  action: "created" | "appended";
  ticketId: string;
  fingerprint: string;
} {
  const normalizedType: OpsTicketType = input.type === "CHAIN" ? "CHAIN" : "FIX";
  const normalizedId = typeof input.id === "string" && input.id.trim() ? input.id.trim() : "UNKNOWN";
  const normalizedCause = typeof input.cause === "string" && input.cause.trim() ? input.cause.trim() : "UNKNOWN";
  const normalizedSummary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : "자동 티켓 생성";

  const fingerprint = buildFingerprint(normalizedType, normalizedId, normalizedCause);
  const note = buildOccurrenceNote({
    ...input,
    type: normalizedType,
    id: normalizedId,
    cause: normalizedCause,
    summary: normalizedSummary,
  });

  const recent = findRecentByFingerprint(fingerprint, RECENT_WINDOW_MS);
  if (recent) {
    const updated = appendNote(recent.id, note);
    return {
      ok: true,
      action: "appended",
      ticketId: updated?.id ?? recent.id,
      fingerprint,
    };
  }

  const next = addFeedback({
    category: "bug",
    message: `[OPS][${normalizedId}] 실패: ${normalizedCause}`,
    traceId: null,
    userAgent: "ops-auto-ticket",
    url: "/api/dev/doctor/fix",
    appVersion: null,
    status: "OPEN",
    priority: "P0",
    tags: ["ops", "auto", "fix", normalizedId, normalizedCause],
    note,
    fingerprint,
  });

  return {
    ok: true,
    action: "created",
    ticketId: next.id,
    fingerprint,
  };
}

export function resolveOpsTicketsOnSuccess(input: ResolveOpsTicketInput): {
  ok: true;
  resolvedCount: number;
  ticketIds: string[];
} {
  const normalizedId = normalizeId(input.id);
  if (!normalizedId) {
    return {
      ok: true,
      resolvedCount: 0,
      ticketIds: [],
    };
  }

  const note = buildRecoveryNote({
    ...input,
    id: normalizedId,
  });

  const rows = listFeedback(200);
  const resolvedIds: string[] = [];
  for (const row of rows) {
    if (!row || (row.status !== "OPEN" && row.status !== "DOING")) continue;
    const tags = normalizeTags(row.tags).map((tag) => tag.toUpperCase());
    if (!tags.includes("OPS")) continue;
    const hasIdInTags = tags.includes(normalizedId.toUpperCase());
    const matchedByMessage = hasIdInMessage(row.message, normalizedId);
    if (!hasIdInTags && !matchedByMessage) continue;

    updateFeedback(row.id, { status: "DONE" });
    appendNote(row.id, note);
    resolvedIds.push(row.id);
  }

  return {
    ok: true,
    resolvedCount: resolvedIds.length,
    ticketIds: resolvedIds,
  };
}
