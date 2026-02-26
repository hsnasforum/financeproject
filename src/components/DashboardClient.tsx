"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArtifactQuickActions } from "@/components/ArtifactQuickActions";
import { Card } from "@/components/ui/Card";
import { listRuns, type SavedRecommendRun } from "@/lib/recommend/savedRunsStore";
import { defaults as recommendProfileDefaults, parseRecommendProfile, toSearchParams } from "@/lib/schemas/recommendProfile";

const PLANNER_LAST_SNAPSHOT_KEY = "planner_last_snapshot_v1";
const RECOMMEND_PROFILE_KEY = "recommend_profile_v1";
const RECOMMEND_LAST_RESULT_KEY = "recommend_last_result_v1";
const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type PlannerSnapshot = {
  savedAt: string;
  input?: {
    monthlyIncomeNet?: number;
    monthlyFixedExpenses?: number;
    monthlyVariableExpenses?: number;
    liquidAssets?: number;
  };
  result?: {
    metrics?: unknown[];
    actions?: unknown[];
    warnings?: unknown[];
  };
};

type RecommendResultSnapshot = {
  savedAt: string;
  profile?: {
    purpose?: string;
    kind?: string;
    topN?: number;
  };
  items?: Array<{
    productName?: string;
    providerName?: string;
    appliedRate?: number | null;
    rank?: number;
  }>;
};

type RecommendSummary = {
  savedAt: string;
  source: "result_snapshot" | "saved_run";
  purpose: string;
  kind: string;
  topN: number;
  itemsCount: number;
  topItemName: string;
  topItemRate: number | null;
};

type DailyBriefData = {
  generatedAt: string | null;
  lines: string[];
  stats?: {
    total?: number;
    shown?: number;
  };
};

type DailyBriefApiPayload = {
  ok?: boolean;
  data?: DailyBriefData | null;
};

type DailyRefreshStepStatus = "ok" | "skipped" | "failed";

type DailyRefreshStep = {
  name: string;
  status: DailyRefreshStepStatus;
  tookMs: number;
  stdoutTail?: string;
  stderrTail?: string;
};

type DailyRefreshData = {
  generatedAt: string | null;
  ok: boolean;
  steps: DailyRefreshStep[];
};

