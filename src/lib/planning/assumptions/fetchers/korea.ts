import { type AssumptionsSnapshot } from "../types.ts";
import { getPlanningFeatureFlags } from "../../config";
import { fetchEcosKeyStatisticList } from "./ecosClient.ts";
import { parseEcosKeyStats } from "./ecosParse.ts";
import { parseBokInterestRates, parseBokMpcBaseRate, parseCpi } from "./koreaParse.ts";

type SourceRef = AssumptionsSnapshot["sources"][number];

type KoreaFetchResult = {
  partial: AssumptionsSnapshot["korea"];
  sources: SourceRef[];
  warnings: string[];
  asOfCandidate?: string;
};

const FETCH_TIMEOUT_MS = 12_000;

const KOREA_SOURCE_URLS = {
  bokMpc: "https://www.bok.or.kr/eng/bbs/E0000634/view.do?nttId=10096672&menuNo=400069",
  bokInterestRates: "https://www.bok.or.kr/eng/bbs/E0000634/view.do?nttId=10096927&menuNo=400069",
  cpi: "https://kostat.go.kr/board.es?act=view&bid=11799&list_no=437746&mid=a20402000000&nPage=1&tag=&utm_source=chatgpt.com",
} as const;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning assumptions fetcher is server-only.");
  }
}

assertServerOnly();

function fetchNowIso(): string {
  return new Date().toISOString();
}

function toIsoDate(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.toISOString().slice(0, 10);
}

function endOfMonthIso(year: number, month: number): string {
  const utc = new Date(Date.UTC(year, month, 0));
  return utc.toISOString().slice(0, 10);
}

function parseMonthToken(value: string): number | null {
  const token = value.toLowerCase();
  const map: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  return map[token] ?? null;
}

function extractDateHints(html: string): string[] {
  const hints = new Set<string>();

  const compactText = html.replace(/\s+/g, " ");

  const ymdDots = compactText.match(/(20\d{2})\.(0?[1-9]|1[0-2])\.(0?[1-9]|[12]\d|3[01])/g) ?? [];
  ymdDots.forEach((raw) => {
    const match = raw.match(/(20\d{2})\.(0?[1-9]|1[0-2])\.(0?[1-9]|[12]\d|3[01])/);
    if (!match) return;
    hints.add(toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])));
  });

  const ymdDash = compactText.match(/(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])/g) ?? [];
  ymdDash.forEach((raw) => {
    const match = raw.match(/(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])/);
    if (!match) return;
    hints.add(toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])));
  });

  const longDateMatches = compactText.match(/\b([A-Z][a-z]{2,9})\s+([0-3]?\d),\s*(20\d{2})\b/g) ?? [];
  longDateMatches.forEach((raw) => {
    const match = raw.match(/\b([A-Z][a-z]{2,9})\s+([0-3]?\d),\s*(20\d{2})\b/);
    if (!match) return;
    const month = parseMonthToken(match[1]);
    if (!month) return;
    hints.add(toIsoDate(Number(match[3]), month, Number(match[2])));
  });

  const inMonthYearMatches = compactText.match(/\bIn\s+([A-Z][a-z]{2,9})\s+(20\d{2})\b/g) ?? [];
  inMonthYearMatches.forEach((raw) => {
    const match = raw.match(/\bIn\s+([A-Z][a-z]{2,9})\s+(20\d{2})\b/);
    if (!match) return;
    const month = parseMonthToken(match[1]);
    if (!month) return;
    hints.add(endOfMonthIso(Number(match[2]), month));
  });

  return Array.from(hints).sort();
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "finance-planning-assumptions-sync/1.0",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function formatSourceName(baseName: string, dateHints: string[]): string {
  if (dateHints.length === 0) return baseName;
  const latest = dateHints[dateHints.length - 1];
  return `${baseName} [asOf=${latest}]`;
}

function pushSource(sources: SourceRef[], name: string, url: string, fetchedAt: string): void {
  sources.push({ name, url, fetchedAt });
}

