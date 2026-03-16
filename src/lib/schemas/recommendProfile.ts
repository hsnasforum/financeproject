import {
  addIssue,
  createValidationBag,
  parseArrayValue,
  parseEnum,
  parseIntValue,
  parseNumberValue,
} from "../http/validate";
import {
  DEFAULT_TOP_N,
  DEFAULT_WEIGHTS,
  type CandidatePool,
  type CandidateSource,
  type DepositProtectionMode,
  type RecommendPlanningHandoff,
  type LiquidityPref,
  type RecommendPlanningContext,
  type RateMode,
  type RecommendKind,
  type RecommendPurpose,
} from "../recommend/types";
import {
  buildParseResult,
  issue,
  parseStringIssues,
  type Issue,
  type ParseResult,
} from "./issueTypes";

export type RecommendProfileNormalized = {
  purpose: RecommendPurpose;
  kind: RecommendKind;
  preferredTerm: 3 | 6 | 12 | 24 | 36;
  liquidityPref: LiquidityPref;
  rateMode: RateMode;
  topN: number;
  candidatePool: CandidatePool;
  candidateSources: CandidateSource[];
  depositProtection: DepositProtectionMode;
  weights: {
    rate: number;
    term: number;
    liquidity: number;
  };
  planning?: RecommendPlanningHandoff;
  planningContext?: RecommendPlanningContext;
};

type SearchParamsInput =
  | URLSearchParams
  | { get: (key: string) => string | null }
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

const ALLOWED_PREFERRED_TERMS = [3, 6, 12, 24, 36] as const;
const ALLOWED_PLANNING_STAGES = ["DEFICIT", "DEBT", "EMERGENCY", "INVEST"] as const;
const ALLOWED_PLANNING_OVERALL_STATUSES = ["RUNNING", "SUCCESS", "PARTIAL_SUCCESS", "FAILED"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function readParam(params: SearchParamsInput, key: string): string {
  if (!params) return "";
  if (typeof (params as { get?: unknown }).get === "function") {
    return (((params as { get: (name: string) => string | null }).get(key) ?? "").trim());
  }
  return firstValue((params as Record<string, string | string[] | undefined>)[key]).trim();
}

function parsePreferredTerm(raw: unknown, fallback: RecommendProfileNormalized["preferredTerm"], path: string, issues: Issue[]): RecommendProfileNormalized["preferredTerm"] {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    issues.push(issue(path, "must be one of 3|6|12|24|36"));
    return fallback;
  }
  const value = Math.trunc(n);
  if (!ALLOWED_PREFERRED_TERMS.includes(value as RecommendProfileNormalized["preferredTerm"])) {
    issues.push(issue(path, "must be one of 3|6|12|24|36"));
    return fallback;
  }
  return value as RecommendProfileNormalized["preferredTerm"];
}

function parseCandidateSources(
  value: unknown,
  fallback: CandidateSource[],
  path: string,
  bag: ReturnType<typeof createValidationBag>,
): CandidateSource[] {
  if (value === undefined) return [...fallback];

  const raw = parseArrayValue<unknown>(bag, {
    path,
    value,
    fallback: [],
  });

  if (!Array.isArray(raw)) return [...fallback];

  const picked = new Set<CandidateSource>();
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (entry === "finlife" || entry === "datago_kdb") {
      picked.add(entry);
      continue;
    }
    addIssue(bag, `${path}[${i}]`, "must be finlife|datago_kdb");
  }

  if (picked.size === 0) {
    addIssue(bag, path, "must include at least one source");
    return [...fallback];
  }

  return [...picked];
}

function parseCandidateSourcesFromQuery(raw: string, issues: Issue[]): CandidateSource[] | null {
  const items = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (items.length === 0) {
    issues.push(issue("candidateSources", "must include at least one source"));
    return null;
  }

  const picked = new Set<CandidateSource>();
  for (const item of items) {
    if (item === "finlife" || item === "datago_kdb") {
      picked.add(item);
      continue;
    }
    issues.push(issue("candidateSources", "must be finlife|datago_kdb"));
  }

  if (picked.size === 0) return null;
  return [...picked];
}

