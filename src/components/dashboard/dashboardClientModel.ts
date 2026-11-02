import { resolveActionCatalogById } from "@/lib/planning/catalog/actionCatalog";
import type { PlanningRunRecord } from "@/lib/planning/store/types";
import { buildFxDataStatus, type FxResponseMeta } from "@/lib/publicApis/fxDataStatus";

export type DashboardRun = {
  id: string;
  profileId: string;
  // Display text resolved from the authenticated profile list; the id stays only in links.
  profileLabel?: string;
  // True only when the run's profile is in the authenticated profile list loaded for this page.
  profileLinked?: boolean;
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
  // "selected" when shown through /dashboard?profileId=; the stored default is unchanged either way.
  source?: "default" | "selected";
  monthlyIncomeKrw: number;
  monthlyExpensesKrw: number;
  monthlyDebtPaymentKrw: number;
  monthlySurplusKrw: number;
  totalDebtKrw: number;
  netWorthKrw: number;
  // id is set only when an explicit selection resolved to a profile without input (the untouched seed),
  // so planning links keep that profile instead of whatever the default is.
} | { state: "missing"; id?: string }
  | { state: "failed"; message: string }
  // The default is the untouched empty seed while other saved profiles exist.
  | { state: "selection-required" }
  // An explicit selection that is malformed, repeated, deleted or outside the current user.
  | { state: "selection-invalid"; message: string };

export type DashboardProfileOption = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type DashboardProfileSelection = {
  options: DashboardProfileOption[];
  selectedProfileId: string;
};

export const DASHBOARD_UNNAMED_PROFILE_LABEL = "이름 없는 프로필";
export const DASHBOARD_UNKNOWN_PROFILE_LABEL = "연결된 프로필을 확인할 수 없습니다";

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
  profileSelection?: DashboardProfileSelection;
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

export type DashboardFxState = "live" | "cache" | "mock" | "unavailable" | "setup-required" | "failed";

export type DashboardFxStatus = {
  state: DashboardFxState;
  label: string;
  sourceLabel: string;
  asOf: string | null;
  freshnessLabel: string;
  isStale: boolean;
  isExample: boolean;
  setupRequired: boolean;
  notice: string;
};

export type DashboardFx = {
  state: DashboardFxState;
  items: DashboardFxItem[];
  status: DashboardFxStatus;
};

export type DashboardExchange = {
  state: "live" | "cache" | "degraded-cache" | "unavailable" | "setup-required" | "failed";
  usdRate: number | null;
  asOf: string | null;
  sourceLabel: string;
  label: string;
  notice: string;
  nextRetryAt: string | null;
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
  fx: DashboardFx | null;
  exchange: DashboardExchange | null;
  benefits: DashboardBenefit[];
  warnings: string[];
  resourceLoadState: DashboardResourceLoadState;
};

export const INITIAL_DASHBOARD_STATE: DashboardState = {
  runs: [],
  runsLoadState: "loaded",
  dataSources: [],
  sourceStatuses: [],
  fx: null,
  exchange: null,
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

const DASHBOARD_FX_EXAMPLE_SOURCE_LABEL = "예시 데이터(실제 조회값 아님)";
const DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL = "출처 확인 필요";

// Public API setup failures use ENV_* / CONFIG* codes (see publicApis/errorContract).
function isDashboardSetupErrorCode(code: string): boolean {
  return code.startsWith("ENV_") || code.startsWith("CONFIG");
}

function readDashboardErrorCode(error: unknown): string {
  return isDashboardRecord(error) ? asDashboardString(error.code) : "";
}

function isDashboardTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === DASHBOARD_REQUEST_TIMEOUT_ERROR_NAME;
}

export function parseDashboardFx(payload: unknown, now: Date = new Date()): DashboardFx {
  const items = parseDashboardFxItems(payload);
  const meta = isDashboardRecord(payload) && isDashboardRecord(payload.meta) ? payload.meta : {};
  const provenance = isDashboardRecord(meta.provenance) ? meta.provenance : {};
  const base = buildFxDataStatus({ rowCount: items.length, meta: meta as FxResponseMeta, now });
  const setupRequired = base.mode === "mock" && asDashboardString(provenance.degradedReason) === "env-missing";
  const source = asDashboardString(provenance.source);
  const provenanceMode = asDashboardString(provenance.mode).toLowerCase();
  // The shared status also treats any cache hit as cache. Real-looking numbers additionally
  // need an explicit live/cache provenance and a named source on the dashboard.
  const unverified = (base.mode === "live" || base.mode === "cache")
    && (!source || (provenanceMode !== "live" && provenanceMode !== "cache"));
  const state = unverified ? "unavailable" : base.mode;
  const sourceLabel = state === "mock"
    ? DASHBOARD_FX_EXAMPLE_SOURCE_LABEL
    : state === "unavailable" || !source ? DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL : source;
  const notice = state === "mock"
    ? setupRequired
      ? "환율 연결이 설정되지 않아 예시 환율로 계산했습니다. 실제 환율이 아닙니다. 데이터 연결 설정에서 상태를 확인해 주세요."
      : "실제 환율을 조회하지 못해 예시 환율로 대신 계산했습니다. 실제 환율이 아닙니다. 잠시 뒤 새로고침하거나 데이터 연결 설정을 확인해 주세요."
    : unverified
      ? "환율의 출처나 조회 방식을 확인하지 못해 숫자를 표시하지 않습니다. 데이터 연결 설정에서 상태를 확인해 주세요."
      : base.notice;
  return {
    state,
    items,
    status: {
      state,
      label: unverified ? DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL : base.label,
      sourceLabel,
      asOf: base.asOf,
      freshnessLabel: base.freshnessLabel,
      isStale: base.isStale,
      isExample: state === "mock",
      setupRequired,
      notice,
    },
  };
}

