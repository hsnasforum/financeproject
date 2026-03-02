import type { ChainId } from "./fixChains";

type SummaryStatus = "OK" | "WARN" | "FAIL";

export type RunbookSummaryItem = {
  id?: string;
  code?: string;
  title?: string;
  status?: SummaryStatus;
};

export type RunbookRecommendation = {
  chainId: ChainId;
  reasonLines: string[];
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isIssue(status: unknown): status is "WARN" | "FAIL" {
  return status === "WARN" || status === "FAIL";
}

function isDbRelated(item: RunbookSummaryItem): boolean {
  const code = normalizeText(item.code);
  const id = normalizeText(item.id);
  return code.includes("DB")
    || code.includes("PRISMA")
    || code.includes("SEED")
    || code === "SCHEMA_DRIFT"
    || code === "DATA_FRESHNESS"
    || code === "FEEDBACK_STORE"
    || id.includes("SCHEMA")
    || id.includes("FRESHNESS")
    || id.includes("FEEDBACK");
}

function isDartRelated(item: RunbookSummaryItem): boolean {
  const code = normalizeText(item.code);
  const id = normalizeText(item.id);
  return code.includes("DART")
    || code.includes("DAILY_REFRESH")
    || id.includes("DART")
    || id.includes("DAILY");
}

function toLabel(item: RunbookSummaryItem): string {
  return item.title?.trim() || item.code?.trim() || item.id?.trim() || "unknown";
}

export function recommendRunbook(summaryItems: RunbookSummaryItem[]): RunbookRecommendation | null {
  const issues = summaryItems.filter((item) => isIssue(item.status));
  if (issues.length < 1) return null;

  const failItems = issues.filter((item) => item.status === "FAIL");
  const dbIssues = issues.filter((item) => isDbRelated(item));
  const dartIssues = issues.filter((item) => isDartRelated(item));

  const failGroups = new Set<string>();
  for (const item of failItems) {
    if (isDbRelated(item)) failGroups.add("db");
    if (isDartRelated(item)) failGroups.add("dart");
    if (!isDbRelated(item) && !isDartRelated(item)) failGroups.add("other");
  }

  if (failItems.length >= 2 && failGroups.size >= 2) {
    return {
      chainId: "FULL_REPAIR",
      reasonLines: [
        `FAIL 이슈가 ${failItems.length}건이며 성격이 혼합되어 전체 복구가 필요합니다.`,
        `주요 FAIL: ${failItems.slice(0, 3).map((item) => toLabel(item)).join(", ")}`,
      ],
    };
  }

  if (dbIssues.length > 0) {
    return {
      chainId: "DB_REPAIR",
      reasonLines: [
        `DB 관련 WARN/FAIL 이슈 ${dbIssues.length}건이 감지되었습니다.`,
        `주요 이슈: ${dbIssues.slice(0, 3).map((item) => toLabel(item)).join(", ")}`,
      ],
    };
  }

  if (dartIssues.length > 0) {
    return {
      chainId: "DART_SETUP",
      reasonLines: [
        `DART 관련 WARN/FAIL 이슈 ${dartIssues.length}건이 감지되었습니다.`,
        `주요 이슈: ${dartIssues.slice(0, 3).map((item) => toLabel(item)).join(", ")}`,
      ],
    };
  }

  return {
    chainId: "FULL_REPAIR",
    reasonLines: [
      `분류되지 않은 이슈 ${issues.length}건이 감지되어 전체 복구를 권장합니다.`,
    ],
  };
}
