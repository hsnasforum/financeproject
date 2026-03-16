"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { resolveActionCatalogById } from "@/lib/planning/catalog/actionCatalog";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";
import {
  reportHeroActionLinkClassName,
  reportHeroMetaChipClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";

export type DashboardRun = {
  id: string;
  profileId: string;
  title: string;
  createdAt: string;
  overallStatus?: string;
  input?: {
    horizonMonths?: number;
  };
  meta?: {
    snapshot?: {
      asOf?: string;
    };
  };
  outputs?: Record<string, unknown>;
};

type DashboardDataSource = {
  id: string;
  label: string;
  priority: string;
  status?: {
    state?: string;
    message?: string;
  };
};

type DashboardSourceStatus = {
  sourceId: string;
  kind: string;
  isFresh: boolean;
  counts: number;
  lastSyncedAt?: string | null;
};

type DashboardFxItem = {
  currency: string;
  amount: number;
  rate: number | null;
  asOfDate: string | null;
  krw: number | null;
};

type DashboardBenefit = {
  serviceId: string;
  title: string;
  summary: string;
  org: string;
};

type DashboardCandidate = {
  id: string;
  kind: string;
  providerName: string;
  productName: string;
  termMonths: number | null;
  rateMinPct: number | null;
  rateMaxPct: number | null;
  notes: string[];
  whyThis: string[];
};

type DashboardAction = {
  code: string;
  title: string;
  summary: string;
  steps: string[];
  href: string;
};

type DashboardFeedback = {
  id: string;
  category: string;
  message: string;
  createdAt: string;
};

type DashboardState = {
  runs: DashboardRun[];
  dataSources: DashboardDataSource[];
  sourceStatuses: DashboardSourceStatus[];
  fxItems: DashboardFxItem[];
  exchangeAsOf: string;
  exchangeUsdRate: number | null;
  benefits: DashboardBenefit[];
  feedback: DashboardFeedback[];
  warnings: string[];
};

const INITIAL_STATE: DashboardState = {
  runs: [],
  dataSources: [],
  sourceStatuses: [],
  fxItems: [],
  exchangeAsOf: "",
  exchangeUsdRate: null,
  benefits: [],
  feedback: [],
  warnings: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function formatKrw(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatRunStatus(status: string | undefined): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function parseDataSources(payload: unknown): DashboardDataSource[] {
  const rows = isRecord(payload) ? asArray(payload.data) : [];
  return rows
    .map((entry) => {
      const row = isRecord(entry) ? entry : {};
      const status = isRecord(row.status) ? row.status : {};
      return {
        id: asString(row.id),
        label: asString(row.label),
        priority: asString(row.priority),
        status: {
          state: asString(status.state),
          message: asString(status.message),
        },
      };
    })
    .filter((row) => row.id);
}

function parseSourceStatuses(payload: unknown): DashboardSourceStatus[] {
  const rows = isRecord(payload) ? asArray(payload.data) : [];
  return rows
    .map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return {
        sourceId: asString(row.sourceId),
        kind: asString(row.kind),
        isFresh: row.isFresh === true,
        counts: asNumber(row.counts) ?? 0,
        lastSyncedAt: asString(row.lastSyncedAt) || null,
      };
    })
    .filter((row) => row.sourceId && row.kind);
}

function parseFxItems(payload: unknown): DashboardFxItem[] {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  return asArray(data.items)
    .map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return {
        currency: asString(row.currency),
        amount: asNumber(row.amount) ?? 0,
        rate: asNumber(row.rate),
        asOfDate: asString(row.asOfDate) || null,
        krw: asNumber(row.krw),
      };
    })
    .filter((row) => row.currency);
}

function parseBenefits(payload: unknown): DashboardBenefit[] {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  return asArray(data.items)
    .map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return {
        serviceId: asString(row.serviceId),
        title: asString(row.title),
        summary: asString(row.summary),
        org: asString(row.org),
      };
    })
    .filter((row) => row.title);
}

function parseFeedback(payload: unknown): DashboardFeedback[] {
  const rows = isRecord(payload) ? asArray(payload.data) : [];
  return rows
    .map((entry) => {
      const row = isRecord(entry) ? entry : {};
      return {
        id: asString(row.id),
        category: asString(row.category),
        message: asString(row.message),
        createdAt: asString(row.createdAt),
      };
    })
    .filter((row) => row.id && row.message);
}

