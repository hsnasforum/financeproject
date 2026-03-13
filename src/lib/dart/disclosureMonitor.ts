export type DisclosureMonitorSettingsLike = {
  from?: string;
  to?: string;
  type?: string;
  finalOnly: boolean;
  pageCount: number;
};

export type DisclosureMonitorListItemLike = {
  reportName?: string;
  receiptDate?: string;
};

export type DisclosureMonitorRowLike = {
  items: DisclosureMonitorListItemLike[];
  newItems: DisclosureMonitorListItemLike[];
  lastCheckedAt: string | null;
};

export type DisclosureMonitorWatchlistItemLike = {
  corpCode: string;
  corpName?: string;
};

export type DisclosureMonitorSummary = {
  watchlistCount: number;
  checkedCorpCount: number;
  neverCheckedCorpCount: number;
  pendingCorpCount: number;
  totalNewItems: number;
};

export type DisclosureMonitorPriorityReason = "pending" | "unchecked" | "checked";

export type DisclosureMonitorPriorityItem<T extends DisclosureMonitorWatchlistItemLike = DisclosureMonitorWatchlistItemLike> = T & {
  reason: DisclosureMonitorPriorityReason;
  newCount: number;
  lastCheckedAt: string | null;
  previewText: string;
};

export type DisclosureMonitorPreset = "today" | "7d" | "30d" | "all";

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(parsed.getTime())
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
  );
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateDisclosureMonitorSettings(settings: DisclosureMonitorSettingsLike): string {
  if (settings.from && !isValidDateInput(settings.from)) {
    return "시작일은 YYYY-MM-DD 형식으로 입력해 주세요.";
  }
  if (settings.to && !isValidDateInput(settings.to)) {
    return "종료일은 YYYY-MM-DD 형식으로 입력해 주세요.";
  }
  if (settings.from && settings.to && settings.from > settings.to) {
    return "시작일은 종료일보다 늦을 수 없습니다.";
  }
  return "";
}

export function describeDisclosureMonitorFilters(settings: DisclosureMonitorSettingsLike): string[] {
  const out = [
    settings.finalOnly ? "최종보고서만" : "정정/예비 포함",
    `최근 ${settings.pageCount}건`,
  ];

  if (settings.from || settings.to) {
    out.push(`기간 ${settings.from ?? "처음"} ~ ${settings.to ?? "오늘"}`);
  } else {
    out.push("기간 제한 없음");
  }

  if (settings.type) {
    out.push(`유형 ${settings.type}`);
  } else {
    out.push("유형 전체");
  }

  return out;
}

export function buildDisclosureMonitorSummary(
  watchlist: Array<{ corpCode: string }>,
  rows: Record<string, DisclosureMonitorRowLike>,
): DisclosureMonitorSummary {
  let checkedCorpCount = 0;
  let pendingCorpCount = 0;
  let totalNewItems = 0;

  for (const corp of watchlist) {
    const row = rows[corp.corpCode];
    if (row?.lastCheckedAt) checkedCorpCount += 1;
    const newCount = Array.isArray(row?.newItems) ? row.newItems.length : 0;
    if (newCount > 0) pendingCorpCount += 1;
    totalNewItems += newCount;
  }

  return {
    watchlistCount: watchlist.length,
    checkedCorpCount,
    neverCheckedCorpCount: Math.max(0, watchlist.length - checkedCorpCount),
    pendingCorpCount,
    totalNewItems,
  };
}

function disclosureMonitorSortBucket(row: DisclosureMonitorRowLike | undefined): number {
  const newCount = Array.isArray(row?.newItems) ? row.newItems.length : 0;
  if (newCount > 0) return 0;
  if (!row?.lastCheckedAt) return 1;
  return 2;
}

function disclosureMonitorSortTime(row: DisclosureMonitorRowLike | undefined): number {
  if (!row?.lastCheckedAt) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(row.lastCheckedAt);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : Number.NEGATIVE_INFINITY;
}