function parsePlanningMetric(
  value: unknown,
  path: string,
  issues: Issue[],
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    issues.push(issue(path, "must be a non-negative number"));
    return undefined;
  }
  return Math.round(parsed);
}

function mergePlanningContextInput(source: Record<string, unknown>): Record<string, unknown> {
  const planningContext = isRecord(source.planningContext) ? source.planningContext : {};
  return {
    ...source,
    ...planningContext,
  };
}

function parsePlanningRunId(value: unknown, path: string, issues: Issue[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue(path, "must be a non-empty string"));
    return undefined;
  }
  return value.trim();
}

function parsePlanningStage(
  value: unknown,
  path: string,
  issues: Issue[],
): RecommendPlanningHandoff["summary"]["stage"] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && ALLOWED_PLANNING_STAGES.includes(value as RecommendPlanningHandoff["summary"]["stage"])) {
    return value as RecommendPlanningHandoff["summary"]["stage"];
  }
  issues.push(issue(path, "must be one of DEFICIT|DEBT|EMERGENCY|INVEST"));
  return undefined;
}

function parsePlanningOverallStatus(
  value: unknown,
  path: string,
  issues: Issue[],
): RecommendPlanningHandoff["summary"]["overallStatus"] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value === "string"
    && ALLOWED_PLANNING_OVERALL_STATUSES.includes(value as NonNullable<RecommendPlanningHandoff["summary"]["overallStatus"]>)
  ) {
    return value as NonNullable<RecommendPlanningHandoff["summary"]["overallStatus"]>;
  }
  issues.push(issue(path, "must be one of RUNNING|SUCCESS|PARTIAL_SUCCESS|FAILED"));
  return undefined;
}

function parsePlanningHandoff(source: Record<string, unknown>): { planning?: RecommendPlanningHandoff; issues: Issue[] } {
  const issues: Issue[] = [];
  const rawPlanning = isRecord(source.planning) ? source.planning : null;
  if (!rawPlanning) return { issues };

  const runId = parsePlanningRunId(rawPlanning.runId, "planning.runId", issues);
  if (!runId) {
    issues.push(issue("planning.runId", "is required when planning is provided"));
  }

  const rawSummary = rawPlanning.summary;
  if (!isRecord(rawSummary)) {
    issues.push(issue("planning.summary", "is required when planning is provided"));
    return { issues };
  }

  const stage = parsePlanningStage(rawSummary.stage, "planning.summary.stage", issues);
  if (!stage) {
    issues.push(issue("planning.summary.stage", "is required when planning is provided"));
  }

  const overallStatus = parsePlanningOverallStatus(
    rawSummary.overallStatus,
    "planning.summary.overallStatus",
    issues,
  );

  if (!runId || !stage) {
    return { issues };
  }

  return {
    planning: {
      runId,
      summary: {
        stage,
        ...(overallStatus ? { overallStatus } : {}),
      },
    },
    issues,
  };
}

export function defaults(): RecommendProfileNormalized {
  return {
    purpose: "seed-money",
    kind: "deposit",
    preferredTerm: 12,
    liquidityPref: "mid",
    rateMode: "max",
    topN: DEFAULT_TOP_N,
    candidatePool: "unified",
    candidateSources: ["finlife", "datago_kdb"],
    depositProtection: "any",
    weights: {
      rate: DEFAULT_WEIGHTS.rate,
      term: DEFAULT_WEIGHTS.term,
      liquidity: DEFAULT_WEIGHTS.liquidity,
    },
  };
}

