"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

const DEFAULT_PROFILE_JSON = `{
  "monthlyIncomeNet": 4200000,
  "monthlyEssentialExpenses": 1600000,
  "monthlyDiscretionaryExpenses": 700000,
  "liquidAssets": 1200000,
  "investmentAssets": 3500000,
  "debts": [
    { "id": "debt-card", "name": "Card Loan", "balance": 5200000, "minimumPayment": 230000, "aprPct": 16.0 }
  ],
  "goals": [
    { "id": "goal-home", "name": "Home Fund", "targetAmount": 12000000, "currentAmount": 1000000, "targetMonth": 36, "priority": 5, "minimumMonthlyContribution": 150000 },
    { "id": "goal-travel", "name": "Travel", "targetAmount": 2200000, "targetMonth": 12, "priority": 2, "minimumMonthlyContribution": 50000 }
  ],
  "risk": {
    "riskTolerance": "mid"
  }
}`;

const DEFAULT_OVERRIDES_JSON = `{
  "inflation": 2.0,
  "expectedReturn": 5.0
}`;

const DEFAULT_DEBT_OFFERS_JSON = `[
  { "liabilityId": "debt-card", "newAprPct": 11.5, "feeKrw": 120000, "title": "Refi Offer A" }
]`;

type SnapshotMeta = {
  asOf?: string;
  fetchedAt?: string;
  warningsCount?: number;
  sourcesCount?: number;
  missing?: boolean;
};

type TimelineRow = {
  month: number;
  netWorth: number;
  liquidAssets: number;
  investmentAssets: number;
  totalDebt: number;
  goalFundAssets: number;
};

type PlanResult = {
  timeline: TimelineRow[];
  warnings: Array<{ reasonCode: string; message: string; month?: number }>;
  goalStatus: Array<{
    goalId: string;
    name: string;
    achieved: boolean;
    achievedMonth: number | null;
    shortfall: number;
    progressPct: number;
  }>;
};

type SimulateApiPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string; issues?: string[] };
  meta?: {
    generatedAt?: string;
    snapshot?: SnapshotMeta;
  };
  data?: PlanResult;
};

type ScenarioSummary = {
  startNetWorth: number;
  endNetWorth: number;
  netWorthDelta: number;
  worstCashMonthIndex: number;
  worstCashKrw: number;
  goalsAchieved: number;
  warningsCount: number;
};

type ScenarioViewRow = {
  id: string;
  title: string;
  assumptionsUsed: {
    inflationPct: number;
    investReturnPct: number;
    cashReturnPct: number;
    withdrawalRatePct: number;
  };
  summary: ScenarioSummary;
  warnings: Array<{ reasonCode: string; message: string; month: number | null }>;
  goalsStatus: Array<{
    goalId: string;
    name: string;
    achieved: boolean;
    achievedMonth: number | null;
    shortfall: number;
    progressPct: number;
  }>;
  keyTimelinePoints: Array<{ monthIndex: number; row: TimelineRow }>;
  diffVsBase?: {
    keyMetrics?: {
      endNetWorthDeltaKrw?: number;
      worstCashMonthIndex?: number;
      worstCashDeltaKrw?: number;
      goalsAchievedDelta?: number;
    };
    warningsDelta?: { added: string[]; removed: string[] };
    shortWhy?: string[];
  };
};

type ScenariosApiPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string; issues?: string[] };
  meta?: {
    generatedAt?: string;
    snapshot?: SnapshotMeta;
  };
  data?: {
    base?: ScenarioViewRow;
    scenarios?: ScenarioViewRow[];
  };
};

type MonteCarloApiPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string; issues?: string[] };
  meta?: {
    generatedAt?: string;
    snapshot?: SnapshotMeta;
  };
  data?: {
    baseAssumptionsUsed?: {
      inflationPct?: number;
      investReturnPct?: number;
      cashReturnPct?: number;
      withdrawalRatePct?: number;
    };
    monteCarlo?: {
      meta?: { paths?: number; seed?: number };
      probabilities?: {
        emergencyAchievedByMonth?: number;
        lumpSumGoalAchieved?: Record<string, number>;
        retirementAchievedAtRetireAge?: number;
        retirementDepletionBeforeEnd?: number;
      };
      percentiles?: {
        endNetWorthKrw?: { p10?: number; p50?: number; p90?: number };
        worstCashKrw?: { p10?: number; p50?: number; p90?: number };
      };
      notes?: string[];
    };
  };
};

type ActionsApiPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string; issues?: string[] };
  meta?: {
    generatedAt?: string;
    snapshot?: SnapshotMeta;
  };
  data?: {
    planSummary?: {
      startNetWorthKrw?: number;
      endNetWorthKrw?: number;
      worstCashMonthIndex?: number;
      worstCashKrw?: number;
      warningsCount?: number;
      goalsMissedCount?: number;
    };
    actions?: Array<{
      code: string;
      severity: "info" | "warn" | "critical";
      title: string;
      summary: string;
      why: Array<{ code: string; message: string; data?: unknown }>;
      metrics: Record<string, number>;
      steps: string[];
      cautions: string[];
      candidates?: Array<{
        kind: "deposit" | "saving";
        finPrdtCd: string;
        company: string;
        name: string;
        termMonths?: number;
        rateMinPct?: number;
        rateMaxPct?: number;
        notes?: string[];
        whyThis?: string[];
      }>;
    }>;
  };
};

type DebtStrategyApiPayload = {
  ok?: boolean;
  error?: { code?: string; message?: string; issues?: string[] };
  meta?: { generatedAt?: string };
  data?: {
    meta?: { debtServiceRatio?: number; totalMonthlyPaymentKrw?: number };
    summaries?: Array<{
      liabilityId: string;
      name: string;
      type: "amortizing" | "interestOnly";
      principalKrw: number;
      aprPct: number;
      remainingMonths: number;
      monthlyPaymentKrw: number;
      monthlyInterestKrw: number;
      totalInterestRemainingKrw: number;
      payoffMonthIndex: number;
    }>;
    refinance?: Array<{
      liabilityId: string;
      offerTitle?: string;
      newAprPct: number;
      feeKrw: number;
      currentMonthlyPaymentKrw: number;
      newMonthlyPaymentKrw: number;
      monthlyPaymentDeltaKrw: number;
      interestSavingsKrw: number;
      breakEvenMonths?: number;
      notes: string[];
    }>;
    whatIf?: {
      termExtensions?: Array<{ liabilityId: string; newTermMonths: number; newMonthlyPaymentKrw: number; notes: string[] }>;
      termReductions?: Array<{ liabilityId: string; newTermMonths: number; newMonthlyPaymentKrw: number; notes: string[] }>;
      extraPayments?: Array<{ liabilityId: string; extraPaymentKrw: number; payoffMonthsReduced: number; interestSavingsKrw: number }>;
    };
    warnings?: Array<{ code: string; message: string; data?: unknown }>;
    cautions?: string[];
  };
};

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function pickTimelineRows(rows: TimelineRow[]): Array<{ monthIndex: number; row: TimelineRow }> {
  if (rows.length === 0) return [];
  const candidates = [0, 12, 24, rows.length - 1];
  const seen = new Set<number>();
  const picked: Array<{ monthIndex: number; row: TimelineRow }> = [];

  for (const index of candidates) {
    if (index < 0 || index >= rows.length || seen.has(index)) continue;
    seen.add(index);
    picked.push({ monthIndex: index, row: rows[index] });
  }

  return picked;
}

function parseInputs(profileJson: string, horizonMonths: string, overridesJson: string): {
  profile: unknown;
  horizonMonths: number;
  assumptions: unknown;
} | null {
  let parsedProfile: unknown;
  let parsedOverrides: unknown;

  try {
    parsedProfile = JSON.parse(profileJson);
  } catch {
    window.alert("프로필 JSON 파싱에 실패했습니다.");
    return null;
  }

  try {
    parsedOverrides = overridesJson.trim() ? JSON.parse(overridesJson) : {};
  } catch {
    window.alert("assumptions override JSON 파싱에 실패했습니다.");
    return null;
  }

  const parsedHorizon = Number.parseInt(horizonMonths, 10);
  if (!Number.isFinite(parsedHorizon)) {
    window.alert("horizonMonths는 숫자여야 합니다.");
    return null;
  }

  return {
    profile: parsedProfile,
    horizonMonths: parsedHorizon,
    assumptions: parsedOverrides,
  };
}

