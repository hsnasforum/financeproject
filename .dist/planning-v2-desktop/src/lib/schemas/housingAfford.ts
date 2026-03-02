import {
  addIssue,
  createValidationBag,
  parseEnum,
  parseIntValue,
  parseNumberValue,
} from "../http/validate";
import {
  buildParseResult,
  parseStringIssues,
  type Issue,
  type ParseResult,
} from "./issueTypes";

export type HousingAffordMode = "rent" | "buy";

export type HousingAffordNormalized = {
  incomeNet: number;
  outflow: number;
  mode: HousingAffordMode;
  deposit: number;
  monthlyRent: number;
  opportunityAprPct: number;
  purchasePrice: number;
  equity: number;
  loanAprPct: number;
  termMonths: number;
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

function normalizeNumericInput(value: string): string {
  return value.replace(/,/g, "");
}

function parseClampedNumber(
  bag: ReturnType<typeof createValidationBag>,
  input: {
    path: string;
    raw: string;
    fallback: number;
    min: number;
    max?: number;
  },
): number {
  if (!input.raw) return input.fallback;

  const cleaned = normalizeNumericInput(input.raw);
  const parsed = Number(cleaned);
  const bounded = parseNumberValue(bag, {
    path: input.path,
    value: cleaned,
    fallback: input.fallback,
    min: input.min,
    max: input.max,
    clamp: true,
  });

  if (!Number.isFinite(parsed)) return bounded;
  if (parsed < input.min) {
    addIssue(bag, input.path, `must be >= ${input.min}`);
    return bounded;
  }
  if (input.max !== undefined && parsed > input.max) {
    addIssue(bag, input.path, `must be <= ${input.max}`);
    return bounded;
  }
  return bounded;
}

function parseClampedInt(
  bag: ReturnType<typeof createValidationBag>,
  input: {
    path: string;
    raw: string;
    fallback: number;
    min: number;
    max: number;
  },
): number {
  if (!input.raw) return input.fallback;

  const cleaned = normalizeNumericInput(input.raw);
  const parsed = Number(cleaned);
  const bounded = parseIntValue(bag, {
    path: input.path,
    value: cleaned,
    fallback: input.fallback,
    min: input.min,
    max: input.max,
    clamp: true,
  });

  if (!Number.isFinite(parsed)) return bounded;
  if (!Number.isInteger(parsed)) {
    addIssue(bag, input.path, "must be an integer");
    return bounded;
  }
  if (parsed < input.min || parsed > input.max) {
    addIssue(bag, input.path, `must be between ${input.min} and ${input.max}`);
  }
  return bounded;
}

export function defaults(): HousingAffordNormalized {
  return {
    incomeNet: 3_500_000,
    outflow: 1_800_000,
    mode: "rent",
    deposit: 100_000_000,
    monthlyRent: 700_000,
    opportunityAprPct: 3,
    purchasePrice: 500_000_000,
    equity: 150_000_000,
    loanAprPct: 4.2,
    termMonths: 360,
  };
}

export function parseHousingAfford(params: RawParams): ParseResult<HousingAffordNormalized> {
  const bag = createValidationBag();
  const fallback = defaults();

  const mode = parseEnum(bag, {
    path: "mode",
    value: readParam(params, "mode"),
    allowed: ["rent", "buy"] as const,
    fallback: fallback.mode,
  });

  const incomeNet = parseClampedNumber(bag, {
    path: "incomeNet",
    raw: readParam(params, "incomeNet"),
    fallback: fallback.incomeNet,
    min: 0,
  });

  const outflow = parseClampedNumber(bag, {
    path: "outflow",
    raw: readParam(params, "outflow"),
    fallback: fallback.outflow,
    min: 0,
  });

  const deposit = parseClampedNumber(bag, {
    path: "deposit",
    raw: readParam(params, "deposit"),
    fallback: fallback.deposit,
    min: 0,
  });

  const monthlyRent = parseClampedNumber(bag, {
    path: "monthlyRent",
    raw: readParam(params, "monthlyRent"),
    fallback: fallback.monthlyRent,
    min: 0,
  });

  const opportunityAprPct = parseClampedNumber(bag, {
    path: "opportunityAprPct",
    raw: readParam(params, "opportunityAprPct"),
    fallback: fallback.opportunityAprPct,
    min: 0,
    max: 30,
  });

  const purchasePrice = parseClampedNumber(bag, {
    path: "purchasePrice",
    raw: readParam(params, "purchasePrice"),
    fallback: fallback.purchasePrice,
    min: 0,
  });

  const equity = parseClampedNumber(bag, {
    path: "equity",
    raw: readParam(params, "equity"),
    fallback: fallback.equity,
    min: 0,
  });

  const loanAprPct = parseClampedNumber(bag, {
    path: "loanAprPct",
    raw: readParam(params, "loanAprPct"),
    fallback: fallback.loanAprPct,
    min: 0,
    max: 30,
  });

  const termMonths = parseClampedInt(bag, {
    path: "termMonths",
    raw: readParam(params, "termMonths"),
    fallback: fallback.termMonths,
    min: 12,
    max: 600,
  });

  return buildParseResult(
    {
      incomeNet,
      outflow,
      mode,
      deposit,
      monthlyRent,
      opportunityAprPct,
      purchasePrice,
      equity,
      loanAprPct,
      termMonths,
    },
    parseStringIssues(bag.issues),
  );
}

export function issuesToApi(issues: Issue[]): string[] {
  return issues.map((entry) => `${entry.path} ${entry.message}`);
}