function disclosureMonitorPriorityReason(row: DisclosureMonitorRowLike | undefined): DisclosureMonitorPriorityReason {
  const newCount = Array.isArray(row?.newItems) ? row.newItems.length : 0;
  if (newCount > 0) return "pending";
  if (!row?.lastCheckedAt) return "unchecked";
  return "checked";
}

function disclosureMonitorFirstPreviewItem(
  items: DisclosureMonitorListItemLike[] | undefined,
): DisclosureMonitorListItemLike | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const reportName = typeof item.reportName === "string" && item.reportName.trim() ? item.reportName.trim() : undefined;
    const receiptDate = typeof item.receiptDate === "string" && item.receiptDate.trim() ? item.receiptDate.trim() : undefined;
    if (!reportName && !receiptDate) continue;
    return { reportName, receiptDate };
  }
  return null;
}

function disclosureMonitorPriorityPreviewText(
  reason: DisclosureMonitorPriorityReason,
  row: DisclosureMonitorRowLike | undefined,
  newCount: number,
): string {
  if (reason === "unchecked") {
    return "최근 공시를 아직 불러오지 않았습니다.";
  }

  const previewItem = reason === "pending"
    ? disclosureMonitorFirstPreviewItem(row?.newItems) ?? disclosureMonitorFirstPreviewItem(row?.items)
    : disclosureMonitorFirstPreviewItem(row?.items);

  if (previewItem?.reportName) {
    return `${previewItem.reportName} · ${previewItem.receiptDate ?? "날짜 미상"}`;
  }

  if (reason === "pending") {
    return `신규 공시 ${newCount}건이 있어 바로 확인이 필요합니다.`;
  }

  return "최근 공시를 확인했습니다.";
}

export function sortDisclosureMonitorWatchlist<T extends DisclosureMonitorWatchlistItemLike>(
  watchlist: T[],
  rows: Record<string, DisclosureMonitorRowLike>,
): T[] {
  return [...watchlist].sort((left, right) => {
    const leftRow = rows[left.corpCode];
    const rightRow = rows[right.corpCode];
    const bucketDiff = disclosureMonitorSortBucket(leftRow) - disclosureMonitorSortBucket(rightRow);
    if (bucketDiff !== 0) return bucketDiff;

    const leftNewCount = Array.isArray(leftRow?.newItems) ? leftRow.newItems.length : 0;
    const rightNewCount = Array.isArray(rightRow?.newItems) ? rightRow.newItems.length : 0;
    if (leftNewCount !== rightNewCount) return rightNewCount - leftNewCount;

    const timeDiff = disclosureMonitorSortTime(rightRow) - disclosureMonitorSortTime(leftRow);
    if (timeDiff !== 0) return timeDiff;

    return (left.corpName ?? left.corpCode).localeCompare(right.corpName ?? right.corpCode, "ko");
  });
}

export function buildDisclosureMonitorPriorityList<T extends DisclosureMonitorWatchlistItemLike>(
  watchlist: T[],
  rows: Record<string, DisclosureMonitorRowLike>,
  limit = 3,
): Array<DisclosureMonitorPriorityItem<T>> {
  if (limit <= 0) return [];
  return sortDisclosureMonitorWatchlist(watchlist, rows)
    .slice(0, limit)
    .map((item) => {
      const row = rows[item.corpCode];
      const newCount = Array.isArray(row?.newItems) ? row.newItems.length : 0;
      const reason = disclosureMonitorPriorityReason(row);
      return {
        ...item,
        reason,
        newCount,
        lastCheckedAt: row?.lastCheckedAt ?? null,
        previewText: disclosureMonitorPriorityPreviewText(reason, row, newCount),
      };
    });
}

export function getDisclosureMonitorPresetRange(
  preset: DisclosureMonitorPreset,
  now = new Date(),
): Pick<DisclosureMonitorSettingsLike, "from" | "to"> {
  if (preset === "all") {
    return {
      from: undefined,
      to: undefined,
    };
  }

  const end = new Date(now);
  const start = new Date(now);

  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 29);
  }

  return {
    from: formatIsoDate(start),
    to: formatIsoDate(end),
  };
}
