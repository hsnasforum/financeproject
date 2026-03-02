import { safeExternalUrl } from "../url/safeExternalUrl";
import { gov24BenefitDetailUrl } from "./gov24Urls";

export type ApplyLink = { label: string; url: string };
const ONLINE_HINT_PATTERN = /(온라인|정부24|홈페이지|웹|사이트)/;

const URL_PATTERN = /https?:\/\/[^\s)]+/g;
const EXPLICIT_URL_KEYS = [
  "온라인신청URL",
  "온라인신청사이트",
  "신청URL",
  "홈페이지",
  "상세URL",
  "서비스URL",
  "서비스상세URL",
  "안내URL",
] as const;

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[\s_\-:/()[\].]/g, "");
}

function addUrl(out: ApplyLink[], seen: Set<string>, rawUrl: string, label: string): void {
  const trimmed = rawUrl.replace(/[),.;]+$/g, "").trim();
  const safe = safeExternalUrl(trimmed);
  if (!safe || seen.has(safe)) return;
  seen.add(safe);
  out.push({ label, url: safe });
}

function extractUrlsFromText(text?: string): string[] {
  if (!text) return [];
  return text.match(URL_PATTERN) ?? [];
}

export function extractApplyLinks(input: {
  serviceId?: string;
  applyHow?: string;
  link?: string;
  homepage?: string;
  raw?: Record<string, unknown>;
  title?: string;
  orgName?: string;
}): { links: ApplyLink[]; primaryUrl: string | null } {
  const out: ApplyLink[] = [];
  const seen = new Set<string>();

  const explicit: Array<{ url?: string; label: string }> = [
    { url: input.link, label: "바로가기" },
    { url: input.homepage, label: "바로가기" },
  ];

  for (const row of explicit) {
    if (row.url) addUrl(out, seen, row.url, row.label);
  }

  if (input.raw && typeof input.raw === "object") {
    const keyMap = new Map<string, unknown>();
    for (const [k, v] of Object.entries(input.raw)) {
      keyMap.set(normalizeLookupKey(k), v);
    }
    for (const key of EXPLICIT_URL_KEYS) {
      const hit = keyMap.get(normalizeLookupKey(key));
      if (typeof hit !== "string") continue;
      const label = /온라인|신청/.test(key) ? "온라인신청" : "바로가기";
      addUrl(out, seen, hit, label);
    }
  }

  const textSources = [input.applyHow ?? ""];
  for (const text of textSources) {
    const label = /온라인|정부24\s*온라인\s*신청/.test(text) ? "온라인신청" : "바로가기";
    for (const url of extractUrlsFromText(text)) {
      addUrl(out, seen, url, label);
    }
  }

  if (out.length === 0 && ONLINE_HINT_PATTERN.test(input.applyHow ?? "") && (input.serviceId ?? "").trim()) {
    addUrl(out, seen, gov24BenefitDetailUrl((input.serviceId ?? "").trim()), "정부24 바로가기");
  }

  function isGovKr(url: string): boolean {
    try {
      return new URL(url).hostname.endsWith("gov.kr");
    } catch {
      return false;
    }
  }

  const externalFirst = out.find((entry) => !isGovKr(entry.url));
  const primaryUrl = externalFirst?.url ?? out[0]?.url ?? null;
  return { links: out, primaryUrl };
}
