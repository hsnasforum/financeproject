"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listFavorites, type DartFavorite } from "@/lib/dart/dartStore";
import {
  diffNew,
  getDisclosureSettings,
  getLastCheckedAt,
  markSeen,
  setDisclosureSettings,
  type DisclosureMonitorSettings,
} from "@/lib/dart/dartDisclosureStore";

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
    setSettings(getDisclosureSettings());
    refreshWatchlist();
  }, [refreshWatchlist]);

  const normalizedWatchlist = useMemo(() => [...watchlist], [watchlist]);

  async function refreshCorp(corpCode: string) {
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
        pageCount: String(settings.pageCount),
        finalOnly: settings.finalOnly ? "1" : "0",
      });
      if (settings.from) params.set("from", settings.from);
      if (settings.to) params.set("to", settings.to);
      if (settings.type) params.set("type", settings.type);

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
    setBulkLoading(true);
    try {
      for (const item of normalizedWatchlist) {
        await refreshCorp(item.corpCode);
      }
    } finally {
      setBulkLoading(false);
    }
  }

  function applySettings(next: Partial<DisclosureMonitorSettings>) {
    const saved = setDisclosureSettings(next);
    setSettings(saved);
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
          <Button size="sm" onClick={() => void refreshAll()} disabled={bulkLoading || normalizedWatchlist.length === 0}>
            {bulkLoading ? "전체 조회 중..." : "전체 조회"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          워치리스트는 OpenDART 즐겨찾기 기업을 사용합니다.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-xs text-slate-700">
            from
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              placeholder="YYYY-MM-DD"
              value={settings.from ?? ""}
              onChange={(event) => applySettings({ from: normalizeDateInput(event.target.value) || undefined })}
            />
          </label>
          <label className="text-xs text-slate-700">
            to
            <input
              className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-sm"
              placeholder="YYYY-MM-DD"
              value={settings.to ?? ""}
              onChange={(event) => applySettings({ to: normalizeDateInput(event.target.value) || undefined })}
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
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={settings.finalOnly}
            onChange={(event) => applySettings({ finalOnly: event.target.checked })}
          />
          최종보고서만 조회
        </label>
      </Card>

      {normalizedWatchlist.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">즐겨찾기 기업이 없습니다. `/public/dart/company`에서 즐겨찾기를 추가하세요.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {normalizedWatchlist.map((corp) => {
            const row = rows[corp.corpCode] ?? emptyCorpState(getLastCheckedAt(corp.corpCode));
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
                    <Button size="sm" onClick={() => void refreshCorp(corp.corpCode)} disabled={row.loading}>
                      {row.loading ? "조회 중..." : "새로고침"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markCorpSeen(corp.corpCode)} disabled={row.items.length === 0}>
                      확인 처리
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
                                <Link href={item.viewerUrl} target="_blank" className="text-[11px] font-semibold text-emerald-700 hover:underline">
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
          })}
        </div>
      )}
    </div>
  );
}