export default function DebugPlanningV2Client() {
  const [profileJson, setProfileJson] = useState(DEFAULT_PROFILE_JSON);
  const [horizonMonths, setHorizonMonths] = useState("36");
  const [overridesJson, setOverridesJson] = useState(DEFAULT_OVERRIDES_JSON);
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [monteCarloLoading, setMonteCarloLoading] = useState(false);
  const [monteCarloPaths, setMonteCarloPaths] = useState("2000");
  const [monteCarloSeed, setMonteCarloSeed] = useState("12345");
  const [response, setResponse] = useState<SimulateApiPayload | null>(null);
  const [scenariosResponse, setScenariosResponse] = useState<ScenariosApiPayload | null>(null);
  const [monteCarloResponse, setMonteCarloResponse] = useState<MonteCarloApiPayload | null>(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actionsIncludeProducts, setActionsIncludeProducts] = useState(false);
  const [actionsMaxCandidates, setActionsMaxCandidates] = useState("5");
  const [actionsResponse, setActionsResponse] = useState<ActionsApiPayload | null>(null);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtExtraPaymentKrw, setDebtExtraPaymentKrw] = useState("0");
  const [debtOffersJson, setDebtOffersJson] = useState(DEFAULT_DEBT_OFFERS_JSON);
  const [debtResponse, setDebtResponse] = useState<DebtStrategyApiPayload | null>(null);

  useEffect(() => {
    const suppressPerfTimestampError = (event: ErrorEvent) => {
      const message = String(event?.message ?? "");
      if (
        message.includes("cannot have a negative time stamp")
        && message.includes("DebugPlanningV2Page")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", suppressPerfTimestampError);
    return () => {
      window.removeEventListener("error", suppressPerfTimestampError);
    };
  }, []);

  const timelineSample = useMemo(
    () => pickTimelineRows(response?.data?.timeline ?? []),
    [response?.data?.timeline],
  );

  const summary = useMemo(() => {
    const rows = response?.data?.timeline ?? [];
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (!first || !last) return null;
    return {
      months: rows.length,
      firstNetWorth: first.netWorth,
      lastNetWorth: last.netWorth,
      netWorthDelta: Math.round((last.netWorth - first.netWorth) * 100) / 100,
    };
  }, [response?.data?.timeline]);

  const scenarioRows = useMemo(() => {
    const base = scenariosResponse?.data?.base;
    const scenarios = scenariosResponse?.data?.scenarios ?? [];
    if (!base) return [];
    return [base, ...scenarios];
  }, [scenariosResponse?.data?.base, scenariosResponse?.data?.scenarios]);

  async function runSimulation(): Promise<void> {
    const parsed = parseInputs(profileJson, horizonMonths, overridesJson);
    if (!parsed) return;

    setLoading(true);
    try {
      const res = await fetch("/api/planning/v2/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf(parsed)),
      });

      const payload = (await res.json().catch(() => null)) as SimulateApiPayload | null;
      if (!payload || typeof payload !== "object") {
        setResponse(null);
        window.alert("응답 파싱에 실패했습니다.");
        return;
      }

      setResponse(payload);

      if (!res.ok || !payload.ok) {
        window.alert(payload.error?.message ?? "시뮬레이션 실패");
        return;
      }

      window.alert("시뮬레이션을 완료했습니다.");
    } catch (error) {
      setResponse(null);
      window.alert(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function runScenarios(): Promise<void> {
    const parsed = parseInputs(profileJson, horizonMonths, overridesJson);
    if (!parsed) return;

    setScenarioLoading(true);
    try {
      const res = await fetch("/api/planning/v2/scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf(parsed)),
      });

      const payload = (await res.json().catch(() => null)) as ScenariosApiPayload | null;
      if (!payload || typeof payload !== "object") {
        setScenariosResponse(null);
        window.alert("시나리오 응답 파싱에 실패했습니다.");
        return;
      }

      setScenariosResponse(payload);

      if (!res.ok || !payload.ok) {
        window.alert(payload.error?.message ?? "시나리오 실행 실패");
        return;
      }

      window.alert("시나리오 실행을 완료했습니다.");
    } catch (error) {
      setScenariosResponse(null);
      window.alert(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setScenarioLoading(false);
    }
  }

  async function runMonteCarlo(): Promise<void> {
    const parsed = parseInputs(profileJson, horizonMonths, overridesJson);
    if (!parsed) return;

    const paths = Number.parseInt(monteCarloPaths, 10);
    const seed = Number.parseInt(monteCarloSeed, 10);
    if (!Number.isFinite(paths) || paths < 1) {
      window.alert("paths는 1 이상의 숫자여야 합니다.");
      return;
    }
    if (!Number.isFinite(seed)) {
      window.alert("seed는 숫자여야 합니다.");
      return;
    }

    setMonteCarloLoading(true);
    try {
      const res = await fetch("/api/planning/v2/monte-carlo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          ...parsed,
          monteCarlo: {
            paths,
            seed,
          },
        })),
      });

      const payload = (await res.json().catch(() => null)) as MonteCarloApiPayload | null;
      if (!payload || typeof payload !== "object") {
        setMonteCarloResponse(null);
        window.alert("Monte Carlo 응답 파싱에 실패했습니다.");
        return;
      }

      setMonteCarloResponse(payload);

      if (!res.ok || !payload.ok) {
        window.alert(payload.error?.message ?? "Monte Carlo 실행 실패");
        return;
      }

      window.alert("Monte Carlo 실행을 완료했습니다.");
    } catch (error) {
      setMonteCarloResponse(null);
      window.alert(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setMonteCarloLoading(false);
    }
  }

  async function runActions(): Promise<void> {
    const parsed = parseInputs(profileJson, horizonMonths, overridesJson);
    if (!parsed) return;

    const maxCandidates = Number.parseInt(actionsMaxCandidates, 10);
    if (!Number.isFinite(maxCandidates) || maxCandidates < 1 || maxCandidates > 20) {
      window.alert("maxCandidatesPerAction은 1~20 범위여야 합니다.");
      return;
    }

    setActionsLoading(true);
    try {
      const res = await fetch("/api/planning/v2/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          ...parsed,
          includeProducts: actionsIncludeProducts,
          maxCandidatesPerAction: maxCandidates,
        })),
      });

      const payload = (await res.json().catch(() => null)) as ActionsApiPayload | null;
      if (!payload || typeof payload !== "object") {
        setActionsResponse(null);
        window.alert("Actions 응답 파싱에 실패했습니다.");
        return;
      }

      setActionsResponse(payload);

      if (!res.ok || !payload.ok) {
        window.alert(payload.error?.message ?? "Actions 생성 실패");
        return;
      }

      window.alert("Action plan 생성을 완료했습니다.");
    } catch (error) {
      setActionsResponse(null);
      window.alert(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setActionsLoading(false);
    }
  }

  async function runDebtAnalysis(): Promise<void> {
    const parsed = parseInputs(profileJson, horizonMonths, overridesJson);
    if (!parsed) return;

    let offers: unknown = [];
    if (debtOffersJson.trim().length > 0) {
      try {
        offers = JSON.parse(debtOffersJson);
      } catch {
        window.alert("Debt offers JSON 파싱에 실패했습니다.");
        return;
      }
    }

    const extraPaymentKrw = Number.parseInt(debtExtraPaymentKrw, 10);
    if (!Number.isFinite(extraPaymentKrw) || extraPaymentKrw < 0) {
      window.alert("extraPaymentKrw는 0 이상의 숫자여야 합니다.");
      return;
    }

    setDebtLoading(true);
    try {
      const res = await fetch("/api/planning/v2/debt-strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          profile: parsed.profile,
          offers,
          options: {
            extraPaymentKrw,
          },
        })),
      });

      const payload = (await res.json().catch(() => null)) as DebtStrategyApiPayload | null;
      if (!payload || typeof payload !== "object") {
        setDebtResponse(null);
        window.alert("Debt strategy 응답 파싱에 실패했습니다.");
        return;
      }

      setDebtResponse(payload);

      if (!res.ok || !payload.ok) {
        window.alert(payload.error?.message ?? "Debt strategy 분석 실패");
        return;
      }

      window.alert("Debt strategy 분석을 완료했습니다.");
    } catch (error) {
      setDebtResponse(null);
      window.alert(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setDebtLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Planning v2 Debug"
        description="프로필/가정 JSON으로 단일 결과와 시나리오 비교 결과를 확인합니다."
      />

      <Card className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-slate-800">Profile JSON</span>
            <textarea
              className="h-72 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs"
              value={profileJson}
              onChange={(event) => setProfileJson(event.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="space-y-4">
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-slate-800">Assumptions Override JSON (optional)</span>
              <textarea
                className="h-44 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs"
                value={overridesJson}
                onChange={(event) => setOverridesJson(event.target.value)}
                spellCheck={false}
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold text-slate-800">Horizon Months</span>
              <input
                type="number"
                min={1}
                step={1}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                value={horizonMonths}
                onChange={(event) => setHorizonMonths(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runSimulation()} disabled={loading || scenarioLoading || monteCarloLoading || actionsLoading || debtLoading}>
                {loading ? "Running..." : "Run simulation"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void runScenarios()} disabled={loading || scenarioLoading || monteCarloLoading || actionsLoading || debtLoading}>
                {scenarioLoading ? "Running..." : "Run scenarios"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void runMonteCarlo()} disabled={loading || scenarioLoading || monteCarloLoading || actionsLoading || debtLoading}>
                {monteCarloLoading ? "Running..." : "Run Monte Carlo"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void runActions()} disabled={loading || scenarioLoading || monteCarloLoading || actionsLoading || debtLoading}>
                {actionsLoading ? "Running..." : "Get actions"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void runDebtAnalysis()} disabled={loading || scenarioLoading || monteCarloLoading || actionsLoading || debtLoading}>
                {debtLoading ? "Running..." : "Analyze debt"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-800">Monte Carlo Paths</span>
                <input
                  type="number"
                  min={1}
                  max={20000}
                  step={1}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={monteCarloPaths}
                  onChange={(event) => setMonteCarloPaths(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-800">Monte Carlo Seed</span>
                <input
                  type="number"
                  step={1}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={monteCarloSeed}
                  onChange={(event) => setMonteCarloSeed(event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={actionsIncludeProducts}
                  onChange={(event) => setActionsIncludeProducts(event.target.checked)}
                />
                includeProducts (finlife 후보 포함)
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-800">maxCandidatesPerAction</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={actionsMaxCandidates}
                  onChange={(event) => setActionsMaxCandidates(event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-slate-800">Debt extraPaymentKrw</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  value={debtExtraPaymentKrw}
                  onChange={(event) => setDebtExtraPaymentKrw(event.target.value)}
                />
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-semibold text-slate-800">Debt Offers JSON (optional)</span>
              <textarea
                className="h-28 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs"
                value={debtOffersJson}
                onChange={(event) => setDebtOffersJson(event.target.value)}
                spellCheck={false}
              />
            </label>
          </div>
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <h2 className="text-base font-black text-slate-900">Single Result</h2>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            generatedAt: <span className="font-semibold">{formatDateTime(response?.meta?.generatedAt)}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot missing: <span className="font-semibold">{response?.meta?.snapshot?.missing ? "true" : "false"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot asOf: <span className="font-semibold">{response?.meta?.snapshot?.asOf ?? "-"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot fetchedAt: <span className="font-semibold">{formatDateTime(response?.meta?.snapshot?.fetchedAt)}</span>
          </div>
        </div>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            warningsCount: <span className="font-semibold">{response?.meta?.snapshot?.warningsCount ?? 0}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            sourcesCount: <span className="font-semibold">{response?.meta?.snapshot?.sourcesCount ?? 0}</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Summary</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(summary ?? {})}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Warnings</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText((response?.data?.warnings ?? []).map((warning) => ({
              reasonCode: warning.reasonCode,
              month: warning.month ?? null,
              message: warning.message,
            })))}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Goals</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(response?.data?.goalStatus ?? [])}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Timeline Sample (0 / 12 / 24 / last)</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(timelineSample)}
          </pre>
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <h2 className="text-base font-black text-slate-900">Scenario Comparison</h2>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            generatedAt: <span className="font-semibold">{formatDateTime(scenariosResponse?.meta?.generatedAt)}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot asOf: <span className="font-semibold">{scenariosResponse?.meta?.snapshot?.asOf ?? "-"}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Scenario</th>
                <th className="px-3 py-2 text-left font-semibold">End NetWorth</th>
                <th className="px-3 py-2 text-left font-semibold">Worst Cash</th>
                <th className="px-3 py-2 text-left font-semibold">Goals Achieved</th>
                <th className="px-3 py-2 text-left font-semibold">Warnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {scenarioRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.title}</td>
                  <td className="px-3 py-2">{formatMoney(row.summary.endNetWorth)}</td>
                  <td className="px-3 py-2">M{row.summary.worstCashMonthIndex} / {formatMoney(row.summary.worstCashKrw)}</td>
                  <td className="px-3 py-2">{row.summary.goalsAchieved}</td>
                  <td className="px-3 py-2">{row.summary.warningsCount}</td>
                </tr>
              ))}
              {scenarioRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={5}>시나리오 결과가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          {(scenariosResponse?.data?.scenarios ?? []).map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-sm font-black text-slate-900">{row.title} why diff</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {(row.diffVsBase?.shortWhy ?? []).map((line, index) => (
                  <li key={`${row.id}-why-${index}`}>- {line}</li>
                ))}
              </ul>
              <pre className="mt-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs">
                {toJsonText({
                  assumptionsUsed: row.assumptionsUsed,
                  diffVsBase: row.diffVsBase,
                  keyTimelinePoints: row.keyTimelinePoints,
                })}
              </pre>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <h2 className="text-base font-black text-slate-900">Monte Carlo</h2>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            generatedAt: <span className="font-semibold">{formatDateTime(monteCarloResponse?.meta?.generatedAt)}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot asOf: <span className="font-semibold">{monteCarloResponse?.meta?.snapshot?.asOf ?? "-"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            paths: <span className="font-semibold">{monteCarloResponse?.data?.monteCarlo?.meta?.paths ?? "-"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            seed: <span className="font-semibold">{monteCarloResponse?.data?.monteCarlo?.meta?.seed ?? "-"}</span>
          </div>
        </div>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            retirementDepletionBeforeEnd: <span className="font-semibold">{monteCarloResponse?.data?.monteCarlo?.probabilities?.retirementDepletionBeforeEnd ?? "-"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            retirementAchievedAtRetireAge: <span className="font-semibold">{monteCarloResponse?.data?.monteCarlo?.probabilities?.retirementAchievedAtRetireAge ?? "-"}</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Goal Probabilities</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText({
              emergencyAchievedByMonth: monteCarloResponse?.data?.monteCarlo?.probabilities?.emergencyAchievedByMonth ?? null,
              lumpSumGoalAchieved: monteCarloResponse?.data?.monteCarlo?.probabilities?.lumpSumGoalAchieved ?? {},
            })}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Percentiles</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText({
              endNetWorthKrw: monteCarloResponse?.data?.monteCarlo?.percentiles?.endNetWorthKrw ?? {},
              worstCashKrw: monteCarloResponse?.data?.monteCarlo?.percentiles?.worstCashKrw ?? {},
            })}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Notes</h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {(monteCarloResponse?.data?.monteCarlo?.notes ?? []).map((line, index) => (
              <li key={`mc-note-${index}`}>- {line}</li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <h2 className="text-base font-black text-slate-900">Action Plan</h2>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            generatedAt: <span className="font-semibold">{formatDateTime(actionsResponse?.meta?.generatedAt)}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            snapshot asOf: <span className="font-semibold">{actionsResponse?.meta?.snapshot?.asOf ?? "-"}</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Plan Summary</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(actionsResponse?.data?.planSummary ?? {})}
          </pre>
        </div>

        <div className="space-y-4">
          {(actionsResponse?.data?.actions ?? []).map((action, index) => (
            <div key={`${action.code}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{action.severity}</span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">{action.code}</span>
                <h3 className="text-sm font-black text-slate-900">{action.title}</h3>
              </div>
              <p className="mt-2 text-xs text-slate-700">{action.summary}</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-slate-700">why</p>
                  <pre className="mt-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    {toJsonText(action.why)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">metrics</p>
                  <pre className="mt-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    {toJsonText(action.metrics)}
                  </pre>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs font-bold text-slate-700">steps</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                  {action.steps.map((step, stepIndex) => (
                    <li key={`${action.code}-step-${stepIndex}`}>- {step}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <p className="text-xs font-bold text-slate-700">cautions</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                  {action.cautions.map((item, cautionIndex) => (
                    <li key={`${action.code}-caution-${cautionIndex}`}>- {item}</li>
                  ))}
                </ul>
              </div>

              {Array.isArray(action.candidates) && action.candidates.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1 text-left font-semibold">Kind</th>
                        <th className="px-2 py-1 text-left font-semibold">Company</th>
                        <th className="px-2 py-1 text-left font-semibold">Product</th>
                        <th className="px-2 py-1 text-left font-semibold">Term</th>
                        <th className="px-2 py-1 text-left font-semibold">Rate Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {action.candidates.map((candidate) => (
                        <tr key={`${action.code}-${candidate.kind}-${candidate.finPrdtCd}`}>
                          <td className="px-2 py-1">{candidate.kind}</td>
                          <td className="px-2 py-1">{candidate.company}</td>
                          <td className="px-2 py-1">{candidate.name}</td>
                          <td className="px-2 py-1">{candidate.termMonths ?? "-"}</td>
                          <td className="px-2 py-1">
                            {candidate.rateMinPct ?? "-"} ~ {candidate.rateMaxPct ?? "-"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))}
          {(actionsResponse?.data?.actions ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">Action 결과가 없습니다.</p>
          ) : null}
        </div>
      </Card>

      <Card className="mt-5 space-y-5">
        <h2 className="text-base font-black text-slate-900">Debt Strategy</h2>

        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            generatedAt: <span className="font-semibold">{formatDateTime(debtResponse?.meta?.generatedAt)}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            debtServiceRatio: <span className="font-semibold">{debtResponse?.data?.meta?.debtServiceRatio ?? "-"}</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            totalMonthlyPayment: <span className="font-semibold">{formatMoney(debtResponse?.data?.meta?.totalMonthlyPaymentKrw)}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Debt</th>
                <th className="px-2 py-1 text-left font-semibold">Type</th>
                <th className="px-2 py-1 text-left font-semibold">APR</th>
                <th className="px-2 py-1 text-left font-semibold">Remain(M)</th>
                <th className="px-2 py-1 text-left font-semibold">Monthly</th>
                <th className="px-2 py-1 text-left font-semibold">Total Interest</th>
                <th className="px-2 py-1 text-left font-semibold">Payoff Month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {(debtResponse?.data?.summaries ?? []).map((summary) => (
                <tr key={summary.liabilityId}>
                  <td className="px-2 py-1">{summary.name}</td>
                  <td className="px-2 py-1">{summary.type}</td>
                  <td className="px-2 py-1">{summary.aprPct}%</td>
                  <td className="px-2 py-1">{summary.remainingMonths}</td>
                  <td className="px-2 py-1">{formatMoney(summary.monthlyPaymentKrw)}</td>
                  <td className="px-2 py-1">{formatMoney(summary.totalInterestRemainingKrw)}</td>
                  <td className="px-2 py-1">{summary.payoffMonthIndex}</td>
                </tr>
              ))}
              {(debtResponse?.data?.summaries ?? []).length === 0 ? (
                <tr>
                  <td className="px-2 py-2 text-slate-500" colSpan={7}>부채 요약 결과가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Refinance</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(debtResponse?.data?.refinance ?? [])}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">What-if</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(debtResponse?.data?.whatIf ?? {})}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-900">Warnings</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            {toJsonText(debtResponse?.data?.warnings ?? [])}
          </pre>
        </div>
      </Card>
    </PageShell>
  );
}
