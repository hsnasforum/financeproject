import { resolveActionCatalogById } from "@/lib/planning/catalog/actionCatalog";
import type { PlanningRunRecord } from "@/lib/planning/store/types";

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

export type DashboardRunsLoadState = "loaded" | "failed";

export type DashboardCurrentProfile = {
  state: "loaded";
  id: string;
  name: string;
  updatedAt: string;
  monthlyIncomeKrw: number;
  monthlyExpensesKrw: number;
  monthlyDebtPaymentKrw: number;
  monthlySurplusKrw: number;
  totalDebtKrw: number;
  netWorthKrw: number;
} | { state: "missing" } | { state: "failed"; message: string };

export type DashboardCurrentPlan = {
  state: "current" | "unverified";
  run: DashboardRun;
} | {
  state: "stale";
  run: DashboardRun;
  rerunInput: PlanningRunRecord["input"];
} | { state: "missing" } | { state: "failed"; message: string };

export type DashboardInitialViewModel = {
  currentProfile: DashboardCurrentProfile;
  currentPlan: DashboardCurrentPlan;
  runs: DashboardRun[];
  runsLoadState: DashboardRunsLoadState;
  runsErrorMessage?: string;
};

export type DashboardDataSource = {
  id: string;
  label: string;
  priority: string;
  status?: {
    state?: string;
    message?: string;
  };
};

export type DashboardSourceStatus = {
  sourceId: string;
  kind: string;
  isFresh: boolean;
  counts: number;
  lastSyncedAt?: string | null;
};

export type DashboardFxItem = {
  currency: string;
  amount: number;
  rate: number | null;
  asOfDate: string | null;
  krw: number | null;
};

export type DashboardBenefit = {
  serviceId: string;
  title: string;
  summary: string;
  org: string;
};

export type DashboardCandidate = {
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

export type DashboardAction = {
  code: string;
  title: string;
  summary: string;
  steps: string[];
  href: string;
};

export type DashboardResourceLoadState = "loaded" | "partial" | "failed";

export type DashboardState = {
  runs: DashboardRun[];
  runsLoadState: DashboardRunsLoadState;
  runsErrorMessage?: string;
  dataSources: DashboardDataSource[];
  sourceStatuses: DashboardSourceStatus[];
  fxItems: DashboardFxItem[];
  exchangeAsOf: string;
  exchangeUsdRate: number | null;
  benefits: DashboardBenefit[];
  warnings: string[];
  resourceLoadState: DashboardResourceLoadState;
};

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  runs: [],
  runsLoadState: "loaded",
  dataSources: [],
  sourceStatuses: [],
  fxItems: [],
  exchangeAsOf: "",
  exchangeUsdRate: null,
  benefits: [],
  warnings: [],
  resourceLoadState: "loaded",
};

export const DASHBOARD_REQUEST_TIMEOUT_MS = 8_000;
export const DASHBOARD_REQUEST_TIMEOUT_MESSAGE = "응답 시간이 길어 이번 표시에서 제외했습니다.";
export const DASHBOARD_REQUEST_TIMEOUT_ERROR_NAME = "DashboardRequestTimeoutError";

type DashboardFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type DashboardFetchOptions = {
  fetchImpl?: DashboardFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function getDashboardResourceLoadCopy(loadState: DashboardResourceLoadState): {
  title: string;
  guidance: string;
} | null {
  if (loadState === "loaded") return null;
  if (loadState === "failed") {
    return {
      title: "대시보드 보조 정보를 불러오지 못했습니다.",
      guidance: "저장된 플랜은 그대로 사용할 수 있습니다. 잠시 뒤 새로고침하고, 계속되면 데이터 연결 설정을 확인해 주세요.",
    };
  }
  return {
    title: "일부 보조 정보를 불러오지 못했습니다.",
    guidance: "불러온 정보와 저장된 플랜은 계속 사용할 수 있습니다. 누락된 항목은 새로고침하거나 데이터 연결 설정에서 확인해 주세요.",
  };
}

export function isDashboardRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asDashboardString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asDashboardNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDashboardDateTime(value: string | null | undefined): string {
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

export function formatDashboardDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function formatDashboardKrw(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatDashboardPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

export function formatDashboardRunStatus(status: string | undefined): string {
  if (status === "SUCCESS") return "성공";
  if (status === "PARTIAL_SUCCESS") return "부분 성공";
  if (status === "FAILED") return "실패";
  if (status === "RUNNING") return "실행 중";
  return "저장됨";
}

export function truncateDashboardText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function parseDashboardDataSources(payload: unknown): DashboardDataSource[] {
  const rows = isDashboardRecord(payload) ? asArray(payload.data) : [];
  return rows
    .map((entry) => {
      const row = isDashboardRecord(entry) ? entry : {};
      const status = isDashboardRecord(row.status) ? row.status : {};
      return {
        id: asDashboardString(row.id),
        label: asDashboardString(row.label),
        priority: asDashboardString(row.priority),
        status: {
          state: asDashboardString(status.state),
          message: asDashboardString(status.message),
        },
      };
    })
    .filter((row) => row.id);
}

export function parseDashboardSourceStatuses(payload: unknown): DashboardSourceStatus[] {
  const rows = isDashboardRecord(payload) ? asArray(payload.data) : [];
  return rows
    .map((entry) => {
      const row = isDashboardRecord(entry) ? entry : {};
      return {
        sourceId: asDashboardString(row.sourceId),
        kind: asDashboardString(row.kind),
        isFresh: row.isFresh === true,
        counts: asDashboardNumber(row.counts) ?? 0,
        lastSyncedAt: asDashboardString(row.lastSyncedAt) || null,
      };
    })
    .filter((row) => row.sourceId && row.kind);
}

export function parseDashboardFxItems(payload: unknown): DashboardFxItem[] {
  const data = isDashboardRecord(payload) && isDashboardRecord(payload.data) ? payload.data : {};
  return asArray(data.items)
    .map((entry) => {
      const row = isDashboardRecord(entry) ? entry : {};
      return {
        currency: asDashboardString(row.currency),
        amount: asDashboardNumber(row.amount) ?? 0,
        rate: asDashboardNumber(row.rate),
        asOfDate: asDashboardString(row.asOfDate) || null,
        krw: asDashboardNumber(row.krw),
      };
    })
    .filter((row) => row.currency);
}

export function parseDashboardBenefits(payload: unknown): DashboardBenefit[] {
  const data = isDashboardRecord(payload) && isDashboardRecord(payload.data) ? payload.data : {};
  return asArray(data.items)
    .map((entry) => {
      const row = isDashboardRecord(entry) ? entry : {};
      return {
        serviceId: asDashboardString(row.serviceId),
        title: asDashboardString(row.title),
        summary: asDashboardString(row.summary),
        org: asDashboardString(row.org),
      };
    })
    .filter((row) => row.title);
}

function parseCandidates(actionsPayload: unknown): DashboardCandidate[] {
  const actions = isDashboardRecord(actionsPayload) ? asArray(actionsPayload.actions) : [];
  const rows: DashboardCandidate[] = [];

  actions.forEach((entry, actionIndex) => {
    const action = isDashboardRecord(entry) ? entry : {};
    const candidates = asArray(action.candidates);
    candidates.forEach((candidateEntry, candidateIndex) => {
      const candidate = isDashboardRecord(candidateEntry) ? candidateEntry : {};
      const providerName = asDashboardString(candidate.company);
      const productName = asDashboardString(candidate.name);
      rows.push({
        id: `${actionIndex}:${candidateIndex}:${providerName}:${productName}`,
        kind: asDashboardString(candidate.kind),
        providerName,
        productName,
        termMonths: asDashboardNumber(candidate.termMonths),
        rateMinPct: asDashboardNumber(candidate.rateMinPct),
        rateMaxPct: asDashboardNumber(candidate.rateMaxPct),
        notes: asArray(candidate.notes).map((item) => asDashboardString(item)).filter(Boolean),
        whyThis: asArray(candidate.whyThis).map((item) => asDashboardString(item)).filter(Boolean),
      });
    });
  });

  return rows.filter((row) => row.productName);
}

function parseActions(actionsPayload: unknown): DashboardAction[] {
  const actions = isDashboardRecord(actionsPayload) ? asArray(actionsPayload.actions) : [];
  return actions
    .map((entry) => {
      const action = isDashboardRecord(entry) ? entry : {};
      const code = asDashboardString(action.code);
      const catalog = resolveActionCatalogById(code);
      return {
        code,
        title: asDashboardString(action.title),
        summary: asDashboardString(action.summary),
        steps: asArray(action.steps).map((item) => asDashboardString(item)).filter(Boolean),
        href: catalog?.href ?? "/planning/reports",
      };
    })
    .filter((row) => row.title);
}

export function getDashboardRunSummary(run: DashboardRun | null): {
  endNetWorthKrw: number | null;
  worstCashKrw: number | null;
  topAction: string;
} {
  if (!run || !isDashboardRecord(run.outputs)) {
    return {
      endNetWorthKrw: null,
      worstCashKrw: null,
      topAction: "",
    };
  }

  const outputs = run.outputs;
  const resultDto = isDashboardRecord(outputs.resultDto) ? outputs.resultDto : {};
  const dtoSummary = isDashboardRecord(resultDto.summary) ? resultDto.summary : {};
  const simulate = isDashboardRecord(outputs.simulate) ? outputs.simulate : {};
  const simulateSummary = isDashboardRecord(simulate.summary) ? simulate.summary : {};
  const actions = isDashboardRecord(outputs.actions) ? outputs.actions : {};
  const actionRows = asArray(actions.actions);
  const firstAction = actionRows.find((entry) => isDashboardRecord(entry) && asDashboardString(entry.title));

  return {
    endNetWorthKrw: asDashboardNumber(dtoSummary.endNetWorthKrw) ?? asDashboardNumber(simulateSummary.endNetWorthKrw) ?? asDashboardNumber(simulateSummary.endNetWorth),
    worstCashKrw: asDashboardNumber(dtoSummary.worstCashKrw) ?? asDashboardNumber(simulateSummary.worstCashKrw),
    topAction: firstAction && isDashboardRecord(firstAction) ? asDashboardString(firstAction.title) : "",
  };
}

export function getDashboardRunCandidates(run: DashboardRun | null): DashboardCandidate[] {
  if (!run || !isDashboardRecord(run.outputs)) return [];
  const actions = isDashboardRecord(run.outputs.actions) ? run.outputs.actions : {};
  return parseCandidates(actions).slice(0, 4);
}

export function getDashboardRunActions(run: DashboardRun | null): DashboardAction[] {
  if (!run || !isDashboardRecord(run.outputs)) return [];
  const actions = isDashboardRecord(run.outputs.actions) ? run.outputs.actions : {};
  return parseActions(actions).slice(0, 3);
}

export async function fetchDashboardJson(
  url: string,
  options: DashboardFetchOptions = {},
): Promise<unknown> {
  const {
    fetchImpl = fetch,
    signal,
    timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();

  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const error = new Error(DASHBOARD_REQUEST_TIMEOUT_MESSAGE);
      error.name = DASHBOARD_REQUEST_TIMEOUT_ERROR_NAME;
      reject(error);
    }, timeoutMs);
  });
  const requestPromise = (async () => {
    const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isDashboardRecord(payload) || payload.ok !== true) {
      const message = isDashboardRecord(payload) && isDashboardRecord(payload.error)
        ? asDashboardString(payload.error.message)
        : "";
      throw new Error(message || `${url} 요청에 실패했습니다.`);
    }
    return payload;
  })();

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}