export function parseRecommendProfile(input: unknown): ParseResult<RecommendProfileNormalized> {
  const bag = createValidationBag();
  const fallback = defaults();
  const source = isRecord(input) ? input : {};
  const planningContextInput = mergePlanningContextInput(source);

  const purpose = parseEnum(bag, {
    path: "purpose",
    value: source.purpose,
    allowed: ["emergency", "seed-money", "long-term"] as const,
    fallback: fallback.purpose,
  });

  const kind = parseEnum(bag, {
    path: "kind",
    value: source.kind,
    allowed: ["deposit", "saving"] as const,
    fallback: fallback.kind,
  });

  const preferredTermNumber = parseIntValue(bag, {
    path: "preferredTerm",
    value: source.preferredTerm,
    fallback: fallback.preferredTerm,
    min: 3,
    max: 36,
  });
  const preferredTermIssues: Issue[] = [];
  const preferredTerm = ALLOWED_PREFERRED_TERMS.includes(preferredTermNumber as RecommendProfileNormalized["preferredTerm"])
    ? (preferredTermNumber as RecommendProfileNormalized["preferredTerm"])
    : parsePreferredTerm(source.preferredTerm, fallback.preferredTerm, "preferredTerm", preferredTermIssues);

  const liquidityPref = parseEnum(bag, {
    path: "liquidityPref",
    value: source.liquidityPref,
    allowed: ["low", "mid", "high"] as const,
    fallback: fallback.liquidityPref,
  });

  const rateMode = parseEnum(bag, {
    path: "rateMode",
    value: source.rateMode,
    allowed: ["max", "base", "simple"] as const,
    fallback: fallback.rateMode,
  });

  const topN = parseIntValue(bag, {
    path: "topN",
    value: source.topN,
    fallback: fallback.topN,
    min: 1,
    max: 50,
  });

  const candidatePool = parseEnum(bag, {
    path: "candidatePool",
    value: source.candidatePool,
    allowed: ["unified"] as const,
    fallback: fallback.candidatePool,
  });

  const candidateSources = parseCandidateSources(
    source.candidateSources,
    fallback.candidateSources,
    "candidateSources",
    bag,
  );

  const depositProtection = parseEnum(bag, {
    path: "depositProtection",
    value: source.depositProtection,
    allowed: ["any", "prefer", "require"] as const,
    fallback: fallback.depositProtection,
  });

  const weightsRaw = source.weights;
  const hasWeightsObject = weightsRaw === undefined || isRecord(weightsRaw);
  if (!hasWeightsObject) {
    addIssue(bag, "weights", "must be an object");
  }
  const weights = hasWeightsObject && isRecord(weightsRaw) ? weightsRaw : {};

  const weightRate = parseNumberValue(bag, {
    path: "weights.rate",
    value: weights.rate,
    fallback: fallback.weights.rate,
    min: 0,
    max: 1,
  });
  const weightTerm = parseNumberValue(bag, {
    path: "weights.term",
    value: weights.term,
    fallback: fallback.weights.term,
    min: 0,
    max: 1,
  });
  const weightLiquidity = parseNumberValue(bag, {
    path: "weights.liquidity",
    value: weights.liquidity,
    fallback: fallback.weights.liquidity,
    min: 0,
    max: 1,
  });

  const issues = [...parseStringIssues(bag.issues), ...preferredTermIssues];
  const parsedPlanning = parsePlanningHandoff(source);
  const planningContextIssues: Issue[] = [];
  const monthlyIncomeKrw = parsePlanningMetric(
    planningContextInput.monthlyIncomeKrw ?? planningContextInput.monthlyIncome,
    "planningContext.monthlyIncomeKrw",
    planningContextIssues,
  );
  const monthlyExpenseKrw = parsePlanningMetric(
    planningContextInput.monthlyExpenseKrw ?? planningContextInput.monthlyExpense,
    "planningContext.monthlyExpenseKrw",
    planningContextIssues,
  );
  const liquidAssetsKrw = parsePlanningMetric(
    planningContextInput.liquidAssetsKrw ?? planningContextInput.liquidAssets,
    "planningContext.liquidAssetsKrw",
    planningContextIssues,
  );
  const debtBalanceKrw = parsePlanningMetric(
    planningContextInput.debtBalanceKrw ?? planningContextInput.debtBalance,
    "planningContext.debtBalanceKrw",
    planningContextIssues,
  );
  const planningContext: RecommendPlanningContext = {
    ...(typeof monthlyIncomeKrw === "number" ? { monthlyIncomeKrw } : {}),
    ...(typeof monthlyExpenseKrw === "number" ? { monthlyExpenseKrw } : {}),
    ...(typeof liquidAssetsKrw === "number" ? { liquidAssetsKrw } : {}),
    ...(typeof debtBalanceKrw === "number" ? { debtBalanceKrw } : {}),
  };
  const hasPlanningContext = Object.keys(planningContext).length > 0;
  const allIssues = [...issues, ...parsedPlanning.issues, ...planningContextIssues];

  return buildParseResult(
    {
      purpose,
      kind,
      preferredTerm,
      liquidityPref,
      rateMode,
      topN,
      candidatePool,
      candidateSources,
      depositProtection,
      weights: {
        rate: weightRate,
        term: weightTerm,
        liquidity: weightLiquidity,
      },
      ...(parsedPlanning.planning ? { planning: parsedPlanning.planning } : {}),
      ...(hasPlanningContext ? { planningContext } : {}),
    },
    allIssues,
  );
}

