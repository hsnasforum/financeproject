export type DailyBriefAlertItem = {
  id?: string;
  clusterKey?: string;
  corpCode?: string;
  corpName?: string;
  categoryId?: string;
  categoryLabel?: string;
  title?: string;
  normalizedTitle?: string;
  rceptNo?: string;
  date?: string | null;
  clusterScore?: number;
  isPinned?: boolean;
  pinnedAt?: string | null;
};

export type DailyBriefAlertsInput = {
  generatedAt?: string | null;
  newHigh?: DailyBriefAlertItem[];
  newMid?: DailyBriefAlertItem[];
  updatedHigh?: DailyBriefAlertItem[];
  updatedMid?: DailyBriefAlertItem[];
};

export type DailyBriefItem = {
  id: string;
  clusterKey: string;
  corpCode: string;
  corpName: string;
  categoryId: string;
  categoryLabel: string;
  title: string;
  rceptNo: string;
  date: string | null;
  clusterScore: number;
  kind: "new" | "updated";
  level: "high" | "mid";
  bucketPriority: number;
  isPinned: boolean;
  pinnedAt: string | null;
};

export type DailyBrief = {
  generatedAt: string | null;
  stats: {
    newHigh: number;
    newMid: number;
    updatedHigh: number;
    updatedMid: number;
    total: number;
    shown: number;
    maxLines: number;
  };
  topNew: DailyBriefItem[];
  topUpdated: DailyBriefItem[];
  lines: string[];
};

const DEFAULT_MAX_LINES = 10;
const HARD_MAX_LINES = 15;
const TOP_BUCKET_LIMIT = 3;

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toDateMillis(value: string | null | undefined): number {
  const text = asString(value);
  if (!text) return 0;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null): string {
  const text = asString(value);
  if (!text) return "-";
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  const millis = toDateMillis(text);
  if (millis <= 0) return text;
  return new Date(millis).toISOString().slice(0, 10);
}

function compareDailyBriefItem(a: DailyBriefItem, b: DailyBriefItem): number {
  const pinDiff = Number(b.isPinned) - Number(a.isPinned);
  if (pinDiff !== 0) return pinDiff;
  if (a.isPinned && b.isPinned) {
    const pinnedAtDiff = toDateMillis(b.pinnedAt) - toDateMillis(a.pinnedAt);
    if (pinnedAtDiff !== 0) return pinnedAtDiff;
  }
  if (a.bucketPriority !== b.bucketPriority) return a.bucketPriority - b.bucketPriority;
  if (a.clusterScore !== b.clusterScore) return b.clusterScore - a.clusterScore;
  const dateDiff = toDateMillis(b.date) - toDateMillis(a.date);
  if (dateDiff !== 0) return dateDiff;
  if (a.corpName !== b.corpName) return a.corpName.localeCompare(b.corpName);
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return a.id.localeCompare(b.id);
}

function normalizeItem(
  item: DailyBriefAlertItem,
  index: number,
  bucket: {
    kind: "new" | "updated";
    level: "high" | "mid";
    priority: number;
  },
): DailyBriefItem {
  const corpName = asString(item.corpName) || "-";
  const title = asString(item.title) || "(제목 없음)";
  const categoryLabel = asString(item.categoryLabel) || "기타";
  const clusterKey = asString(item.clusterKey) || `${corpName}::${categoryLabel}::${title}`;
  const rceptNo = asString(item.rceptNo);
  const id = asString(item.id) || (rceptNo ? `${clusterKey}::${rceptNo}` : `${clusterKey}::${index}`);
  const pinnedAt = asString(item.pinnedAt) || null;
  return {
    id,
    clusterKey,
    corpCode: asString(item.corpCode),
    corpName,
    categoryId: asString(item.categoryId),
    categoryLabel,
    title,
    rceptNo,
    date: asString(item.date) || null,
    clusterScore: asNumber(item.clusterScore, 0),
    kind: bucket.kind,
    level: bucket.level,
    bucketPriority: bucket.priority,
    isPinned: Boolean(item.isPinned) || Boolean(pinnedAt),
    pinnedAt,
  };
}