export function describeDashboardFxFailure(error: unknown): DashboardFx {
  const setupRequired = isDashboardSetupErrorCode(readDashboardErrorCode(error));
  const state = setupRequired ? "setup-required" : "failed";
  return {
    state,
    items: [],
    status: {
      state,
      label: setupRequired ? "환율 연결 설정 필요" : "환율 조회 실패",
      sourceLabel: DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL,
      asOf: null,
      freshnessLabel: "기준 시점 확인 필요",
      isStale: true,
      isExample: false,
      setupRequired,
      notice: setupRequired
        ? "환율 연결이 설정되지 않아 환율을 표시하지 않습니다. 데이터 연결 설정에서 상태를 확인해 주세요."
        : isDashboardTimeout(error)
          ? `환율 ${DASHBOARD_REQUEST_TIMEOUT_MESSAGE} 잠시 뒤 새로고침해 주세요.`
          : "환율을 불러오지 못해 표시하지 않습니다. 잠시 뒤 새로고침해 주세요.",
    },
  };
}

export function parseDashboardExchange(payload: unknown): DashboardExchange {
  const data = isDashboardRecord(payload) && isDashboardRecord(payload.data) ? payload.data : {};
  const meta = isDashboardRecord(payload) && isDashboardRecord(payload.meta) ? payload.meta : {};
  const fallback = isDashboardRecord(meta.fallback) ? meta.fallback : {};
  const rates = isDashboardRecord(data.rates) ? data.rates : {};
  const rawMeta = isDashboardRecord(data.rawMeta) ? data.rawMeta : {};
  const usdRate = asDashboardNumber(rates.USD);
  const asOf = asDashboardString(data.asOf) || null;
  const fromExim = asDashboardString(rawMeta.source) === "EXIM";
  const fallbackMode = asDashboardString(fallback.mode).toUpperCase();
  const fallbackReason = asDashboardString(fallback.reason);
  const cached = asDashboardString(meta.cache).toLowerCase() === "hit" || fallbackMode === "CACHE";
  if (usdRate === null || !asOf || !fromExim) {
    return {
      state: "unavailable",
      usdRate: null,
      asOf,
      sourceLabel: DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL,
      label: "출처 확인 필요",
      notice: "시장 기준 환율의 값이나 출처·기준일을 확인하지 못해 표시하지 않습니다.",
      nextRetryAt: null,
    };
  }
  // exchange route: live_failed_cache_hit / cooldown_cache_hit serve an older cached response.
  const liveFailed = fallbackReason === "live_failed_cache_hit";
  const coolingDown = fallbackReason === "cooldown_cache_hit";
  if (liveFailed || coolingDown) {
    const nextRetryAt = asDashboardString(fallback.nextRetryAt) || null;
    const retryText = nextRetryAt ? ` 다음 조회 가능 시각 ${formatDashboardDateTime(nextRetryAt)}.` : "";
    return {
      state: "degraded-cache",
      usdRate,
      asOf,
      sourceLabel: "한국수출입은행",
      label: liveFailed ? "최신 조회 실패 · 저장된 응답 표시" : "조회 재시도 대기 · 저장된 응답 표시",
      notice: liveFailed
        ? `최신 환율을 조회하지 못해 이전에 저장된 응답을 표시합니다.${retryText} 계속 실패하면 데이터 연결 설정을 확인해 주세요.`
        : `환율 API 호출 제한으로 잠시 조회를 쉬고 있어 이전에 저장된 응답을 표시합니다.${retryText} 계속되면 데이터 연결 설정을 확인해 주세요.`,
      nextRetryAt,
    };
  }
  return {
    state: cached ? "cache" : "live",
    usdRate,
    asOf,
    sourceLabel: "한국수출입은행",
    label: cached ? "응답 캐시 사용" : "실시간 원천 조회",
    notice: "기준일 고시 환율 참고값입니다. 실제 환전·결제 전 원문 환율과 수수료를 확인해 주세요.",
    nextRetryAt: null,
  };
}

export function describeDashboardExchangeFailure(error: unknown): DashboardExchange {
  const setupRequired = isDashboardSetupErrorCode(readDashboardErrorCode(error));
  return {
    state: setupRequired ? "setup-required" : "failed",
    usdRate: null,
    asOf: null,
    sourceLabel: DASHBOARD_FX_UNVERIFIED_SOURCE_LABEL,
    label: setupRequired ? "환율 연결 설정 필요" : "환율 조회 실패",
    notice: setupRequired
      ? "시장 기준 환율 연결이 설정되지 않았습니다. 데이터 연결 설정에서 상태를 확인해 주세요."
      : "시장 기준 환율을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.",
    nextRetryAt: null,
  };
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
      const detail = isDashboardRecord(payload) && isDashboardRecord(payload.error) ? payload.error : {};
      const message = asDashboardString(detail.message);
      // Keep the API error code so callers can tell missing setup from a transient failure.
      throw Object.assign(new Error(message || `${url} 요청에 실패했습니다.`), {
        code: asDashboardString(detail.code),
        status: response.status,
      });
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