type DailyRefreshStatusApiPayload = {
  ok?: boolean;
  data?: DailyRefreshData | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type DataSourceHealthRow = {
  sourceKey: string;
  configured: boolean;
  replayEnabled: boolean;
  cooldownNextRetryAt: string | null;
  lastSnapshotGeneratedAt: string | null;
};

type DataSourceHealthPayload = {
  ok?: boolean;
  data?: DataSourceHealthRow[];
  fetchedAt?: string;
};

type DartWatchPayload = {
  ok?: boolean;
  tookMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type DevUnlockPayload = {
  ok?: boolean;
  csrf?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function formatKrw(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${Math.round(amount).toLocaleString()}원`;
}

function parsePlannerSnapshot(raw: string | null): PlannerSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
    if (!savedAt) return null;
    return {
      savedAt,
      input: isRecord(parsed.input) ? parsed.input as PlannerSnapshot["input"] : undefined,
      result: isRecord(parsed.result) ? parsed.result as PlannerSnapshot["result"] : undefined,
    };
  } catch {
    return null;
  }
}

function parseRecommendSnapshot(raw: string | null): RecommendResultSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
    if (!savedAt) return null;
    return {
      savedAt,
      profile: isRecord(parsed.profile) ? parsed.profile as RecommendResultSnapshot["profile"] : undefined,
      items: Array.isArray(parsed.items) ? parsed.items as RecommendResultSnapshot["items"] : undefined,
    };
  } catch {
    return null;
  }
}

function parseStoredRecommendProfile(raw: string | null) {
  if (!raw) return recommendProfileDefaults();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseRecommendProfile(parsed).value;
  } catch {
    return recommendProfileDefaults();
  }
}

function clipLogSnippet(value: string | null | undefined, maxChars = 220): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function isRecommendPurpose(value: string | null | undefined): value is "emergency" | "seed-money" | "long-term" {
  return value === "emergency" || value === "seed-money" || value === "long-term";
}

function isRecommendKind(value: string | null | undefined): value is "deposit" | "saving" {
  return value === "deposit" || value === "saving";
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeDailyRefreshBadge(data: DailyRefreshData): {
  label: "OK" | "FAILED" | "SKIPPED";
  className: string;
} {
  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (steps.length > 0 && steps.every((step) => step.status === "skipped")) {
    return {
      label: "SKIPPED",
      className: "bg-amber-100 text-amber-800",
    };
  }
  if (steps.some((step) => step.status === "failed") || data.ok === false) {
    return {
      label: "FAILED",
      className: "bg-rose-100 text-rose-800",
    };
  }
  return {
    label: "OK",
    className: "bg-emerald-100 text-emerald-800",
  };
}

function summarizeFromRun(run: SavedRecommendRun): RecommendSummary {
  const sortedItems = [...run.items].sort((a, b) => a.rank - b.rank);
  const top = sortedItems[0];
  return {
    savedAt: run.savedAt,
    source: "saved_run",
    purpose: run.profile.purpose,
    kind: run.profile.kind,
    topN: run.profile.topN,
    itemsCount: run.items.length,
    topItemName: top?.productName ?? "-",
    topItemRate: top?.appliedRate ?? null,
  };
}

function summarizeFromSnapshot(snapshot: RecommendResultSnapshot): RecommendSummary {
  const rows = Array.isArray(snapshot.items) ? snapshot.items : [];
  const top = [...rows]
    .sort((a, b) => Number(a?.rank ?? 9999) - Number(b?.rank ?? 9999))[0];
  return {
    savedAt: snapshot.savedAt,
    source: "result_snapshot",
    purpose: String(snapshot.profile?.purpose ?? "-"),
    kind: String(snapshot.profile?.kind ?? "-"),
    topN: Number(snapshot.profile?.topN ?? 0) || rows.length,
    itemsCount: rows.length,
    topItemName: String(top?.productName ?? "-"),
    topItemRate: typeof top?.appliedRate === "number" ? top.appliedRate : null,
  };
}

function pickLatestRecommendSummary(snapshot: RecommendResultSnapshot | null, run: SavedRecommendRun | null): RecommendSummary | null {
  if (!snapshot && !run) return null;
  if (snapshot && !run) return summarizeFromSnapshot(snapshot);
  if (!snapshot && run) return summarizeFromRun(run);
  return toTimestamp(snapshot?.savedAt) >= toTimestamp(run?.savedAt)
    ? summarizeFromSnapshot(snapshot as RecommendResultSnapshot)
    : summarizeFromRun(run as SavedRecommendRun);
}

export function DashboardClient() {
  const router = useRouter();
  const [planner, setPlanner] = useState<{ data: PlannerSnapshot | null; error: string | null }>({ data: null, error: null });
  const [recommend, setRecommend] = useState<{ data: RecommendSummary | null; error: string | null }>({ data: null, error: null });
  const [brief, setBrief] = useState<{ loading: boolean; data: DailyBriefData | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });
  const [dailyRefresh, setDailyRefresh] = useState<{ loading: boolean; data: DailyRefreshData | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });
  const [dartWatch, setDartWatch] = useState<{ loading: boolean; error: string | null; note: string | null }>({
    loading: false,
    error: null,
    note: null,
  });
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<{ loading: boolean; unlocked: boolean; csrf: string | null; error: string | null }>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });
  const [recommendRerunError, setRecommendRerunError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ loading: boolean; rows: DataSourceHealthRow[]; fetchedAt: string | null; error: string | null }>({
    loading: true,
    rows: [],
    fetchedAt: null,
    error: null,
  });

  useEffect(() => {
    try {
      const plannerRaw = window.localStorage.getItem(PLANNER_LAST_SNAPSHOT_KEY);
      const plannerParsed = parsePlannerSnapshot(plannerRaw);
      setPlanner({ data: plannerParsed, error: plannerParsed ? null : null });
    } catch {
      setPlanner({ data: null, error: "플래너 로컬 데이터를 읽지 못했습니다." });
    }

    try {
      const snapshotRaw = window.localStorage.getItem(RECOMMEND_LAST_RESULT_KEY);
      const snapshot = parseRecommendSnapshot(snapshotRaw);
      const latestRun = listRuns()[0] ?? null;
      const summary = pickLatestRecommendSummary(snapshot, latestRun);
      setRecommend({ data: summary, error: null });
    } catch {
      setRecommend({ data: null, error: "추천 로컬 데이터를 읽지 못했습니다." });
    }

    try {
      const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
      const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
      if (unlocked && csrf) {
        setUnlock((prev) => ({ ...prev, unlocked: true, csrf }));
      }
    } catch {
      // no-op
    }
  }, []);

  const loadBrief = useCallback(async () => {
    setBrief((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/dart/brief", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as DailyBriefApiPayload;
      setBrief({ loading: false, data: payload.data ?? null, error: null });
    } catch {
      setBrief({ loading: false, data: null, error: "공시 브리핑을 불러오지 못했습니다." });
    }
  }, []);

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  const loadDailyRefresh = useCallback(async () => {
    setDailyRefresh((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/daily-refresh/status", { cache: "no-store" });
      const payload = (await response.json()) as DailyRefreshStatusApiPayload;
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
      }
      setDailyRefresh({
        loading: false,
        data: payload.data ?? null,
        error: null,
      });
    } catch {
      setDailyRefresh({
        loading: false,
        data: null,
        error: "자동 갱신 상태를 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    void loadDailyRefresh();
  }, [loadDailyRefresh]);

  useEffect(() => {
    let active = true;
    async function loadHealth() {
      try {
        const response = await fetch("/api/dev/data-sources/health", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as DataSourceHealthPayload;
        if (!active) return;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        setHealth({ loading: false, rows, fetchedAt: payload.fetchedAt ?? null, error: null });
      } catch {
        if (!active) return;
        setHealth({ loading: false, rows: [], fetchedAt: null, error: "데이터 소스 상태를 불러오지 못했습니다." });
      }
    }
    void loadHealth();
    return () => {
      active = false;
    };
  }, []);

  const dataSourceSummary = useMemo(() => {
    const total = health.rows.length;
    const configured = health.rows.filter((row) => row.configured).length;
    const missingRows = health.rows.filter((row) => !row.configured);
    return { total, configured, missingRows };
  }, [health.rows]);

  const dailyRefreshBadge = useMemo(() => {
    if (!dailyRefresh.data) return null;
    return summarizeDailyRefreshBadge(dailyRefresh.data);
  }, [dailyRefresh.data]);

  const handleRefreshDart = useCallback(async () => {
    if (!unlock.unlocked || !unlock.csrf) {
      setDartWatch({
        loading: false,
        error: "잠금 해제 후 DART 새로고침을 실행할 수 있습니다.",
        note: null,
      });
      return;
    }

    setDartWatch({ loading: true, error: null, note: null });
    try {
      const response = await fetch("/api/dev/dart/watch", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: unlock.csrf }),
      });
      const payload = (await response.json()) as DartWatchPayload;
      if (!response.ok || !payload.ok) {
        const stderrSnippet = clipLogSnippet(payload.stderrTail);
        const message = payload.error?.message ?? `HTTP ${response.status}`;
        setDartWatch({
          loading: false,
          error: stderrSnippet ? `${message} (${stderrSnippet})` : message,
          note: null,
        });
        return;
      }

      setDartWatch({
        loading: false,
        error: null,
        note: `갱신 완료 (${Math.max(0, Number(payload.tookMs ?? 0))}ms)`,
      });
      await loadBrief();
    } catch {
      setDartWatch({
        loading: false,
        error: "DART 새로고침 요청에 실패했습니다.",
        note: null,
      });
    }
  }, [loadBrief, unlock.csrf, unlock.unlocked]);

  const handleUnlock = useCallback(async () => {
    const token = unlockToken.trim();
    if (!token) {
      setUnlock((prev) => ({ ...prev, error: "잠금 해제 토큰을 입력해 주세요." }));
      return;
    }

    setUnlock((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/unlock", {
        method: "POST",
        cache: "no-store",
        headers: { "x-dev-token": token },
      });
      const payload = (await response.json()) as DevUnlockPayload;
      if (!response.ok || !payload.ok) {
        const message = payload.error?.message ?? `HTTP ${response.status}`;
        setUnlock((prev) => ({ ...prev, loading: false, error: message }));
        return;
      }
      if (typeof payload.csrf !== "string" || !payload.csrf.trim()) {
        setUnlock((prev) => ({ ...prev, loading: false, error: "CSRF 토큰을 받지 못했습니다." }));
        return;
      }

      try {
        window.sessionStorage.setItem(DEV_UNLOCKED_SESSION_KEY, "1");
        window.sessionStorage.setItem(DEV_CSRF_SESSION_KEY, payload.csrf);
      } catch {
        // no-op
      }

      setUnlockToken("");
      setUnlock({ loading: false, unlocked: true, csrf: payload.csrf, error: null });
      setDartWatch((prev) => ({ ...prev, error: null }));
    } catch {
      setUnlock((prev) => ({ ...prev, loading: false, error: "잠금 해제 요청에 실패했습니다." }));
    }
  }, [unlockToken]);

  const handleRerunRecommend = useCallback(() => {
    setRecommendRerunError(null);
    try {
      const rawProfile = window.localStorage.getItem(RECOMMEND_PROFILE_KEY);
      const profile = parseStoredRecommendProfile(rawProfile);
      const params = toSearchParams(profile);

      if (isRecommendPurpose(recommend.data?.purpose)) params.set("purpose", recommend.data.purpose);
      if (isRecommendKind(recommend.data?.kind)) params.set("kind", recommend.data.kind);
      if (recommend.data?.topN && Number.isFinite(recommend.data.topN) && recommend.data.topN > 0) {
        params.set("topN", String(recommend.data.topN));
      }

      params.set("autorun", "1");
      params.set("save", "1");
      params.set("go", "history");
      params.set("from", "dashboard");
      router.push(`/recommend?${params.toString()}`);
    } catch {
      setRecommendRerunError("최근 추천 설정을 읽지 못했습니다.");
    }
  }, [recommend.data, router]);

  return (
    <main data-testid="dashboard-root" className="min-h-screen bg-[#F8FAFC] py-10 md:py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">통합 대시보드</h1>
          <p className="mt-2 text-sm text-slate-600">플래너, 추천, 공시 브리핑, 데이터 소스 상태를 한 화면에서 확인합니다.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">플래너 최근 결과</h2>
                <p className="mt-1 text-xs text-slate-500">localStorage: planner_last_snapshot_v1</p>
              </div>
              <Link href="/planner" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">열기</Link>
            </div>

            {planner.error ? (
              <p className="mt-4 text-sm text-rose-600">{planner.error}</p>
            ) : !planner.data ? (
              <p className="mt-4 text-sm text-slate-500">저장된 플래너 결과가 없습니다. 먼저 계산을 실행해 주세요.</p>
            ) : (
              <div className="mt-4 space-y-1.5 text-sm text-slate-700">
                <p>저장시각: {formatDateTime(planner.data.savedAt)}</p>
                <p>월 소득: {formatKrw(planner.data.input?.monthlyIncomeNet)}</p>
                <p>월 지출: {formatKrw(Number(planner.data.input?.monthlyFixedExpenses ?? 0) + Number(planner.data.input?.monthlyVariableExpenses ?? 0))}</p>
                <p>가용 현금성 자산: {formatKrw(planner.data.input?.liquidAssets)}</p>
                <p>지표/액션: {Array.isArray(planner.data.result?.metrics) ? planner.data.result?.metrics?.length : 0} / {Array.isArray(planner.data.result?.actions) ? planner.data.result?.actions?.length : 0}</p>
              </div>
            )}
          </Card>

          <Card className="rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">추천 최근 실행</h2>
                <p className="mt-1 text-xs text-slate-500">localStorage 또는 저장된 runs 최신값</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRerunRecommend}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  최근 조건 재실행
                </button>
                <Link href="/recommend" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">추천</Link>
                <Link href="/recommend/history" className="text-xs font-bold text-slate-600 hover:text-slate-800">히스토리</Link>
              </div>
            </div>

            {recommend.error ? (
              <p className="mt-4 text-sm text-rose-600">{recommend.error}</p>
            ) : !recommend.data ? (
              <p className="mt-4 text-sm text-slate-500">저장된 추천 결과가 없습니다. 추천 실행 후 다시 확인해 주세요.</p>
            ) : (
              <div className="mt-4 space-y-1.5 text-sm text-slate-700">
                <p>저장시각: {formatDateTime(recommend.data.savedAt)}</p>
                <p>소스: {recommend.data.source === "saved_run" ? "savedRunsStore" : "recommend_last_result_v1"}</p>
                <p>프로필: {recommend.data.purpose} / {recommend.data.kind} / topN {recommend.data.topN}</p>
                <p>항목 수: {recommend.data.itemsCount}</p>
                <p>1순위: {recommend.data.topItemName}{typeof recommend.data.topItemRate === "number" ? ` (${recommend.data.topItemRate.toFixed(2)}%)` : ""}</p>
              </div>
            )}
            {recommendRerunError ? (
              <p className="mt-3 text-xs text-rose-600">{recommendRerunError}</p>
            ) : null}
          </Card>

          <Card className="rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">공시 브리핑</h2>
                <p className="mt-1 text-xs text-slate-500">/api/dev/dart/brief</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={unlockToken}
                  onChange={(event) => setUnlockToken(event.target.value)}
                  placeholder="잠금 해제 토큰"
                  className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => { void handleUnlock(); }}
                  disabled={unlock.loading}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unlock.loading ? "검증 중..." : "잠금 해제"}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleRefreshDart(); }}
                  disabled={!unlock.unlocked || !unlock.csrf || dartWatch.loading}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dartWatch.loading ? "새로고침 중..." : "DART 새로고침"}
                </button>
                <Link href="/public/dart" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">공시</Link>
                <Link href="/report" className="text-xs font-bold text-slate-600 hover:text-slate-800">리포트</Link>
              </div>
            </div>

            {brief.loading ? (
              <p className="mt-4 text-sm text-slate-500">브리핑 로딩 중...</p>
            ) : brief.error ? (
              <p className="mt-4 text-sm text-rose-600">{brief.error}</p>
            ) : !brief.data || !Array.isArray(brief.data.lines) || brief.data.lines.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">브리핑 데이터가 없습니다. `pnpm dart:watch`를 실행해 주세요.</p>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-slate-700">생성시각: {formatDateTime(brief.data.generatedAt)}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
                  {brief.data.lines.slice(0, 5).map((line, index) => (
                    <li key={`brief-line-${index}`}>{line}</li>
                  ))}
                </ol>
              </div>
            )}
            {unlock.unlocked ? (
              <p className="mt-3 text-xs text-emerald-700">잠금 해제됨 (12시간)</p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">잠금 해제 후 DART 새로고침을 사용할 수 있습니다.</p>
            )}
            {unlock.error ? (
              <p className="mt-2 text-xs text-rose-600">{unlock.error}</p>
            ) : null}
            {dartWatch.error ? (
              <p className="mt-3 text-xs text-rose-600">{dartWatch.error}</p>
            ) : dartWatch.note ? (
              <p className="mt-3 text-xs text-emerald-700">{dartWatch.note}</p>
            ) : null}

            <div className="mt-4 grid gap-2">
              <ArtifactQuickActions artifactName="brief_md" label="브리핑 빠른 작업" />
              <ArtifactQuickActions artifactName="alerts_md" label="공시 알림 빠른 작업" />
            </div>
          </Card>

          <Card className="rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">데이터 소스 상태</h2>
                <p className="mt-1 text-xs text-slate-500">/api/dev/data-sources/health</p>
              </div>
              <Link href="/settings/data-sources" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">설정</Link>
            </div>

            {health.loading ? (
              <p className="mt-4 text-sm text-slate-500">상태 로딩 중...</p>
            ) : health.error ? (
              <p className="mt-4 text-sm text-rose-600">{health.error}</p>
            ) : health.rows.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">데이터 소스 상태 정보가 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-slate-700">
                  configured: {dataSourceSummary.configured} / {dataSourceSummary.total}
                </p>
                <p className="text-xs text-slate-500">fetchedAt: {formatDateTime(health.fetchedAt)}</p>
                {dataSourceSummary.missingRows.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-700">
                    {dataSourceSummary.missingRows.slice(0, 4).map((row) => (
                      <li key={row.sourceKey}>{row.sourceKey} (설정 필요)</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-700">모든 소스가 configured 상태입니다.</p>
                )}
              </div>
            )}
          </Card>

          <Card className="rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">마지막 자동 갱신</h2>
                <p className="mt-1 text-xs text-slate-500">/api/dev/daily-refresh/status</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/dashboard/artifacts" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">
                  산출물 보기
                </Link>
                {dailyRefreshBadge ? (
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${dailyRefreshBadge.className}`}>
                    {dailyRefreshBadge.label}
                  </span>
                ) : null}
              </div>
            </div>

            {dailyRefresh.loading ? (
              <p className="mt-4 text-sm text-slate-500">자동 갱신 상태 로딩 중...</p>
            ) : dailyRefresh.error ? (
              <p className="mt-4 text-sm text-rose-600">{dailyRefresh.error}</p>
            ) : !dailyRefresh.data ? (
              <p className="mt-4 text-sm text-slate-500">아직 기록 없음. `pnpm daily:refresh` 실행 필요</p>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-700">생성시각: {formatDateTime(dailyRefresh.data.generatedAt)}</p>
                {dailyRefresh.data.steps.length === 0 ? (
                  <p className="text-xs text-slate-500">기록된 step 정보가 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Step</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Took(ms)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRefresh.data.steps.map((step) => (
                          <tr key={`daily-refresh-step-${step.name}`} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-medium text-slate-800">{step.name}</td>
                            <td className="px-3 py-2">{step.status}</td>
                            <td className="px-3 py-2">{step.tookMs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