function parseCandidates(actionsPayload: unknown): DashboardCandidate[] {
  const actions = isRecord(actionsPayload) ? asArray(actionsPayload.actions) : [];
  const rows: DashboardCandidate[] = [];

  actions.forEach((entry, actionIndex) => {
    const action = isRecord(entry) ? entry : {};
    const candidates = asArray(action.candidates);
    candidates.forEach((candidateEntry, candidateIndex) => {
      const candidate = isRecord(candidateEntry) ? candidateEntry : {};
      const providerName = asString(candidate.company);
      const productName = asString(candidate.name);
      rows.push({
        id: `${actionIndex}:${candidateIndex}:${providerName}:${productName}`,
        kind: asString(candidate.kind),
        providerName,
        productName,
        termMonths: asNumber(candidate.termMonths),
        rateMinPct: asNumber(candidate.rateMinPct),
        rateMaxPct: asNumber(candidate.rateMaxPct),
        notes: asArray(candidate.notes).map((item) => asString(item)).filter(Boolean),
        whyThis: asArray(candidate.whyThis).map((item) => asString(item)).filter(Boolean),
      });
    });
  });

  return rows.filter((row) => row.productName);
}

function parseActions(actionsPayload: unknown): DashboardAction[] {
  const actions = isRecord(actionsPayload) ? asArray(actionsPayload.actions) : [];
  return actions
    .map((entry) => {
      const action = isRecord(entry) ? entry : {};
      const code = asString(action.code);
      const catalog = resolveActionCatalogById(code);
      return {
        code,
        title: asString(action.title),
        summary: asString(action.summary),
        steps: asArray(action.steps).map((item) => asString(item)).filter(Boolean),
        href: catalog?.href ?? "/planning/reports",
      };
    })
    .filter((row) => row.title);
}

function runSummary(run: DashboardRun | null): {
  monthlySurplusKrw: number | null;
  endNetWorthKrw: number | null;
  worstCashKrw: number | null;
  topAction: string;
} {
  if (!run || !isRecord(run.outputs)) {
    return {
      monthlySurplusKrw: null,
      endNetWorthKrw: null,
      worstCashKrw: null,
      topAction: "",
    };
  }

  const outputs = run.outputs;
  const resultDto = isRecord(outputs.resultDto) ? outputs.resultDto : {};
  const dtoSummary = isRecord(resultDto.summary) ? resultDto.summary : {};
  const simulate = isRecord(outputs.simulate) ? outputs.simulate : {};
  const simulateSummary = isRecord(simulate.summary) ? simulate.summary : {};
  const actions = isRecord(outputs.actions) ? outputs.actions : {};
  const actionRows = asArray(actions.actions);
  const firstAction = actionRows.find((entry) => isRecord(entry) && asString(entry.title));

  return {
    monthlySurplusKrw: asNumber(dtoSummary.monthlySurplusKrw) ?? asNumber(simulateSummary.monthlySurplusKrw),
    endNetWorthKrw: asNumber(dtoSummary.endNetWorthKrw) ?? asNumber(simulateSummary.endNetWorthKrw) ?? asNumber(simulateSummary.endNetWorth),
    worstCashKrw: asNumber(dtoSummary.worstCashKrw) ?? asNumber(simulateSummary.worstCashKrw),
    topAction: firstAction && isRecord(firstAction) ? asString(firstAction.title) : "",
  };
}

function runCandidates(run: DashboardRun | null): DashboardCandidate[] {
  if (!run || !isRecord(run.outputs)) return [];
  const actions = isRecord(run.outputs.actions) ? run.outputs.actions : {};
  return parseCandidates(actions).slice(0, 4);
}

function runActions(run: DashboardRun | null): DashboardAction[] {
  if (!run || !isRecord(run.outputs)) return [];
  const actions = isRecord(run.outputs.actions) ? run.outputs.actions : {};
  return parseActions(actions).slice(0, 3);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    const message = isRecord(payload) && isRecord(payload.error) ? asString(payload.error.message) : "";
    throw new Error(message || `${url} 요청에 실패했습니다.`);
  }
  return payload;
}

type DashboardClientProps = {
  initialRuns: DashboardRun[];
};

