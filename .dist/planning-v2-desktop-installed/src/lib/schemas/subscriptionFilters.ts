import {
  addIssue,
  createValidationBag,
  parseEnum,
  parseStringValue,
} from "../http/validate";
import {
  buildParseResult,
  parseStringIssues,
  type Issue,
  type ParseResult,
} from "./issueTypes";

export type SubscriptionHouseType = "apt" | "urbty" | "remndr";
export type SubscriptionMode = "search" | "all";

export type SubscriptionFiltersNormalized = {
  region: string;
  from: string;
  to: string;
  q: string;
  houseType: SubscriptionHouseType;
  mode: SubscriptionMode;
  deep: boolean;
};

type RawParams =
  | URLSearchParams
  | { get: (key: string) => string | null }
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function readParam(params: RawParams, key: string): string {
  if (!params) return "";
  if (typeof (params as { get?: unknown }).get === "function") {
    return (((params as { get: (name: string) => string | null }).get(key) ?? "").trim());
  }
  return firstValue((params as Record<string, string | string[] | undefined>)[key]).trim();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoIsoDate(baseDate: Date, days: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return false;
  return toIsoDate(date) === value;
}

function parseDeepFlag(value: string): boolean {
  const lowered = value.trim().toLowerCase();
  return lowered === "1" || lowered === "true" || lowered === "yes" || lowered === "deep";
}

export function defaults(options?: { now?: Date }): SubscriptionFiltersNormalized {
  const now = options?.now ?? new Date();
  return {
    region: "전국",
    from: daysAgoIsoDate(now, 90),
    to: toIsoDate(now),
    q: "",
    houseType: "apt",
    mode: "all",
    deep: false,
  };
}

export function parseSubscriptionFilters(
  params: RawParams,
  options?: { now?: Date },
): ParseResult<SubscriptionFiltersNormalized> {
  const bag = createValidationBag();
  const fallback = defaults(options);

  const regionRaw = readParam(params, "region");
  const region = parseStringValue(bag, {
    path: "region",
    value: regionRaw,
    fallback: fallback.region,
    maxLength: 40,
  }) || fallback.region;

  const fromRaw = readParam(params, "from");
  const toRaw = readParam(params, "to");

  let from = fallback.from;
  if (fromRaw.length > 0) {
    if (isValidIsoDate(fromRaw)) {
      from = fromRaw;
    } else {
      addIssue(bag, "from", "must be YYYY-MM-DD");
    }
  }

  let to = fallback.to;
  if (toRaw.length > 0) {
    if (isValidIsoDate(toRaw)) {
      to = toRaw;
    } else {
      addIssue(bag, "to", "must be YYYY-MM-DD");
    }
  }

  if (from > to) {
    const swapped = from;
    from = to;
    to = swapped;
  }

  const q = parseStringValue(bag, {
    path: "q",
    value: readParam(params, "q"),
    fallback: fallback.q,
    maxLength: 120,
  });

  const houseType = parseEnum(bag, {
    path: "houseType",
    value: readParam(params, "houseType") || readParam(params, "type"),
    allowed: ["apt", "urbty", "remndr"] as const,
    fallback: fallback.houseType,
  });

  const mode = parseEnum(bag, {
    path: "mode",
    value: readParam(params, "mode"),
    allowed: ["search", "all"] as const,
    fallback: fallback.mode,
  });

  const deep = parseDeepFlag(readParam(params, "scan"));

  return buildParseResult(
    {
      region,
      from,
      to,
      q,
      houseType,
      mode,
      deep,
    },
    parseStringIssues(bag.issues),
  );
}

export function issuesToApi(issues: Issue[]): string[] {
  return issues.map((entry) => `${entry.path} ${entry.message}`);
}
