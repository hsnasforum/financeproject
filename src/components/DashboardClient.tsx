"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactQuickActions } from "@/components/ArtifactQuickActions";
import { InlineTodoEditor, type InlineTodoPatch } from "@/components/InlineTodoEditor";
import { StickyAgendaBar } from "@/components/StickyAgendaBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { buildAgenda } from "@/lib/feedback/feedbackAgenda";
import { computeStats, pickTop } from "@/lib/feedback/feedbackStats";
import { listRuns, type SavedRecommendRun } from "@/lib/recommend/savedRunsStore";
import { defaults as recommendProfileDefaults, parseRecommendProfile, toSearchParams } from "@/lib/schemas/recommendProfile";
import { cn } from "@/lib/utils";

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

type FeedbackCategory = "bug" | "improve" | "question";
type FeedbackStatus = "OPEN" | "DOING" | "DONE";
type FeedbackPriority = "P0" | "P1" | "P2" | "P3";
type FeedbackTask = {
  id: string;
  text: string;
  done: boolean;
};

type FeedbackItem = {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  message: string;
  traceId: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  dueDate: string | null;
  tags: string[];
  note: string;
  tasks: FeedbackTask[];
};

type FeedbackRecentPayload = {
  ok?: boolean;
  data?: FeedbackItem[];
  error?: {
    code?: string;
    message?: string;
  };
};

type FeedbackPatchPayload = {
  ok?: boolean;
  data?: FeedbackItem;
  error?: {
    code?: string;
    message?: string;
  };
};

type FeedbackMutationPatch = InlineTodoPatch & {
  status?: FeedbackStatus;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { 
    month: "short", 
    day: "numeric", 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false 
  });
}

function formatKrw(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000) return `${(amount / 10000).toLocaleString()}만원`;
  return `${Math.round(amount).toLocaleString()}원`;
}

function isRecommendPurpose(value: string | null | undefined): value is "emergency" | "seed-money" | "long-term" {
  return value === "emergency" || value === "seed-money" || value === "long-term";
}

function isRecommendKind(value: string | null | undefined): value is "deposit" | "saving" {
  return value === "deposit" || value === "saving";
}

function feedbackCategoryLabel(value: FeedbackCategory): string {
  if (value === "bug") return "버그";
  if (value === "improve") return "개선";
  return "질문";
}

