"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  buildDisclosureMonitorPriorityList,
  buildDisclosureMonitorSummary,
  describeDisclosureMonitorFilters,
  getDisclosureMonitorPresetRange,
  sortDisclosureMonitorWatchlist,
  validateDisclosureMonitorSettings,
} from "@/lib/dart/disclosureMonitor";
import { DART_FAVORITES_UPDATED_EVENT, listFavorites, removeFavorite, type DartFavorite } from "@/lib/dart/dartStore";
import {
  diffNew,
  getDisclosureMonitorView,
  getDisclosureSettings,
  getLastCheckedAt,
  markSeen,
  setDisclosureMonitorView,
  setDisclosureSettings,
  type DisclosureMonitorSettings,
} from "@/lib/dart/dartDisclosureStore";
import { buildDartCompanyHref } from "@/lib/dart/query";

type DisclosureItem = {
  corpCode?: string;
  corpName?: string;
  reportName?: string;
  receiptNo?: string;
  receiptDate?: string;
  viewerUrl?: string;
};

type DisclosureApiResponse = {
  ok?: boolean;
  data?: {
    items?: DisclosureItem[];
    assumptions?: string[];
  };
  error?: {
    code?: string;
    message?: string;
    issues?: string[];
  };
};

type CorpMonitorState = {
  loading: boolean;
  error: string;
  items: DisclosureItem[];
  newItems: DisclosureItem[];
  lastCheckedAt: string | null;
  assumptions: string[];
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function normalizeDateInput(value: string): string {
  return value.trim();
}

function priorityBadgeClass(reason: "pending" | "unchecked" | "checked"): string {
  if (reason === "pending") {
    return "bg-rose-100 text-rose-700";
  }
  if (reason === "unchecked") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}

function priorityBadgeLabel(reason: "pending" | "unchecked" | "checked"): string {
  if (reason === "pending") return "신규 공시";
  if (reason === "unchecked") return "미조회";
  return "최근 확인";
}

function priorityDescription(
  reason: "pending" | "unchecked" | "checked",
  newCount: number,
  lastCheckedAt: string | null,
): string {
  if (reason === "pending") {
    return `신규 공시 ${newCount}건이 있어 바로 확인이 필요합니다.`;
  }
  if (reason === "unchecked") {
    return "아직 조회하지 않아 먼저 확인하는 편이 안전합니다.";
  }
  return `마지막 확인 ${formatDateTime(lastCheckedAt)}`;
}

function emptyCorpState(lastCheckedAt: string | null): CorpMonitorState {
  return {
    loading: false,
    error: "",
    items: [],
    newItems: [],
    lastCheckedAt,
    assumptions: [],
  };
}

export function DartDisclosureMonitorClient() {
  const [watchlist, setWatchlist] = useState<DartFavorite[]>([]);
  const [rows, setRows] = useState<Record<string, CorpMonitorState>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [settings, setSettings] = useState<DisclosureMonitorSettings>({
    finalOnly: true,
    pageCount: 20,
  });
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [focusMode, setFocusMode] = useState<"all" | "pending" | "unchecked">("all");

  const refreshWatchlist = useCallback(() => {
    const favorites = listFavorites();
    setWatchlist(favorites);
    setRows((prev) => {
      const next: Record<string, CorpMonitorState> = {};
      for (const favorite of favorites) {
        next[favorite.corpCode] = prev[favorite.corpCode] ?? emptyCorpState(getLastCheckedAt(favorite.corpCode));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const nextSettings = getDisclosureSettings();
    const nextView = getDisclosureMonitorView();
    setSettings(nextSettings);
    setFocusMode(nextView.focusMode);
    setFromInput(nextSettings.from ?? "");
    setToInput(nextSettings.to ?? "");
    refreshWatchlist();
    const onFavoritesUpdated = () => refreshWatchlist();
    window.addEventListener(DART_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    window.addEventListener("storage", onFavoritesUpdated);
    return () => {
      window.removeEventListener(DART_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
      window.removeEventListener("storage", onFavoritesUpdated);
    };
  }, [refreshWatchlist]);

  const normalizedWatchlist = useMemo(() => [...watchlist], [watchlist]);
  const effectiveSettings = useMemo<DisclosureMonitorSettings>(() => ({
    ...settings,
    from: normalizeDateInput(fromInput) || undefined,
    to: normalizeDateInput(toInput) || undefined,
  }), [fromInput, settings, toInput]);
  const settingsError = useMemo(
    () => validateDisclosureMonitorSettings(effectiveSettings),
    [effectiveSettings],
  );
  const filterChips = useMemo(
    () => describeDisclosureMonitorFilters(effectiveSettings),
    [effectiveSettings],
  );
  const summary = useMemo(
    () => buildDisclosureMonitorSummary(normalizedWatchlist, rows),
    [normalizedWatchlist, rows],
  );
  const priorityList = useMemo(
    () => buildDisclosureMonitorPriorityList(normalizedWatchlist, rows, 3),
    [normalizedWatchlist, rows],
  );
  const sortedWatchlist = useMemo(
    () => sortDisclosureMonitorWatchlist(normalizedWatchlist, rows),
    [normalizedWatchlist, rows],
  );
  const pendingOnlyWatchlist = useMemo(
    () => sortedWatchlist.filter((item) => ((rows[item.corpCode]?.newItems.length) ?? 0) > 0),
    [rows, sortedWatchlist],
  );
  const uncheckedOnlyWatchlist = useMemo(
    () => sortedWatchlist.filter((item) => rows[item.corpCode]?.lastCheckedAt == null),
    [rows, sortedWatchlist],
  );
  const visibleWatchlist = useMemo(() => {
    if (focusMode === "pending") return pendingOnlyWatchlist;
    if (focusMode === "unchecked") return uncheckedOnlyWatchlist;
    return sortedWatchlist;
  }, [focusMode, pendingOnlyWatchlist, sortedWatchlist, uncheckedOnlyWatchlist]);

  function applyFocusMode(next: "all" | "pending" | "unchecked") {
    setFocusMode(next);
    setDisclosureMonitorView({ focusMode: next });
  }

  function persistDateDrafts(activeSettings = effectiveSettings): DisclosureMonitorSettings {
    const saved = setDisclosureSettings({
      from: activeSettings.from,
      to: activeSettings.to,
    });
    setSettings(saved);
    return saved;
  }

  async function refreshCorp(corpCode: string, activeSettings: DisclosureMonitorSettings = effectiveSettings) {
    const selected = normalizedWatchlist.find((item) => item.corpCode === corpCode);
    const corpName = selected?.corpName;
    setRows((prev) => ({
      ...prev,
      [corpCode]: {
        ...(prev[corpCode] ?? emptyCorpState(getLastCheckedAt(corpCode))),
        loading: true,
        error: "",
      },
    }));

    try {
      const params = new URLSearchParams({
        corpCode,
        pageNo: "1",
        pageCount: String(activeSettings.pageCount),
        finalOnly: activeSettings.finalOnly ? "1" : "0",
      });
      if (activeSettings.from) params.set("from", activeSettings.from);
      if (activeSettings.to) params.set("to", activeSettings.to);
      if (activeSettings.type) params.set("type", activeSettings.type);

      const res = await fetch(`/api/public/disclosure/list?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as DisclosureApiResponse;
      if (!res.ok || !raw.ok) {
        if (raw.error?.code === "NO_DATA") {
          setRows((prev) => ({
            ...prev,
            [corpCode]: {
              loading: false,
              error: "",
              items: [],
              newItems: [],
              lastCheckedAt: getLastCheckedAt(corpCode),
              assumptions: [],
            },
          }));
          return;
        }
        const message = raw.error?.message ?? "공시 목록 조회에 실패했습니다.";
        setRows((prev) => ({
          ...prev,
          [corpCode]: {
            ...(prev[corpCode] ?? emptyCorpState(getLastCheckedAt(corpCode))),
            loading: false,
            error: message,
          },
        }));
        return;
      }

      const list = Array.isArray(raw.data?.items) ? raw.data?.items : [];
      const normalized = list.map((item) => ({
        ...item,
        corpCode: item.corpCode ?? corpCode,
        corpName: item.corpName ?? corpName,
      }));
      const diff = diffNew(corpCode, normalized);
      setRows((prev) => ({
        ...prev,
        [corpCode]: {
          loading: false,
          error: "",
          items: normalized,
          newItems: diff.newItems,
          lastCheckedAt: getLastCheckedAt(corpCode),
          assumptions: Array.isArray(raw.data?.assumptions) ? raw.data.assumptions : [],
        },
      }));
    } catch {
      setRows((prev) => ({
        ...prev,
        [corpCode]: {
          ...(prev[corpCode] ?? emptyCorpState(getLastCheckedAt(corpCode))),
          loading: false,
          error: "공시 목록 조회 중 오류가 발생했습니다.",
        },
      }));
    }
  }

  async function refreshAll() {
    if (settingsError) return;
    const activeSettings = persistDateDrafts();
    setBulkLoading(true);
    try {
      for (const item of normalizedWatchlist) {
        await refreshCorp(item.corpCode, activeSettings);
      }
    } finally {
      setBulkLoading(false);
    }
  }

  function applySettings(next: Partial<DisclosureMonitorSettings>) {
    const saved = setDisclosureSettings(next);
    setSettings(saved);
  }

  function applyPreset(preset: "today" | "7d" | "30d" | "all") {
    const next = getDisclosureMonitorPresetRange(preset);
    setFromInput(next.from ?? "");
    setToInput(next.to ?? "");
    applySettings(next);
  }

  function markCorpSeen(corpCode: string) {
    const row = rows[corpCode];
    const items = row?.items ?? [];
    markSeen(corpCode, items);
    setRows((prev) => ({
      ...prev,
      [corpCode]: {
        ...(prev[corpCode] ?? emptyCorpState(null)),
        newItems: [],
        lastCheckedAt: getLastCheckedAt(corpCode),
      },
    }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">공시 모니터링</h2>
          <Button size="sm" onClick={refreshWatchlist}>즐겨찾기 새로고침</Button>
          <Button
            size="sm"
            onClick={() => void refreshAll()}
            disabled={bulkLoading || normalizedWatchlist.length === 0 || Boolean(settingsError)}
          >
            {bulkLoading ? "전체 조회 중..." : "전체 조회"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          워치리스트는 OpenDART 즐겨찾기 기업을 사용합니다.
        </p>
        {normalizedWatchlist.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">모니터링 요약</p>
                <p className="mt-1 text-xs text-slate-600">
                  새 공시가 보이면 확인 처리로 신규 표시를 정리하고, 기간을 넓히면 과거 공시가 다시 보일 수 있습니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="dart-monitor-filter-summary">
                {filterChips.map((chip) => (
                  <span key={chip} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="dart-monitor-summary">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">모니터링 기업</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.watchlistCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">신규 공시</p>
                <p className="mt-2 text-2xl font-bold text-rose-700">{summary.totalNewItems}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">확인 전 기업</p>
                <p className="mt-2 text-2xl font-bold text-amber-700">{summary.pendingCorpCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">아직 미조회</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.neverCheckedCorpCount}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={focusMode === "pending" ? "primary" : "outline"}
                onClick={() => applyFocusMode("pending")}
                data-testid="dart-monitor-summary-pending-only"
              >
                신규 공시 {summary.pendingCorpCount}곳만 보기
              </Button>
              <Button
                size="sm"
                variant={focusMode === "unchecked" ? "primary" : "outline"}
                onClick={() => applyFocusMode("unchecked")}
                data-testid="dart-monitor-summary-unchecked-only"
              >
                아직 미조회 {summary.neverCheckedCorpCount}곳만 보기
              </Button>
              <Button
                size="sm"
                variant={focusMode === "all" ? "secondary" : "outline"}
                onClick={() => applyFocusMode("all")}
                data-testid="dart-monitor-summary-show-all"
              >
                전체 기업 보기
              </Button>
            </div>
            {priorityList.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4" data-testid="dart-monitor-priority-list">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">지금 먼저 볼 기업</p>
                    <p className="mt-1 text-xs text-slate-600">
                      신규 공시가 있거나 아직 조회하지 않은 기업을 먼저 추렸습니다.
                    </p>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500">최대 3곳</p>
                </div>
                <ul className="mt-3 grid gap-3 lg:grid-cols-3">
                  {priorityList.map((item) => {
                    const row = rows[item.corpCode] ?? emptyCorpState(getLastCheckedAt(item.corpCode));
                    const companyHref = buildDartCompanyHref(item.corpCode, undefined, item.corpName);
                    return (
                      <li
                        key={`priority-${item.corpCode}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                        data-testid={`dart-monitor-priority-${item.corpCode}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.corpName ?? item.corpCode}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {priorityDescription(item.reason, item.newCount, item.lastCheckedAt)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500" data-testid={`dart-monitor-priority-preview-${item.corpCode}`}>
                              {item.previewText}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityBadgeClass(item.reason)}`}>
                            {priorityBadgeLabel(item.reason)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={companyHref}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition-all duration-300 hover:scale-[1.02] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
                            data-testid={`dart-monitor-priority-company-link-${item.corpCode}`}
                          >
                            회사 상세
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (settingsError) return;
                              const activeSettings = persistDateDrafts();
                              void refreshCorp(item.corpCode, activeSettings);
                            }}
                            disabled={row.loading || Boolean(settingsError)}
                            data-testid={`dart-monitor-priority-refresh-${item.corpCode}`}
                          >
                            {row.loading ? "조회 중..." : "바로 조회"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-xs text-slate-700">
            from
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              placeholder="YYYY-MM-DD"
              value={fromInput}
              onChange={(event) => setFromInput(normalizeDateInput(event.target.value))}
            />
          </label>
          <label className="text-xs text-slate-700">
            to
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              placeholder="YYYY-MM-DD"
              value={toInput}
              onChange={(event) => setToInput(normalizeDateInput(event.target.value))}
            />
          </label>
          <label className="text-xs text-slate-700">
            유형(pblntf_ty)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              placeholder="A/B/C..."
              value={settings.type ?? ""}
              onChange={(event) => applySettings({ type: event.target.value.trim() || undefined })}
            />
          </label>
          <label className="text-xs text-slate-700">
            pageCount
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              type="number"
              min={1}
              max={100}
              value={settings.pageCount}
              onChange={(event) => {
                const value = Number(event.target.value);
                const pageCount = Number.isInteger(value) ? Math.max(1, Math.min(100, value)) : 20;
                applySettings({ pageCount });
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => applyPreset("today")}>오늘</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("7d")}>최근 7일</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("30d")}>최근 30일</Button>
          <Button size="sm" variant="ghost" onClick={() => applyPreset("all")}>기간 초기화</Button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={settings.finalOnly}
            onChange={(event) => applySettings({ finalOnly: event.target.checked })}
          />
          최종보고서만 조회
        </label>
        <p className="mt-2 text-[11px] text-slate-500">
          날짜는 YYYY-MM-DD 형식으로 입력합니다. 기간이 잘못되면 조회 버튼이 잠시 비활성화됩니다.
        </p>
        {settingsError ? (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" data-testid="dart-monitor-settings-error">
            {settingsError}
          </p>
        ) : null}
      </Card>

      {normalizedWatchlist.length === 0 ? (
        <Card>
          <EmptyState
            title="모니터링할 기업이 없습니다"
            description="기업 상세 화면에서 즐겨찾기를 추가하면 이곳에서 새 공시를 한 번에 확인할 수 있습니다."
            icon="data"
            className="rounded-2xl border-slate-200 bg-slate-50/80 p-8"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">보기 옵션</p>
                <p className="mt-1 text-xs text-slate-600" data-testid="dart-monitor-visibility-summary">
                  {focusMode === "pending"
                    ? `신규 공시가 있는 기업 ${visibleWatchlist.length}곳만 보고 있습니다.`
                    : focusMode === "unchecked"
                      ? `아직 확인하지 않은 기업 ${visibleWatchlist.length}곳만 보고 있습니다.`
                      : "신규 공시가 있는 기업과 아직 확인하지 않은 기업이 먼저 보입니다."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={focusMode === "pending" ? "primary" : "outline"}
                  onClick={() => applyFocusMode("pending")}
                  data-testid="dart-monitor-pending-only-toggle"
                >
                  신규만 보기
                </Button>
                <Button
                  size="sm"
                  variant={focusMode === "unchecked" ? "primary" : "outline"}
                  onClick={() => applyFocusMode("unchecked")}
                  data-testid="dart-monitor-unchecked-only-toggle"
                >
                  미조회만 보기
                </Button>
                <Button
                  size="sm"
                  variant={focusMode === "all" ? "secondary" : "outline"}
                  onClick={() => applyFocusMode("all")}
                  data-testid="dart-monitor-show-all-toggle"
                >
                  전체 보기
                </Button>
              </div>
            </div>
          </Card>
          {visibleWatchlist.length === 0 ? (
            <Card data-testid={`dart-monitor-${focusMode}-empty`}>
              <EmptyState
                title={focusMode === "unchecked" ? "아직 확인하지 않은 기업이 없습니다" : "지금 바로 확인할 신규 공시가 없습니다"}
                description="전체 보기를 다시 켜면 최근에 확인한 기업과 아직 미조회인 기업을 함께 볼 수 있습니다."
                icon="data"
                className="rounded-2xl border-slate-200 bg-slate-50/80 p-8"
              />
              <div className="mt-4 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyFocusMode("all")}
                  data-testid="dart-monitor-show-all"
                >
                  전체 기업 보기
                </Button>
              </div>
            </Card>
          ) : (
            visibleWatchlist.map((corp) => {
              const row = rows[corp.corpCode] ?? emptyCorpState(getLastCheckedAt(corp.corpCode));
              const companyHref = buildDartCompanyHref(corp.corpCode, undefined, corp.corpName);
              return (
                <Card key={corp.corpCode}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{corp.corpName ?? corp.corpCode}</p>
                      <p className="text-xs text-slate-600">
                        {corp.corpCode} · 마지막 확인 {formatDateTime(row.lastCheckedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.newItems.length > 0 ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          신규 {row.newItems.length}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          신규 없음
                        </span>
                      )}
                      <Link
                        href={companyHref}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition-all duration-300 hover:scale-[1.02] hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
                        data-testid={`dart-monitor-company-link-${corp.corpCode}`}
                      >
                        회사 상세
                      </Link>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (settingsError) return;
                          const activeSettings = persistDateDrafts();
                          void refreshCorp(corp.corpCode, activeSettings);
                        }}
                        disabled={row.loading || Boolean(settingsError)}
                      >
                        {row.loading ? "조회 중..." : "새로고침"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markCorpSeen(corp.corpCode)} disabled={row.items.length === 0}>
                        확인 처리
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeFavorite(corp.corpCode)}
                        data-testid={`dart-monitor-remove-${corp.corpCode}`}
                      >
                        모니터에서 제거
                      </Button>
                    </div>
                  </div>
                  {row.error ? <p className="mt-2 text-xs text-rose-700">{row.error}</p> : null}
                  {row.assumptions.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
                      {row.assumptions.map((note, index) => (
                        <li key={`${corp.corpCode}-assume-${index}`}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {row.items.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {row.items.slice(0, 6).map((item, index) => {
                        const isNew = row.newItems.some((newItem) => newItem.receiptNo === item.receiptNo);
                        return (
                          <li key={`${corp.corpCode}-${item.receiptNo ?? index}`} className="rounded-lg border border-slate-100 px-2 py-1 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-slate-900">{item.reportName ?? "(제목 없음)"}</p>
                                <p className="text-slate-600">{item.receiptDate ?? "-"} · {item.receiptNo ?? "-"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isNew ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">NEW</span> : null}
                                {item.viewerUrl ? (
                                  <Link href={item.viewerUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-emerald-700 hover:underline">
                                    원문
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">조회된 공시가 없습니다.</p>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
