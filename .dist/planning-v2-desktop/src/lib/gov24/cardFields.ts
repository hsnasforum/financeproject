import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import { classifyOrgType } from "./orgClassifier";

export type Gov24CardFieldLine = { label: string; value: string };
export type Gov24CardFields = {
  badge: string;
  department?: string;
  title: string;
  summary: string;
  lines: Gov24CardFieldLine[];
  link?: { label: "타사이트 이동"; href: string };
};

const ORG_TYPE_BADGE: Record<ReturnType<typeof classifyOrgType>, string> = {
  central: "중앙부처",
  local: "지자체",
  public: "공공기관",
  education: "교육청",
};

function compact(text?: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function clampSummary(text: string): string {
  if (text.length <= 200) return text;
  return `${text.slice(0, 200).trim()}...`;
}

function extractApplyPeriod(item: BenefitCandidate): string | undefined {
  const merged = compact([item.eligibilityText, item.eligibilityExcerpt, item.summary].filter(Boolean).join(" "));
  if (!merged) return undefined;
  const range = merged.match(/([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}\s*~\s*[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/);
  if (range?.[1]) return range[1];
  const keyword = merged.match(/(상시|수시|연중)/);
  return keyword?.[1];
}

function extractPhone(item: BenefitCandidate): string | undefined {
  if (compact(item.contact)) return compact(item.contact);
  const merged = compact([item.summary, item.eligibilityText, item.eligibilityExcerpt].filter(Boolean).join(" "));
  if (!merged) return undefined;
  const match = merged.match(/(\d{2,4}-\d{3,4}-\d{4})/);
  return match?.[1];
}

function extractSupportType(item: BenefitCandidate): string | undefined {
  const chip = item.eligibilityChips?.find((entry) => compact(entry));
  if (chip) return compact(chip);
  const merged = compact([item.summary, item.eligibilityText, item.eligibilityExcerpt].filter(Boolean).join(" "));
  if (!merged) return undefined;
  if (/(현금|수당|지원금)/.test(merged)) return "현금";
  if (/(현물|물품)/.test(merged)) return "현물";
  if (/(이용권|바우처)/.test(merged)) return "이용권";
  if (/(대출|융자)/.test(merged)) return "대출";
  if (/(감면|면제)/.test(merged)) return "감면";
  return undefined;
}

function pushLine(lines: Gov24CardFieldLine[], label: string, value?: string) {
  const text = compact(value);
  if (!text) return;
  if (lines.some((entry) => entry.label === label && entry.value === text)) return;
  lines.push({ label, value: text });
}

export function buildGov24CardFields(item: BenefitCandidate): Gov24CardFields {
  const orgType = classifyOrgType(item.org);
  const lines: Gov24CardFieldLine[] = [];

  pushLine(lines, "신청기간", extractApplyPeriod(item));
  pushLine(lines, "접수기관", item.org);
  pushLine(lines, "전화문의", extractPhone(item));
  pushLine(lines, "지원형태", extractSupportType(item));
  pushLine(lines, "신청방법", compact(item.applyHow) || (item.link ? "온라인(타사이트)" : undefined));

  if (lines.length < 3) {
    pushLine(lines, "접수기관", item.org || item.source);
    pushLine(lines, "신청방법", item.applyHow || (item.link ? "온라인(타사이트)" : undefined));
    pushLine(lines, "지원형태", extractSupportType(item));
  }

  return {
    badge: ORG_TYPE_BADGE[orgType],
    department: compact(item.org) || undefined,
    title: compact(item.title),
    summary: clampSummary(compact(item.summary)),
    lines: lines.slice(0, 6),
    link: item.link ? { label: "타사이트 이동", href: item.link } : undefined,
  };
}