async function fetchKoreaAssumptionsFromHtmlFallback(): Promise<KoreaFetchResult> {
  const partial: AssumptionsSnapshot["korea"] = {};
  const sources: SourceRef[] = [];
  const warnings: string[] = [];
  const asOfCandidates: string[] = [];

  const mpcFetchedAt = fetchNowIso();
  try {
    const html = await fetchHtml(KOREA_SOURCE_URLS.bokMpc);
    const dateHints = extractDateHints(html);
    pushSource(sources, formatSourceName("BOK MPC English", dateHints), KOREA_SOURCE_URLS.bokMpc, mpcFetchedAt);
    asOfCandidates.push(...dateHints);

    const baseRate = parseBokMpcBaseRate(html);
    if (baseRate === null) {
      warnings.push("BOK MPC parse warning: baseRatePct not found.");
    } else {
      partial.baseRatePct = baseRate;
      partial.policyRatePct = baseRate;
    }
  } catch (error) {
    warnings.push(`BOK MPC fetch failed: ${(error as Error).message}`);
    pushSource(sources, "BOK MPC English", KOREA_SOURCE_URLS.bokMpc, mpcFetchedAt);
  }

  const ratesFetchedAt = fetchNowIso();
  try {
    const html = await fetchHtml(KOREA_SOURCE_URLS.bokInterestRates);
    const dateHints = extractDateHints(html);
    pushSource(sources, formatSourceName("BOK Interest Rates English", dateHints), KOREA_SOURCE_URLS.bokInterestRates, ratesFetchedAt);
    asOfCandidates.push(...dateHints);

    const parsed = parseBokInterestRates(html);
    if (parsed.newDepositAvgPct === undefined) warnings.push("BOK Interest Rates parse warning: newDepositAvgPct not found.");
    if (parsed.newLoanAvgPct === undefined) warnings.push("BOK Interest Rates parse warning: newLoanAvgPct not found.");

    Object.assign(partial, parsed);
  } catch (error) {
    warnings.push(`BOK Interest Rates fetch failed: ${(error as Error).message}`);
    pushSource(sources, "BOK Interest Rates English", KOREA_SOURCE_URLS.bokInterestRates, ratesFetchedAt);
  }

  const cpiFetchedAt = fetchNowIso();
  try {
    const html = await fetchHtml(KOREA_SOURCE_URLS.cpi);
    const dateHints = extractDateHints(html);
    pushSource(sources, formatSourceName("KOSTAT CPI English", dateHints), KOREA_SOURCE_URLS.cpi, cpiFetchedAt);
    asOfCandidates.push(...dateHints);

    const parsed = parseCpi(html);
    if (parsed.cpiYoYPct === undefined) warnings.push("KOSTAT CPI parse warning: cpiYoYPct not found.");
    if (parsed.coreCpiYoYPct === undefined) warnings.push("KOSTAT CPI parse warning: coreCpiYoYPct not found.");

    Object.assign(partial, parsed);
  } catch (error) {
    warnings.push(`KOSTAT CPI fetch failed: ${(error as Error).message}`);
    pushSource(sources, "KOSTAT CPI English", KOREA_SOURCE_URLS.cpi, cpiFetchedAt);
  }

  return {
    partial,
    sources,
    warnings,
    ...(asOfCandidates.length > 0 ? { asOfCandidate: asOfCandidates.sort()[asOfCandidates.length - 1] } : {}),
  };
}

function isEcosEnabled(): boolean {
  return getPlanningFeatureFlags().ecosEnabled;
}

function resolveEcosApiKey(): string {
  return (process.env.ECOS_API_KEY ?? process.env.BOK_ECOS_API_KEY ?? "").trim();
}

export async function fetchKoreaAssumptions(): Promise<KoreaFetchResult> {
  assertServerOnly();

  const ecosEnabled = isEcosEnabled();
  const ecosApiKey = resolveEcosApiKey();

  if (ecosEnabled && ecosApiKey) {
    const partial: AssumptionsSnapshot["korea"] = {};
    const sources: SourceRef[] = [];
    const warnings: string[] = [];
    const fetchedAt = fetchNowIso();
    try {
      const rows = await fetchEcosKeyStatisticList({ apiKey: ecosApiKey });
      const parsed = parseEcosKeyStats(rows);

      if (typeof parsed.policyRatePct === "number") {
        partial.policyRatePct = parsed.policyRatePct;
        partial.baseRatePct = parsed.policyRatePct;
      }
      if (typeof parsed.callOvernightPct === "number") partial.callOvernightPct = parsed.callOvernightPct;
      if (typeof parsed.cd91Pct === "number") partial.cd91Pct = parsed.cd91Pct;
      if (typeof parsed.koribor3mPct === "number") partial.koribor3mPct = parsed.koribor3mPct;
      if (typeof parsed.msb364Pct === "number") partial.msb364Pct = parsed.msb364Pct;

      warnings.push(...parsed.warnings);
      pushSource(sources, "ECOS KeyStatisticList", "https://ecos.bok.or.kr/api/", fetchedAt);

      const hasAnyRate = typeof partial.policyRatePct === "number"
        || typeof partial.callOvernightPct === "number"
        || typeof partial.cd91Pct === "number"
        || typeof partial.koribor3mPct === "number"
        || typeof partial.msb364Pct === "number";
      if (!hasAnyRate) {
        warnings.push("ECOS_PARSE_EMPTY");
        warnings.push("ECOS_FALLBACK_USED");
        const fallback = await fetchKoreaAssumptionsFromHtmlFallback();
        return {
          partial: fallback.partial,
          sources: [...sources, ...fallback.sources],
          warnings: [...warnings, ...fallback.warnings],
          asOfCandidate: fallback.asOfCandidate ?? parsed.asOf,
        };
      }

      return {
        partial,
        sources,
        warnings,
        asOfCandidate: parsed.asOf,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      const fallback = await fetchKoreaAssumptionsFromHtmlFallback();
      return {
        partial: fallback.partial,
        sources: [
          ...sources,
          {
            name: "ECOS KeyStatisticList",
            url: "https://ecos.bok.or.kr/api/",
            fetchedAt,
          },
          ...fallback.sources,
        ],
        warnings: [`ECOS fetch failed: ${message}`, "ECOS_FALLBACK_USED", ...fallback.warnings],
        asOfCandidate: fallback.asOfCandidate,
      };
    }
  }

  const fallback = await fetchKoreaAssumptionsFromHtmlFallback();
  return {
    ...fallback,
    warnings: ["ECOS_FALLBACK_USED", ...fallback.warnings],
  };
}
