import { type ActionItemV2, type ProductCandidate } from "./types";

type FinlifeOption = {
  save_trm?: string;
  intr_rate?: number | null;
  intr_rate2?: number | null;
};

type FinlifeProduct = {
  fin_prdt_cd?: string;
  kor_co_nm?: string;
  fin_prdt_nm?: string;
  options?: FinlifeOption[];
  best?: {
    save_trm?: string;
    intr_rate?: number | null;
    intr_rate2?: number | null;
  };
};

type MatchOptions = {
  includeProducts: boolean;
  emergencyHorizonMonths?: number;
  maxCandidatesPerAction?: number;
  requestBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("finlife candidate matching is server-only.");
  }
}

function parseTermMonths(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const matched = input.match(/\d+/);
  if (!matched?.[0]) return undefined;
  const value = Number(matched[0]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.trunc(value);
}

function rateValues(product: FinlifeProduct): number[] {
  const values: number[] = [];
  for (const option of product.options ?? []) {
    if (typeof option.intr_rate === "number" && Number.isFinite(option.intr_rate)) values.push(option.intr_rate);
    if (typeof option.intr_rate2 === "number" && Number.isFinite(option.intr_rate2)) values.push(option.intr_rate2);
  }
  if (typeof product.best?.intr_rate === "number" && Number.isFinite(product.best.intr_rate)) values.push(product.best.intr_rate);
  if (typeof product.best?.intr_rate2 === "number" && Number.isFinite(product.best.intr_rate2)) values.push(product.best.intr_rate2);
  return values;
}

function toCandidate(kind: ProductCandidate["kind"], product: FinlifeProduct): ProductCandidate | null {
  const finPrdtCd = (product.fin_prdt_cd ?? "").trim();
  const company = (product.kor_co_nm ?? "").trim();
  const name = (product.fin_prdt_nm ?? "").trim();
  if (!finPrdtCd || !company || !name) return null;

  const rates = rateValues(product);
  const termMonths = parseTermMonths(product.best?.save_trm ?? product.options?.[0]?.save_trm);

  return {
    kind,
    finPrdtCd,
    company,
    name,
    ...(termMonths ? { termMonths } : {}),
    ...(rates.length > 0 ? { rateMinPct: Math.min(...rates), rateMaxPct: Math.max(...rates) } : {}),
  };
}

function scoreForEmergency(candidate: ProductCandidate, horizon: number): number {
  const term = candidate.termMonths ?? 12;
  const termPenalty = Math.abs(term - horizon);
  const rateBoost = candidate.rateMaxPct ?? candidate.rateMinPct ?? 0;
  return rateBoost * 10 - termPenalty;
}

function scoreForGoal(candidate: ProductCandidate, targetMonth: number): number {
  const term = candidate.termMonths ?? targetMonth;
  const termPenalty = Math.abs(term - targetMonth);
  const rateBoost = candidate.rateMaxPct ?? candidate.rateMinPct ?? 0;
  return rateBoost * 10 - termPenalty;
}

async function fetchFinlifeProducts(
  kind: "deposit" | "saving",
  options: MatchOptions,
): Promise<FinlifeProduct[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.requestBaseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const endpoint = `${baseUrl}/api/finlife/${kind}?topFinGrpNo=020000&pageNo=1`;
  const response = await fetchImpl(endpoint, { method: "GET", cache: "no-store" });
  if (!response.ok) return [];

  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown } | null;
  if (!payload?.ok || !Array.isArray(payload.data)) return [];
  return payload.data as FinlifeProduct[];
}

function buildWhyThis(actionCode: ActionItemV2["code"], candidate: ProductCandidate): string[] {
  if (actionCode === "BUILD_EMERGENCY_FUND") {
    return [
      "비상금 목적에 맞춰 단기 운용/접근성 중심으로 비교 가능한 후보입니다.",
      `기간(${candidate.termMonths ?? "미표기"}개월)과 금리 범위를 함께 확인하세요.`,
    ];
  }
  if (actionCode === "COVER_LUMP_SUM_GOAL") {
    return [
      "목표자금 만기 시점과 맞는 기간 옵션 비교 후보입니다.",
      "기간-금리 균형 관점에서 비교하세요.",
    ];
  }
  if (actionCode === "IMPROVE_RETIREMENT_PLAN") {
    return [
      "장기 적립 후보 비교용 목록입니다.",
      "리스크 허용범위와 기간 일치 여부를 우선 확인하세요.",
    ];
  }
  return ["목적 적합성 비교를 위한 참고 후보입니다."];
}

function attachCandidatesToAction(
  action: ActionItemV2,
  deposits: ProductCandidate[],
  savings: ProductCandidate[],
  options: MatchOptions,
): ActionItemV2 {
  const maxN = Math.max(1, Math.min(20, Math.trunc(options.maxCandidatesPerAction ?? 5)));
  const emergencyHorizon = Math.max(1, Math.min(24, Math.trunc(options.emergencyHorizonMonths ?? 6)));

  let picked: ProductCandidate[] = [];

  if (action.code === "BUILD_EMERGENCY_FUND") {
    picked = [...deposits]
      .sort((a, b) => scoreForEmergency(b, emergencyHorizon) - scoreForEmergency(a, emergencyHorizon))
      .slice(0, maxN);
  } else if (action.code === "COVER_LUMP_SUM_GOAL") {
    const targetMonth = Math.max(1, Math.trunc(action.metrics.targetMonth ?? 12));
    picked = [...savings]
      .sort((a, b) => scoreForGoal(b, targetMonth) - scoreForGoal(a, targetMonth))
      .slice(0, maxN);
  } else if (action.code === "IMPROVE_RETIREMENT_PLAN") {
    picked = [...savings]
      .sort((a, b) => (b.rateMaxPct ?? 0) - (a.rateMaxPct ?? 0))
      .slice(0, maxN);
  }

  if (picked.length === 0) return action;

  return {
    ...action,
    candidates: picked.map((candidate) => ({
      ...candidate,
      whyThis: buildWhyThis(action.code, candidate),
      notes: [
        "우대조건/중도해지/가입채널 조건은 실제 상품 상세에서 추가 확인이 필요합니다.",
      ],
    })),
  };
}

export async function matchCandidates(actions: ActionItemV2[], opts: MatchOptions): Promise<ActionItemV2[]> {
  assertServerOnly();
  if (!opts.includeProducts) return actions;

  const [depositRows, savingRows] = await Promise.all([
    fetchFinlifeProducts("deposit", opts),
    fetchFinlifeProducts("saving", opts),
  ]);

  const deposits = depositRows
    .map((row) => toCandidate("deposit", row))
    .filter((row): row is ProductCandidate => Boolean(row));
  const savings = savingRows
    .map((row) => toCandidate("saving", row))
    .filter((row): row is ProductCandidate => Boolean(row));

  return actions.map((action) => attachCandidatesToAction(action, deposits, savings, opts));
}