export function DashboardClient({ initialRuns }: DashboardClientProps) {
  const [state, setState] = useState<DashboardState>({
    ...INITIAL_STATE,
    runs: initialRuns,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard(): Promise<void> {
      setRefreshing(true);

      const nextState: DashboardState = {
        ...INITIAL_STATE,
        runs: initialRuns,
      };

      const results = await Promise.allSettled([
        fetchJson("/api/data-sources/status"),
        fetchJson("/api/sources/status"),
        fetchJson("/api/public/fx?pairs=USD:1000,JPY:100000,EUR:1000"),
        fetchJson("/api/public/exchange"),
        fetchJson("/api/public/benefits/search?limit=3&includeFacets=0"),
        fetchJson("/api/feedback/recent"),
      ]);

      const labels = [
        "데이터 연결",
        "상품 소스",
        "환율 계산",
        "기준 환율",
        "혜택 탐색",
        "최근 피드백",
      ];

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          nextState.warnings.push(`${labels[index]} 정보를 불러오지 못했습니다.`);
          return;
        }

        if (index === 0) nextState.dataSources = parseDataSources(result.value);
        if (index === 1) nextState.sourceStatuses = parseSourceStatuses(result.value);
        if (index === 2) nextState.fxItems = parseFxItems(result.value);
        if (index === 3) {
          const payload = isRecord(result.value) ? result.value : {};
          const data = isRecord(payload.data) ? payload.data : {};
          const rates = isRecord(data.rates) ? data.rates : {};
          nextState.exchangeAsOf = asString(data.asOf);
          nextState.exchangeUsdRate = asNumber(rates.USD);
        }
        if (index === 4) nextState.benefits = parseBenefits(result.value);
        if (index === 5) nextState.feedback = parseFeedback(result.value);
      });

      if (!cancelled) {
        setState(nextState);
        setLoading(false);
        setRefreshing(false);
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [initialRuns]);

  const latestRun = state.runs[0] ?? null;
  const latestSummary = useMemo(() => runSummary(latestRun), [latestRun]);
  const latestActions = useMemo(() => runActions(latestRun), [latestRun]);
  const latestCandidates = useMemo(() => runCandidates(latestRun), [latestRun]);
  const configuredP0 = useMemo(
    () => state.dataSources.filter((row) => row.priority === "P0" && row.status?.state === "configured").length,
    [state.dataSources],
  );
  const totalP0 = useMemo(
    () => state.dataSources.filter((row) => row.priority === "P0").length,
    [state.dataSources],
  );
  const freshSources = useMemo(
    () => state.sourceStatuses.filter((row) => row.isFresh).length,
    [state.sourceStatuses],
  );
  const usdPreview = useMemo(
    () => state.fxItems.find((item) => item.currency === "USD") ?? null,
    [state.fxItems],
  );
  const latestRunReportHref = latestRun ? `/planning/reports?runId=${encodeURIComponent(latestRun.id)}` : "/planning/reports";
  const latestRunPlanningHref = latestRun ? `/planning?profileId=${encodeURIComponent(latestRun.profileId)}` : "/planning";

  return (
    <PageShell>
      <div className="space-y-8" data-testid="dashboard-root">
        <ReportHeroCard
          kicker="Daily Brief"
          title={latestRun ? "최근 플랜에서 바로 이어서 확인합니다" : "내 금융 브리핑을 여기서 시작합니다"}
          description={latestRun
            ? `${latestRun.title || "최근 플랜"} 기준으로 월 잉여금, 말기 순자산, 실행 액션, 데이터 연결 상태를 같은 기준으로 이어봅니다.`
            : "플래닝 결과가 아직 없어도 데이터 연결 상태, 환율, 혜택 흐름을 먼저 확인하고 첫 실행으로 이어갈 수 있습니다."}
          action={(
            <>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                {refreshing ? "새로고침 중..." : "새로고침"}
              </button>
              <Link
                href={latestRun ? latestRunReportHref : "/planning"}
                prefetch={devPlanningPrefetch(latestRun ? latestRunReportHref : "/planning")}
                className="rounded-full bg-emerald-600 px-6 py-2 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 active:scale-95"
              >
                {latestRun ? "최근 리포트 보기" : "첫 플랜 시작"}
              </Link>
              <Link
                href={latestRunPlanningHref}
                prefetch={devPlanningPrefetch(latestRunPlanningHref)}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                다시 계산
              </Link>
              <Link
                href="/planning/runs"
                prefetch={devPlanningPrefetch("/planning/runs")}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                실행 기록
              </Link>
            </>
          )}
        >
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400">
            <p>
              최근 실행 {latestRun ? `${formatDateTime(latestRun.createdAt)} · ${formatRunStatus(latestRun.overallStatus)}` : "없음"}
            </p>
            <div className="h-1 w-1 rounded-full bg-slate-200" />
            <p className="text-emerald-600">
              다음 액션: {latestSummary.topAction || "리포트에서 우선 액션을 확인하세요."}
            </p>
          </div>
          <ReportHeroStatGrid className="xl:grid-cols-5">
            <ReportHeroStatCard
              label="저장된 실행"
              value={state.runs.length}
              description={latestRun ? `최근 실행 ${formatDateTime(latestRun.createdAt)}` : "기록 없음"}
            />
            <ReportHeroStatCard
              label="월 잉여금"
              value={formatKrw(latestSummary.monthlySurplusKrw)}
              description="최근 저장 요약"
            />
            <ReportHeroStatCard
              label="말기 순자산"
              value={formatKrw(latestSummary.endNetWorthKrw)}
              description="최근 저장 요약"
            />
            <ReportHeroStatCard
              label="P0 데이터 연결"
              value={`${configuredP0}/${totalP0 || 0}`}
              description={totalP0 > 0 && configuredP0 < totalP0 ? "보완 필요" : "기준 소스"}
            />
            <ReportHeroStatCard
              label="USD 1,000"
              value={usdPreview ? formatKrw(usdPreview.krw) : "-"}
              description={usdPreview?.asOfDate ? `${formatDate(usdPreview.asOfDate)}` : "데이터 대기"}
            />
          </ReportHeroStatGrid>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-slate-400">
              상품 소스 freshness {freshSources}/{state.sourceStatuses.length || 0}
            </span>
            <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-slate-400">
              최저 현금 {formatKrw(latestSummary.worstCashKrw)}
            </span>
            <Link href="/recommend" className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-emerald-600 hover:bg-emerald-100 transition-colors">
              추천 허브 →
            </Link>
          </div>
          {state.warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-100">
              <p className="font-semibold text-amber-200">일부 정보는 아직 준비되지 않았습니다.</p>
              <div className="mt-1 space-y-1">
                {state.warnings.slice(0, 4).map((message) => (
                  <p key={message}>- {message}</p>
                ))}
              </div>
            </div>
          ) : null}
        </ReportHeroCard>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-8 space-y-8">
            <SubSectionHeader
              title="최근 플랜"
              description="저장된 실행을 기준으로 결과를 다시 열고 비교합니다."
              action={
                <Link
                  href="/planning/runs"
                  prefetch={devPlanningPrefetch("/planning/runs")}
                  className="text-sm font-black text-emerald-600 hover:underline uppercase tracking-widest"
                >
                  View All →
                </Link>
              }
            />
            {loading && state.runs.length < 1 ? (
              <p className="text-sm text-slate-400 animate-pulse">최근 실행을 불러오는 중입니다.</p>
            ) : state.runs.length < 1 ? (
              <div className="rounded-[2.5rem] border border-dashed border-slate-200 bg-slate-50/50 px-5 py-16 text-center">
                <p className="text-sm font-black text-slate-900">저장된 실행이 아직 없습니다.</p>
                <p className="mt-2 text-xs text-slate-500 font-medium leading-relaxed">플래닝을 한 번 저장하면 이곳에서 리포트와 재실행으로 바로 이어집니다.</p>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                {state.runs.slice(0, 3).map((run) => {
                  const summary = runSummary(run);
                  return (
                    <div className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:border-emerald-100 hover:bg-white" key={run.id}>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{formatDate(run.createdAt)}</p>
                      <p className="mt-4 text-lg font-black tracking-tight text-slate-900">{truncate(run.title || "플래닝 실행", 24)}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatRunStatus(run.overallStatus)} · {run.input?.horizonMonths ?? "-"}개월</p>
                      <div className="mt-6 space-y-2 text-xs font-medium text-slate-600">
                        <p className="flex justify-between"><span>말기 순자산</span> <span className="font-black text-slate-900 tabular-nums">{formatKrw(summary.endNetWorthKrw)}</span></p>
                        <p className="flex justify-between"><span>최저 현금</span> <span className="font-black text-slate-900 tabular-nums">{formatKrw(summary.worstCashKrw)}</span></p>
                      </div>
                      <div className="mt-8 flex items-center gap-6">
                        <Link
                          className="text-xs font-black text-emerald-600 hover:underline uppercase tracking-widest"
                          href={`/planning/reports?runId=${encodeURIComponent(run.id)}`}
                          prefetch={devPlanningPrefetch("/planning/reports")}
                        >
                          Report →
                        </Link>
                        <Link
                          className="text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest"
                          href={`/planning?profileId=${encodeURIComponent(run.profileId)}`}
                          prefetch={devPlanningPrefetch("/planning")}
                        >
                          Re-run
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-8 space-y-8">
            <SubSectionHeader
              title="플랜 액션과 비교 후보"
              description="최근 실행에 저장된 액션과 후보 비교 정보를 다시 이어봅니다."
              action={
                <Link
                  href={latestRun ? latestRunReportHref : "/recommend"}
                  prefetch={devPlanningPrefetch(latestRun ? latestRunReportHref : "/recommend")}
                  className="text-sm font-black text-emerald-600 hover:underline uppercase tracking-widest"
                >
                  {latestRun ? "Action Hub →" : "Pick Hub →"}
                </Link>
              }
            />
            {latestRun && (latestActions.length > 0 || latestCandidates.length > 0) ? (
              <div className="space-y-6">
                {latestActions.length > 0 ? (
                  <div className="space-y-4">
                    {latestActions.map((action) => (
                      <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5 group hover:bg-white transition-all" key={action.code || action.title}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-900 group-hover:text-emerald-600 transition-colors">{action.title}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">{action.summary}</p>
                          </div>
                          <Link className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest" href={action.href}>Explore ▶</Link>
                        </div>
                        {action.steps.length > 0 ? (
                          <div className="mt-4 space-y-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {action.steps.slice(0, 2).map((step) => (
                              <p key={`${action.code}:${step}`} className="flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                {step}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {latestCandidates.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {latestCandidates.map((candidate) => (
                      <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm hover:border-emerald-100 transition-all" key={candidate.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 truncate">{candidate.productName}</p>
                            <p className="mt-1 text-[10px] font-black text-slate-400 uppercase tracking-[0.12em]">
                              {candidate.providerName} · {candidate.termMonths ? `${candidate.termMonths}개월` : "기간 미상"}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</p>
                            <p className="text-sm font-black text-emerald-600 tabular-nums">
                              {candidate.rateMaxPct && candidate.rateMaxPct > (candidate.rateMinPct ?? 0)
                                ? `${formatPct(candidate.rateMinPct)} ~ ${formatPct(candidate.rateMaxPct)}`
                                : formatPct(candidate.rateMinPct)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-4 text-[11px] font-medium leading-relaxed text-slate-500 italic">
                          {truncate(candidate.whyThis[0] || candidate.notes[0] || "상세 조건은 리포트에서 확인하세요.", 96)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[2.5rem] border border-dashed border-slate-200 bg-slate-50/50 px-5 py-16 text-center">
                <p className="text-sm font-black text-slate-900">저장된 액션과 후보가 없습니다.</p>
                <p className="mt-2 text-xs text-slate-500 font-medium leading-relaxed">먼저 플랜을 저장하거나 추천 허브에서 직접 비교를 시작할 수 있습니다.</p>
              </div>
            )}
          </Card>
        </section>

        <section className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-8 space-y-8">
            <SubSectionHeader
              title="혜택 바로보기"
              description="보조금24 탐색 API 기반 최근 후보"
              action={<Link href="/benefits" className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-[0.15em]">All Benefits →</Link>}
            />
            {state.benefits.length > 0 ? (
              <div className="space-y-4">
                {state.benefits.map((item) => (
                  <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5 group hover:bg-white transition-all" key={item.serviceId || item.title}>
                    <p className="text-sm font-black text-slate-900">{item.title}</p>
                    <p className="mt-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.org || "주관 기관 미상"}</p>
                    <p className="mt-4 text-[11px] font-medium leading-relaxed text-slate-500 line-clamp-2">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic py-10 text-center">혜택 정보를 불러오지 못했습니다.</p>
            )}
          </Card>

          <div className="grid gap-8">
            <Card className="p-8 space-y-8">
              <SubSectionHeader
                title="환율과 생활 도구"
                description="공식 환율 API와 계산 도구"
                action={<Link href="/tools/fx" className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-[0.15em]">FX Tool ▶</Link>}
              />
              <div className="grid gap-4 md:grid-cols-3">
                {state.fxItems.map((item) => (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5" key={item.currency}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.currency} {item.amount.toLocaleString("ko-KR")}</p>
                    <p className="mt-3 text-xl font-black text-slate-900 tabular-nums">{formatKrw(item.krw)}</p>
                    <p className="mt-1.5 text-[10px] font-bold text-slate-400">Rate: {typeof item.rate === "number" ? item.rate.toLocaleString("ko-KR") : "-"}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Market Standard</p>
                  <p className="text-sm font-black text-emerald-900">USD 1 = {state.exchangeUsdRate ? `${state.exchangeUsdRate.toLocaleString("ko-KR")}원` : "-"}</p>
                </div>
                <p className="text-[10px] font-bold text-emerald-600/50 tabular-nums">As of {state.exchangeAsOf || "-"}</p>
              </div>
            </Card>

            <Card className="p-8 space-y-8">
              <SubSectionHeader
                title="데이터 연결 상태"
                description="활용 중인 주요 데이터 소스 점검"
                action={<Link href="/settings/data-sources" className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-[0.15em]">Settings ▶</Link>}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Critical ENV</p>
                  <div className="space-y-2">
                    {state.dataSources.filter((row) => row.priority === "P0").map((row) => (
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4" key={row.id}>
                        <div>
                          <p className="text-xs font-black text-slate-900">{row.label}</p>
                          {row.status?.message ? <p className="mt-1 text-[10px] font-medium text-slate-400 truncate max-w-[120px]">{row.status.message}</p> : null}
                        </div>
                        <span className={cn(
                          "rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border",
                          row.status?.state === "configured" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {row.status?.state === "configured" ? "ACTIVE" : "CHECK"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Data Freshness</p>
                  <div className="space-y-2">
                    {state.sourceStatuses.map((row) => (
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4" key={`${row.sourceId}:${row.kind}`}>
                        <div>
                          <p className="text-xs font-black text-slate-900">{row.sourceId} · {row.kind}</p>
                          <p className="mt-1 text-[10px] font-bold text-slate-400 tabular-nums">{row.counts.toLocaleString("ko-KR")}건 · {formatDate(row.lastSyncedAt || "")}</p>
                        </div>
                        <span className={cn(
                          "rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border",
                          row.isFresh ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {row.isFresh ? "FRESH" : "SYNC"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-8 space-y-8">
            <SubSectionHeader
              title="바로 이동"
              description="현재 프로젝트의 핵심 기능 바로가기"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { href: "/planning", title: "플래닝", description: "흐름 기반 액션" },
                { href: "/planning/reports", title: "리포트", description: "공식 리포트" },
                { href: "/recommend", title: "추천 허브", description: "상품/혜택 비교" },
                { href: "/products/catalog", title: "상품 탐색", description: "금융 카탈로그" },
                { href: "/public/dart", title: "공시 탐색", description: "기업 공시 데이터" },
              ].map((item) => (
                <Link className="group rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:border-emerald-200 hover:bg-white" href={item.href} key={item.href}>
                  <p className="text-base font-black text-slate-900 group-hover:text-emerald-600 transition-colors">{item.title}</p>
                  <p className="mt-3 text-[11px] font-medium leading-relaxed text-slate-500">{item.description}</p>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-8 space-y-8">
            <SubSectionHeader
              title="최근 피드백"
              description="사용자 메모와 개선 요청 흐름"
              action={<Link href="/feedback/list" className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-[0.15em]">View Feed →</Link>}
            />
            {state.feedback.length > 0 ? (
              <div className="space-y-4">
                {state.feedback.slice(0, 4).map((item) => (
                  <Link className="block rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-5 transition-all hover:border-emerald-100 hover:bg-white group" href={`/feedback/${encodeURIComponent(item.id)}`} key={item.id}>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.category || "feedback"}</p>
                      <p className="text-[10px] font-bold text-slate-300 tabular-nums">{formatDate(item.createdAt)}</p>
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-700 line-clamp-2 leading-relaxed group-hover:text-slate-900 transition-colors">{truncate(item.message, 72)}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center rounded-[2rem] border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-300 italic">최근 피드백이 아직 없습니다.</p>
              </div>
            )}
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