function summarizeFeedbackMessage(message: string, maxLength = 90): string {
  const trimmed = message.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function dueDateText(value: string | null): string {
  return value ?? "기한 미정";
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
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<{ loading: boolean; unlocked: boolean; csrf: string | null; error: string | null }>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });
  const [health, setHealth] = useState<{ loading: boolean; rows: DataSourceHealthRow[]; fetchedAt: string | null; error: string | null }>({
    loading: true,
    rows: [],
    fetchedAt: null,
    error: null,
  });
  const [feedback, setFeedback] = useState<{ loading: boolean; rows: FeedbackItem[]; error: string | null }>({
    loading: true,
    rows: [],
    error: null,
  });
  const feedbackRowsRef = useRef<FeedbackItem[]>([]);
  const patchSeqRef = useRef<Record<string, number>>({});
  const [inlineEditors, setInlineEditors] = useState<Record<string, boolean>>({});
  const [inlineSaving, setInlineSaving] = useState<Record<string, boolean>>({});
  const [inlineErrors, setInlineErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const plannerRaw = window.localStorage.getItem(PLANNER_LAST_SNAPSHOT_KEY);
        if (plannerRaw) {
          const parsed = JSON.parse(plannerRaw);
          setPlanner({ data: parsed, error: null });
        }
      } catch {
        setPlanner({ data: null, error: "플래너 데이터를 읽지 못했습니다." });
      }

      try {
        const snapshotRaw = window.localStorage.getItem(RECOMMEND_LAST_RESULT_KEY);
        const latestRun = listRuns()[0] ?? null;
        if (latestRun) {
          const sortedItems = [...latestRun.items].sort((a, b) => a.rank - b.rank);
          setRecommend({ data: {
            savedAt: latestRun.savedAt,
            source: "saved_run",
            purpose: latestRun.profile.purpose,
            kind: latestRun.profile.kind,
            topN: latestRun.profile.topN,
            itemsCount: latestRun.items.length,
            topItemName: sortedItems[0]?.productName ?? "-",
            topItemRate: sortedItems[0]?.appliedRate ?? null,
          }, error: null });
        } else if (snapshotRaw) {
          const parsed = JSON.parse(snapshotRaw);
          setRecommend({ data: {
            savedAt: parsed.savedAt,
            source: "result_snapshot",
            purpose: parsed.profile?.purpose ?? "-",
            kind: parsed.profile?.kind ?? "-",
            topN: parsed.profile?.topN ?? 0,
            itemsCount: parsed.items?.length ?? 0,
            topItemName: parsed.items?.[0]?.productName ?? "-",
            topItemRate: parsed.items?.[0]?.appliedRate ?? null,
          }, error: null });
        }
      } catch {
        setRecommend({ data: null, error: "추천 데이터를 읽지 못했습니다." });
      }

      const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
      const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
      if (unlocked && csrf) {
        setUnlock((prev) => ({ ...prev, unlocked: true, csrf }));
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const loadBrief = useCallback(async () => {
    setBrief((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/dart/brief", { cache: "no-store" });
      const payload = await response.json();
      setBrief({ loading: false, data: payload.data ?? null, error: null });
    } catch {
      setBrief({ loading: false, data: null, error: "공시 브리핑을 불러오지 못했습니다." });
    }
  }, []);

  const loadDailyRefresh = useCallback(async () => {
    setDailyRefresh((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/daily-refresh/status", { cache: "no-store" });
      const payload = await response.json();
      setDailyRefresh({ loading: false, data: payload.data ?? null, error: null });
    } catch {
      setDailyRefresh({ loading: false, data: null, error: "갱신 상태를 불러오지 못했습니다." });
    }
  }, []);

  const loadFeedback = useCallback(async () => {
    setFeedback((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/feedback/list?limit=200", { cache: "no-store" });
      const payload = (await response.json()) as FeedbackRecentPayload;
      if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
        setFeedback({ loading: false, rows: [], error: payload.error?.message ?? "피드백을 불러오지 못했습니다." });
        return;
      }
      const normalized = payload.data.map((row) => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags : [],
        note: typeof row.note === "string" ? row.note : "",
        tasks: Array.isArray(row.tasks) ? row.tasks : [],
      }));
      setFeedback({ loading: false, rows: normalized, error: null });
    } catch {
      setFeedback({ loading: false, rows: [], error: "피드백을 불러오지 못했습니다." });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBrief();
      void loadDailyRefresh();
      void loadFeedback();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadBrief, loadDailyRefresh, loadFeedback]);

  useEffect(() => {
    async function loadHealth() {
      try {
        const response = await fetch("/api/dev/data-sources/health", { cache: "no-store" });
        const payload = await response.json();
        setHealth({ loading: false, rows: payload.data ?? [], fetchedAt: payload.fetchedAt ?? null, error: null });
      } catch {
        setHealth({ loading: false, rows: [], fetchedAt: null, error: "상태를 불러오지 못했습니다." });
      }
    }
    void loadHealth();
  }, []);

  useEffect(() => {
    feedbackRowsRef.current = feedback.rows;
  }, [feedback.rows]);

  const dataSourceSummary = useMemo(() => {
    const total = health.rows.length;
    const configured = health.rows.filter((row) => row.configured).length;
    return { total, configured };
  }, [health.rows]);
  const feedbackStats = useMemo(() => computeStats(feedback.rows), [feedback.rows]);
  const feedbackTop = useMemo(
    () => pickTop(feedback.rows, { statuses: ["OPEN", "DOING"], limit: 5 }),
    [feedback.rows],
  );
  const feedbackAgenda = useMemo(() => buildAgenda(feedback.rows), [feedback.rows]);
  const stickyAgenda = useMemo(() => {
    const todayHighCount = feedbackAgenda.today.filter((item) => item.priority === "P0" || item.priority === "P1").length;
    return {
      opsTop: feedbackAgenda.opsTop,
      overdueCount: feedbackAgenda.overdue.length,
      todayHighCount,
      noDueHighCount: feedbackAgenda.noDueHigh.length,
      overdue: feedbackAgenda.overdue,
      today: feedbackAgenda.today,
      noDueHigh: feedbackAgenda.noDueHigh,
    };
  }, [feedbackAgenda]);
  const hasStickyAgenda = useMemo(
    () => feedbackAgenda.opsTop.length > 0 || feedbackAgenda.overdue.length > 0 || feedbackAgenda.today.length > 0 || feedbackAgenda.noDueHigh.length > 0,
    [feedbackAgenda],
  );

  const patchFeedbackItem = useCallback(async (id: string, patch: FeedbackMutationPatch): Promise<{ ok: boolean; error?: string }> => {
    const targetId = id.trim();
    if (!targetId) return { ok: false, error: "id가 비어 있습니다." };
    const previousItem = feedbackRowsRef.current.find((row) => row.id === targetId);
    if (!previousItem) return { ok: false, error: "항목을 찾지 못했습니다." };

    const seq = (patchSeqRef.current[targetId] ?? 0) + 1;
    patchSeqRef.current[targetId] = seq;
    setInlineSaving((prev) => ({ ...prev, [targetId]: true }));
    setInlineErrors((prev) => {
      if (!(targetId in prev)) return prev;
      const next = { ...prev };
      delete next[targetId];
      return next;
    });

    const optimisticItem: FeedbackItem = {
      ...previousItem,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "dueDate") ? { dueDate: patch.dueDate ?? null } : {}),
      ...(patch.tasks !== undefined ? { tasks: patch.tasks.map((task) => ({ ...task })) } : {}),
    };
    setFeedback((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === targetId ? optimisticItem : row)),
    }));

    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(targetId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as FeedbackPatchPayload;
      if (!response.ok || !payload.ok) {
        if (patchSeqRef.current[targetId] === seq) {
          const message = payload.error?.message ?? "저장에 실패했습니다.";
          setFeedback((prev) => ({
            ...prev,
            rows: prev.rows.map((row) => (row.id === targetId ? previousItem : row)),
          }));
          setInlineErrors((prev) => ({ ...prev, [targetId]: message }));
        }
        return { ok: false, error: payload.error?.message ?? "저장에 실패했습니다." };
      }

      if (patchSeqRef.current[targetId] !== seq) return { ok: true };
      const updated = payload.data;
      setFeedback((prev) => ({
        ...prev,
        error: null,
        rows: prev.rows.map((row) =>
          row.id === targetId
            ? {
                ...row,
                ...updated,
                tasks: Array.isArray(updated?.tasks) ? updated.tasks : row.tasks,
              }
            : row
        ),
      }));
      setInlineErrors((prev) => {
        if (!(targetId in prev)) return prev;
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      return { ok: true };
    } catch {
      if (patchSeqRef.current[targetId] === seq) {
        setFeedback((prev) => ({
          ...prev,
          rows: prev.rows.map((row) => (row.id === targetId ? previousItem : row)),
        }));
        setInlineErrors((prev) => ({ ...prev, [targetId]: "저장 실패" }));
      }
      return { ok: false, error: "저장 실패" };
    } finally {
      if (patchSeqRef.current[targetId] === seq) {
        setInlineSaving((prev) => ({ ...prev, [targetId]: false }));
      }
    }
  }, []);

  const handleMarkDoing = useCallback((id: string) => {
    void patchFeedbackItem(id, { status: "DOING" });
  }, [patchFeedbackItem]);

  const handleMarkDone = useCallback((id: string) => {
    void patchFeedbackItem(id, { status: "DONE" });
  }, [patchFeedbackItem]);

  const toggleInlineEditor = useCallback((id: string) => {
    const targetId = id.trim();
    if (!targetId) return;
    setInlineEditors((prev) => ({ ...prev, [targetId]: !prev[targetId] }));
  }, []);

  const renderAgendaItem = useCallback(
    (item: FeedbackItem, keyPrefix: string, tone: "overdue" | "normal") => {
      const isOpen = Boolean(inlineEditors[item.id]);
      const isSaving = Boolean(inlineSaving[item.id]);
      const inlineError = inlineErrors[item.id];
      return (
        <li
          key={`${keyPrefix}-${item.id}`}
          className={cn(
            "rounded-lg border px-2.5 py-2",
            tone === "overdue"
              ? "border-rose-200 bg-rose-50"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="block min-w-0 flex-1">
              <p className={cn("text-xs font-semibold", tone === "overdue" ? "text-slate-800 hover:text-rose-700" : "text-slate-800 hover:text-emerald-700")}>
                {summarizeFeedbackMessage(item.message, 70)}
              </p>
              <p className={cn("mt-1 text-[11px]", tone === "overdue" ? "text-rose-700" : "text-slate-500")}>
                {item.priority} · {dueDateText(item.dueDate)}
              </p>
            </Link>
            <button
              type="button"
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              onClick={() => toggleInlineEditor(item.id)}
            >
              {isOpen ? "닫기" : "편집"}
            </button>
          </div>
          {isOpen ? (
            <>
              <InlineTodoEditor
                item={item}
                onPatch={(patch) => patchFeedbackItem(item.id, patch)}
                disabled={isSaving}
              />
              {inlineError ? (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{inlineError}</p>
              ) : null}
            </>
          ) : null}
        </li>
      );
    },
    [inlineEditors, inlineErrors, inlineSaving, patchFeedbackItem, toggleInlineEditor],
  );

  const handleUnlock = useCallback(async () => {
    const token = unlockToken.trim();
    if (!token) return;
    setUnlock((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/unlock", {
        method: "POST",
        headers: { "x-dev-token": token },
      });
      const payload = await response.json();
      if (payload.ok) {
        window.sessionStorage.setItem(DEV_UNLOCKED_SESSION_KEY, "1");
        window.sessionStorage.setItem(DEV_CSRF_SESSION_KEY, payload.csrf);
        setUnlock({ loading: false, unlocked: true, csrf: payload.csrf, error: null });
      } else {
        setUnlock((prev) => ({ ...prev, loading: false, error: payload.error?.message || "잠금 해제 실패" }));
      }
    } catch {
      setUnlock((prev) => ({ ...prev, loading: false, error: "네트워크 오류" }));
    }
  }, [unlockToken]);

  const plannerAssets = formatKrw(planner.data?.input?.liquidAssets);
  const recommendRate = recommend.data?.topItemRate ? `${recommend.data.topItemRate.toFixed(2)}%` : "-";

  return (
    <PageShell>
      <PageHeader
        title="개인 재무 의사결정 허브"
        description="실시간 금융 지표와 AI 분석 산출물을 기반으로 최적의 결정을 내리세요."
        action={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>새로고침</Button>
            <Link href="/settings"><Button variant="outline" size="sm">환경 설정</Button></Link>
          </div>
        }
      />

      {hasStickyAgenda ? (
        <StickyAgendaBar agenda={stickyAgenda} onMarkDoing={handleMarkDoing} onMarkDone={handleMarkDone} />
      ) : null}

      {/* Top KPI Strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="가용 자산 (최근 설계)" value={plannerAssets} />
        <StatCard label="최고 추천 금리" value={recommendRate} />
        <StatCard label="데이터 기준일" value={brief.data?.generatedAt ? new Date(brief.data.generatedAt).toLocaleDateString() : "-"} />
        <StatCard 
          label="파이프라인 건강도" 
          value={dataSourceSummary.total > 0 ? `${Math.round((dataSourceSummary.configured / dataSourceSummary.total) * 100)}%` : "0%"} 
          trend={dataSourceSummary.configured < dataSourceSummary.total ? { value: "점검 필요", isPositive: false } : undefined}
        />
      </section>

      {/* Main Action Queue */}
      <section className="grid gap-6 lg:grid-cols-2 mb-10">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900">오늘 할 일: 공시 분석</h2>
            <Link href="/public/dart">
              <Button variant="ghost" size="sm" className="text-primary h-8 px-3">탐색하기</Button>
            </Link>
          </div>
          
          <div className="flex-1">
            {brief.loading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-surface-muted rounded-full w-3/4" />
                <div className="h-4 bg-surface-muted rounded-full w-1/2" />
              </div>
            ) : !brief.data?.lines?.length ? (
               <div className="py-8 text-center rounded-2xl bg-surface-muted">
                 <p className="text-sm font-bold text-slate-400">최근 발생한 중요 공시가 없습니다.</p>
               </div>
            ) : (
               <div className="space-y-4">
                 {brief.data.lines.slice(0, 3).map((line, idx) => (
                   <div key={idx} className="flex gap-3 p-4 rounded-xl bg-surface-muted text-sm text-slate-700 font-medium">
                     <span className="text-primary font-black tabular-nums">{idx + 1}.</span>
                     <p className="leading-snug">{line}</p>
                   </div>
                 ))}
               </div>
            )}
          </div>
          
          <div className="mt-6 pt-4 border-t border-border flex gap-3">
            <ArtifactQuickActions artifactName="alerts_md" label="공시 알림 설정" />
            <ArtifactQuickActions artifactName="brief_md" label="브리핑 다운로드" />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex-1">
             <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900">재무설계 현황</h2>
              <Link href="/planning"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">설계 수정</Button></Link>
             </div>
             {!planner.data ? (
                <p className="text-sm text-slate-500 py-4">아직 작성된 재무설계가 없습니다.</p>
             ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">월 소득</p>
                    <p className="font-bold tabular-nums">{formatKrw(planner.data.input?.monthlyIncomeNet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">월 고정 지출</p>
                    <p className="font-bold tabular-nums">{formatKrw(planner.data.input?.monthlyFixedExpenses)}</p>
                  </div>
                </div>
             )}
          </Card>
          
          <Card className="flex-1">
             <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900">최근 상품 추천</h2>
              <Link href="/recommend"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">다시 받기</Button></Link>
             </div>
             {!recommend.data ? (
                <p className="text-sm text-slate-500 py-4">추천 기록이 없습니다.</p>
             ) : (
                <div>
                  <p className="font-bold text-slate-900">{recommend.data.topItemName}</p>
                  <p className="text-xs text-slate-500 mt-1">목적: {recommend.data.purpose} · 최고 금리: <span className="text-primary font-bold">{recommend.data.topItemRate}%</span></p>
                </div>
             )}
          </Card>

          <Card className="flex-1">
             <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900">피드백 트래커 요약</h2>
              <div className="flex items-center gap-2">
                <Link href="/feedback/list"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">전체 보기</Button></Link>
                <Link href="/feedback/list?status=OPEN"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">OPEN</Button></Link>
                <Link href="/feedback/list?status=DOING"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">DOING</Button></Link>
              </div>
             </div>
             {feedback.loading ? (
               <p className="text-sm text-slate-500 py-4">피드백 로딩 중...</p>
             ) : feedback.error ? (
               <p className="text-sm text-rose-600 py-4">{feedback.error}</p>
             ) : feedbackStats.total === 0 ? (
               <p className="text-sm text-slate-500 py-4">아직 접수된 피드백이 없습니다.</p>
             ) : (
               <div className="space-y-3">
                 <div className="grid grid-cols-3 gap-2 text-xs">
                   <Link href="/feedback/list?status=OPEN" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-center">
                     <p className="font-semibold text-sky-700">OPEN</p>
                     <p className="mt-1 text-lg font-black text-sky-800 tabular-nums">{feedbackStats.OPEN}</p>
                   </Link>
                   <Link href="/feedback/list?status=DOING" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                     <p className="font-semibold text-amber-700">DOING</p>
                     <p className="mt-1 text-lg font-black text-amber-800 tabular-nums">{feedbackStats.DOING}</p>
                   </Link>
                   <Link href="/feedback/list?status=DONE" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                     <p className="font-semibold text-emerald-700">DONE</p>
                     <p className="mt-1 text-lg font-black text-emerald-800 tabular-nums">{feedbackStats.DONE}</p>
                   </Link>
                 </div>

                 <div className="space-y-2">
                   <p className="text-xs font-semibold text-slate-600">OPEN/DOING Top 5</p>
                   {feedbackTop.length === 0 ? (
                     <p className="text-xs text-slate-500">진행 중 이슈가 없습니다.</p>
                   ) : (
                     <ul className="space-y-2">
                       {feedbackTop.map((item) => (
                         <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                           <Link href={`/feedback/${encodeURIComponent(item.id)}`} className="block">
                             <p className="text-xs font-semibold text-slate-800 hover:text-emerald-700">{summarizeFeedbackMessage(item.message)}</p>
                             <p className="mt-1 text-[11px] text-slate-500">
                               {item.status} · {feedbackCategoryLabel(item.category)} · {formatDateTime(item.createdAt)}
                             </p>
                           </Link>
                         </li>
                       ))}
                     </ul>
                   )}
                 </div>
               </div>
             )}
          </Card>

          <Card className="flex-1">
             <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">오늘/이번주 할 일</h2>
              <Link href="/feedback/list?status=OPEN"><Button variant="ghost" size="sm" className="text-primary h-8 px-3">더보기</Button></Link>
             </div>
             {feedback.loading ? (
               <p className="text-sm text-slate-500 py-4">할 일 로딩 중...</p>
             ) : feedback.error ? (
               <p className="text-sm text-rose-600 py-4">{feedback.error}</p>
             ) : (
               <div className="space-y-4">
                 {feedbackAgenda.overdue.length > 0 ? (
                   <div className="space-y-2">
                     <div className="flex items-center justify-between">
                       <p className="text-xs font-black text-rose-700">마감 지남</p>
                       <Link href="/feedback/list?status=OPEN" className="text-[11px] font-semibold text-rose-600 hover:text-rose-700">더보기</Link>
                     </div>
                     <ul className="space-y-1.5">
                       {feedbackAgenda.overdue.slice(0, 5).map((item) => renderAgendaItem(item, "overdue", "overdue"))}
                     </ul>
                   </div>
                 ) : null}

                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <p className="text-xs font-black text-slate-700">오늘</p>
                     <Link href="/feedback/list?status=OPEN" className="text-[11px] font-semibold text-slate-600 hover:text-slate-700">더보기</Link>
                   </div>
                   {feedbackAgenda.today.length === 0 ? (
                     <p className="text-xs text-slate-400">해당 항목 없음</p>
                   ) : (
                     <ul className="space-y-1.5">
                       {feedbackAgenda.today.slice(0, 5).map((item) => renderAgendaItem(item, "today", "normal"))}
                     </ul>
                   )}
                 </div>

                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <p className="text-xs font-black text-slate-700">이번주</p>
                     <Link href="/feedback/list?status=OPEN" className="text-[11px] font-semibold text-slate-600 hover:text-slate-700">더보기</Link>
                   </div>
                   {feedbackAgenda.thisWeek.length === 0 ? (
                     <p className="text-xs text-slate-400">해당 항목 없음</p>
                   ) : (
                     <ul className="space-y-1.5">
                       {feedbackAgenda.thisWeek.slice(0, 5).map((item) => renderAgendaItem(item, "week", "normal"))}
                     </ul>
                   )}
                 </div>

                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <p className="text-xs font-black text-slate-700">기한 미정(P0/P1)</p>
                     <Link href="/feedback/list?status=OPEN" className="text-[11px] font-semibold text-slate-600 hover:text-slate-700">더보기</Link>
                   </div>
                   {feedbackAgenda.noDueHigh.length === 0 ? (
                     <p className="text-xs text-slate-400">해당 항목 없음</p>
                   ) : (
                     <ul className="space-y-1.5">
                       {feedbackAgenda.noDueHigh.slice(0, 5).map((item) => renderAgendaItem(item, "nodue", "normal"))}
                     </ul>
                   )}
                 </div>
               </div>
             )}
          </Card>
        </div>
      </section>

      {/* Advanced Section (Foldable) */}
      <section className="mb-12">
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-bold text-slate-600 mb-4 hover:text-slate-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform", showAdvanced && "rotate-90")}><polyline points="9 18 15 12 9 6"/></svg>
          시스템 상태 및 로그
        </button>
        
        {showAdvanced && (
          <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in slide-in-from-top-2">
            <Card>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-slate-900">데이터 소스 가동률</h3>
                <Link href="/settings/data-sources"><Button variant="ghost" size="sm" className="h-8">설정</Button></Link>
              </div>
              <div className="space-y-2">
                {health.rows.map(row => (
                  <div key={row.sourceKey} className={cn("flex items-center gap-2 p-3 rounded-xl text-xs font-bold ring-1", row.configured ? "bg-emerald-50 text-emerald-800 ring-emerald-100" : "bg-amber-50 text-amber-800 ring-amber-100")}>
                    <div className={cn("h-1.5 w-1.5 rounded-full", row.configured ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                    {row.sourceKey}: {row.configured ? "정상" : "연동 필요"}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-slate-900">자동 갱신 상태</h3>
                {dailyRefresh.data && (
                  <Badge variant={dailyRefresh.data.ok ? "success" : "destructive"}>{dailyRefresh.data.ok ? "SUCCESS" : "FAILED"}</Badge>
                )}
              </div>
              {!dailyRefresh.data ? (
                <p className="text-sm text-slate-500">기록 없음</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {dailyRefresh.data.steps.slice(0, 4).map(step => (
                    <div key={step.name} className="flex items-center justify-between py-2 text-xs">
                      <span className="font-medium text-slate-700">{step.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 tabular-nums">{step.tookMs}ms</span>
                        <div className={cn("h-1.5 w-1.5 rounded-full", step.status === "ok" ? "bg-emerald-500" : "bg-rose-500")} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                 <span className="text-xs font-bold text-slate-500">Developer Actions</span>
                 {!unlock.unlocked ? (
                    <div className="flex items-center gap-2 bg-surface-muted p-1 rounded-full pl-3 ring-1 ring-border">
                      <input type="password" value={unlockToken} onChange={(e) => setUnlockToken(e.target.value)} placeholder="Token" className="bg-transparent border-none outline-none text-xs w-20" />
                      <Button variant="primary" size="sm" className="h-6 px-3 text-[10px] rounded-full" onClick={handleUnlock} disabled={unlock.loading}>UNLOCK</Button>
                    </div>
                 ) : (
                    <Badge variant="success">UNLOCKED</Badge>
                 )}
              </div>
            </Card>
          </div>
        )}
      </section>
    </PageShell>
  );
}