export function issuesToApi(issues: Issue[]): string[] {
  return issues.map((entry) => `${entry.path} ${entry.message}`);
}

export function fromSearchParams(params: SearchParamsInput): ParseResult<Partial<RecommendProfileNormalized>> {
  const issues: Issue[] = [];
  const patch: Partial<RecommendProfileNormalized> = {};

  const purpose = readParam(params, "purpose");
  if (purpose) {
    if (purpose === "emergency" || purpose === "seed-money" || purpose === "long-term") {
      patch.purpose = purpose;
    } else {
      issues.push(issue("purpose", "must be one of emergency|seed-money|long-term"));
    }
  }

  const kind = readParam(params, "kind");
  if (kind) {
    if (kind === "deposit" || kind === "saving") {
      patch.kind = kind;
    } else {
      issues.push(issue("kind", "must be one of deposit|saving"));
    }
  }

  const preferredTerm = readParam(params, "preferredTerm");
  if (preferredTerm) {
    const n = Number(preferredTerm);
    if (Number.isFinite(n) && ALLOWED_PREFERRED_TERMS.includes(Math.trunc(n) as RecommendProfileNormalized["preferredTerm"])) {
      patch.preferredTerm = Math.trunc(n) as RecommendProfileNormalized["preferredTerm"];
    } else {
      issues.push(issue("preferredTerm", "must be one of 3|6|12|24|36"));
    }
  }

  const liquidityPref = readParam(params, "liquidityPref");
  if (liquidityPref) {
    if (liquidityPref === "low" || liquidityPref === "mid" || liquidityPref === "high") {
      patch.liquidityPref = liquidityPref;
    } else {
      issues.push(issue("liquidityPref", "must be one of low|mid|high"));
    }
  }

  const rateMode = readParam(params, "rateMode");
  if (rateMode) {
    if (rateMode === "max" || rateMode === "base" || rateMode === "simple") {
      patch.rateMode = rateMode;
    } else {
      issues.push(issue("rateMode", "must be one of max|base|simple"));
    }
  }

  const topN = readParam(params, "topN");
  if (topN) {
    const n = Number(topN);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 50) {
      issues.push(issue("topN", "must be an integer between 1 and 50"));
    } else {
      patch.topN = n;
    }
  }

  const candidatePool = readParam(params, "candidatePool") || readParam(params, "pool");
  if (candidatePool) {
    if (candidatePool === "unified") {
      patch.candidatePool = "unified";
    } else {
      issues.push(issue("candidatePool", "must be unified"));
    }
  }

  const depositProtection = readParam(params, "depositProtection");
  if (depositProtection) {
    if (depositProtection === "any" || depositProtection === "prefer" || depositProtection === "require") {
      patch.depositProtection = depositProtection;
    } else {
      issues.push(issue("depositProtection", "must be one of any|prefer|require"));
    }
  }

  const sources = readParam(params, "candidateSources") || readParam(params, "sources");
  if (sources) {
    const parsedSources = parseCandidateSourcesFromQuery(sources, issues);
    if (parsedSources) {
      patch.candidateSources = parsedSources;
    }
  }

  const planningContext: RecommendPlanningContext = {};
  const monthlyIncomeKrw = parsePlanningMetric(
    readParam(params, "monthlyIncomeKrw") || readParam(params, "monthlyIncome"),
    "planningContext.monthlyIncomeKrw",
    issues,
  );
  if (typeof monthlyIncomeKrw === "number") planningContext.monthlyIncomeKrw = monthlyIncomeKrw;
  const monthlyExpenseKrw = parsePlanningMetric(
    readParam(params, "monthlyExpenseKrw") || readParam(params, "monthlyExpense"),
    "planningContext.monthlyExpenseKrw",
    issues,
  );
  if (typeof monthlyExpenseKrw === "number") planningContext.monthlyExpenseKrw = monthlyExpenseKrw;
  const liquidAssetsKrw = parsePlanningMetric(
    readParam(params, "liquidAssetsKrw") || readParam(params, "liquidAssets"),
    "planningContext.liquidAssetsKrw",
    issues,
  );
  if (typeof liquidAssetsKrw === "number") planningContext.liquidAssetsKrw = liquidAssetsKrw;
  const debtBalanceKrw = parsePlanningMetric(
    readParam(params, "debtBalanceKrw") || readParam(params, "debtBalance"),
    "planningContext.debtBalanceKrw",
    issues,
  );
  if (typeof debtBalanceKrw === "number") planningContext.debtBalanceKrw = debtBalanceKrw;
  if (Object.keys(planningContext).length > 0) {
    patch.planningContext = planningContext;
  }

  const planningRunId = parsePlanningRunId(readParam(params, "planning.runId"), "planning.runId", issues);
  const planningStage = parsePlanningStage(readParam(params, "planning.summary.stage"), "planning.summary.stage", issues);
  const planningOverallStatus = parsePlanningOverallStatus(
    readParam(params, "planning.summary.overallStatus"),
    "planning.summary.overallStatus",
    issues,
  );

  if (planningRunId || planningStage || planningOverallStatus) {
    if (!planningRunId) {
      issues.push(issue("planning.runId", "is required when planning is provided"));
    }
    if (!planningStage) {
      issues.push(issue("planning.summary.stage", "is required when planning is provided"));
    }
    if (planningRunId && planningStage) {
      patch.planning = {
        runId: planningRunId,
        summary: {
          stage: planningStage,
          ...(planningOverallStatus ? { overallStatus: planningOverallStatus } : {}),
        },
      };
    }
  }

  return buildParseResult(patch, issues);
}