function formatBriefLine(item: DailyBriefItem): string {
  const score = Math.round(asNumber(item.clusterScore, 0));
  const pinLabel = item.isPinned ? "[PIN] " : "";
  return `[${pinLabel}${item.kind.toUpperCase()}/${item.level.toUpperCase()} ${score}] ${item.corpName} | ${item.title} (${item.categoryLabel}, ${formatDate(item.date)}, ${item.rceptNo || "-"})`;
}

export function buildDailyBrief(
  alertsJson: DailyBriefAlertsInput | null | undefined,
  options?: { maxLines?: number },
): DailyBrief {
  const requestedMax = Math.round(asNumber(options?.maxLines, DEFAULT_MAX_LINES));
  const maxLines = Math.max(1, Math.min(HARD_MAX_LINES, requestedMax || DEFAULT_MAX_LINES));
  const newHigh = Array.isArray(alertsJson?.newHigh) ? alertsJson.newHigh : [];
  const newMid = Array.isArray(alertsJson?.newMid) ? alertsJson.newMid : [];
  const updatedHigh = Array.isArray(alertsJson?.updatedHigh) ? alertsJson.updatedHigh : [];
  const updatedMid = Array.isArray(alertsJson?.updatedMid) ? alertsJson.updatedMid : [];
  const bucketConfigs = [
    { key: "newHigh", rows: newHigh, kind: "new" as const, level: "high" as const, priority: 0 },
    { key: "newMid", rows: newMid, kind: "new" as const, level: "mid" as const, priority: 1 },
    { key: "updatedHigh", rows: updatedHigh, kind: "updated" as const, level: "high" as const, priority: 2 },
    { key: "updatedMid", rows: updatedMid, kind: "updated" as const, level: "mid" as const, priority: 3 },
  ];

  const mergedItems: DailyBriefItem[] = [];
  for (const bucket of bucketConfigs) {
    for (let index = 0; index < bucket.rows.length; index += 1) {
      mergedItems.push(normalizeItem(bucket.rows[index] ?? {}, index, bucket));
    }
  }

  const sorted = mergedItems.sort(compareDailyBriefItem);
  const topNew = sorted.filter((item) => item.kind === "new").slice(0, TOP_BUCKET_LIMIT);
  const topUpdated = sorted.filter((item) => item.kind === "updated").slice(0, TOP_BUCKET_LIMIT);
  const lines = sorted.slice(0, maxLines).map(formatBriefLine);

  return {
    generatedAt: asString(alertsJson?.generatedAt) || null,
    stats: {
      newHigh: newHigh.length,
      newMid: newMid.length,
      updatedHigh: updatedHigh.length,
      updatedMid: updatedMid.length,
      total: mergedItems.length,
      shown: lines.length,
      maxLines,
    },
    topNew,
    topUpdated,
    lines,
  };
}

function formatTopLine(item: DailyBriefItem): string {
  const pinLabel = item.isPinned ? "PIN " : "";
  return `- [${pinLabel}${item.level.toUpperCase()} ${Math.round(item.clusterScore)}] ${item.corpName} | ${item.title}`;
}

export function toMarkdown(brief: DailyBrief): string {
  const lines: string[] = [];
  lines.push("# DART Daily Brief");
  lines.push("");
  lines.push("## 요약");
  lines.push(`- Generated at: ${brief.generatedAt ?? "-"}`);
  lines.push(`- Alerts: newHigh=${brief.stats.newHigh}, newMid=${brief.stats.newMid}, updatedHigh=${brief.stats.updatedHigh}, updatedMid=${brief.stats.updatedMid}, total=${brief.stats.total}`);
  lines.push(`- Brief lines: ${brief.stats.shown}/${brief.stats.maxLines}`);
  lines.push("");
  lines.push("## Top New");
  if (brief.topNew.length === 0) {
    lines.push("- 없음");
  } else {
    brief.topNew.forEach((item) => lines.push(formatTopLine(item)));
  }
  lines.push("");
  lines.push("## Top Updated");
  if (brief.topUpdated.length === 0) {
    lines.push("- 없음");
  } else {
    brief.topUpdated.forEach((item) => lines.push(formatTopLine(item)));
  }
  lines.push("");
  lines.push("## 10줄 요약");
  if (brief.lines.length === 0) {
    lines.push("- 없음");
  } else {
    brief.lines.forEach((line) => lines.push(`- ${line}`));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