export function toSearchParams(profile: RecommendProfileNormalized): URLSearchParams {
  const params = new URLSearchParams();
  params.set("purpose", profile.purpose);
  params.set("kind", profile.kind);
  params.set("preferredTerm", String(profile.preferredTerm));
  params.set("liquidityPref", profile.liquidityPref);
  params.set("rateMode", profile.rateMode);
  params.set("topN", String(profile.topN));
  params.set("candidatePool", profile.candidatePool);
  params.set("depositProtection", profile.depositProtection);
  params.set("candidateSources", profile.candidateSources.join(","));
  if (typeof profile.planningContext?.monthlyIncomeKrw === "number") {
    params.set("monthlyIncomeKrw", String(profile.planningContext.monthlyIncomeKrw));
  }
  if (typeof profile.planningContext?.monthlyExpenseKrw === "number") {
    params.set("monthlyExpenseKrw", String(profile.planningContext.monthlyExpenseKrw));
  }
  if (typeof profile.planningContext?.liquidAssetsKrw === "number") {
    params.set("liquidAssetsKrw", String(profile.planningContext.liquidAssetsKrw));
  }
  if (typeof profile.planningContext?.debtBalanceKrw === "number") {
    params.set("debtBalanceKrw", String(profile.planningContext.debtBalanceKrw));
  }
  if (profile.planning?.runId) {
    params.set("planning.runId", profile.planning.runId);
  }
  if (profile.planning?.summary.stage) {
    params.set("planning.summary.stage", profile.planning.summary.stage);
  }
  if (profile.planning?.summary.overallStatus) {
    params.set("planning.summary.overallStatus", profile.planning.summary.overallStatus);
  }
  return params;
}
