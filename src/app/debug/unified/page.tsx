"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SourceBadge } from "@/components/debug/SourceBadge";
import { RowFlags } from "@/components/debug/RowFlags";

type StatusRow = {
  sourceId: string;
  kind: string;
  lastSyncedAt: string | null;
  lastAttemptAt?: string | null;
  ttlMs: number;
  ageMs: number | null;
  isFresh: boolean;
  counts: number;
  lastRun?: {
    startedAt?: string;
    finishedAt?: string;
    fetchedItems?: number;
    upsertedItems?: number;
    touchedItems?: number;
    createdItems?: number;
    updatedItems?: number;
    totalCount?: number;
    resultCode?: string;
    resultMsg?: string;
  } | null;
  lastError?: { at?: string; message?: string } | null;
};

type UnifiedRow = {
  sourceId: string;
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
};

type KdbOnlyRow = {
  sourceId: string;
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
};

type UnifiedPageInfo = {
  hasMore?: boolean;
  nextCursor?: string | null;
  limit?: number;
  sourceId?: string;
};

type UnifiedSourcesMap = Record<string, { count?: number }>;
type CoverageInfo = {
  totalProducts: number;
  kdbBadged: number;
};
type DiagnosticsInfo = {
  providerIndex?: {
    finlifeProviders: number;
    kdbProvidersIndexed: number;
  };
  matchSummary?: {
    kdb: { byExact: number; byNormalized: number; byFuzzy: number; none: number };
  };
  unmatchedProviders?: Array<{ providerName: string; count: number }>;
  notes?: string[];
};

function fmtTs(ts?: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { hour12: false });
}

function toMs(ts?: string | null): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

function readApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const error = (root.error && typeof root.error === "object") ? (root.error as Record<string, unknown>) : null;
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return message || fallback;
}

export default function DebugUnifiedPage() {
  const [mode, setMode] = useState<"merged" | "integrated">("merged");
  const [kind, setKind] = useState<"deposit" | "saving">("deposit");
  const [includeFinlife, setIncludeFinlife] = useState(true);
  const [includeKdb, setIncludeKdb] = useState(true);
  const [limit, setLimit] = useState(200);
  const [q, setQ] = useState("");
  const [qMode, setQMode] = useState<"contains" | "prefix">("contains");

  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyUpdated, setOnlyUpdated] = useState(false);
  const [onlyTouched, setOnlyTouched] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(7);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [refreshStaleSources, setRefreshStaleSources] = useState(true);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [kdbOnlyRows, setKdbOnlyRows] = useState<KdbOnlyRow[]>([]);
  const [unifiedSourceCounts, setUnifiedSourceCounts] = useState<Record<string, number>>({});
  const [coverage, setCoverage] = useState<CoverageInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const nextCursorRef = useRef<string | null>(null);

  const includeSources = useMemo(() => {
    const out: string[] = [];
    if (includeFinlife) out.push("finlife");
    if (includeKdb) out.push("datago_kdb");
    return out;
  }, [includeFinlife, includeKdb]);

  const singleSourceId = includeSources.length === 1 ? includeSources[0] : null;

  const reload = useCallback(async (append = false) => {
    requestSeqRef.current += 1;
    const requestSeq = requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      if (!append) {
        const statusRes = await fetch("/api/sources/status", { cache: "no-store", signal: controller.signal });
        const statusJson = await statusRes.json();
        if (!statusRes.ok) {
          throw new Error(readApiErrorMessage(statusJson, "소스 상태를 불러오지 못했습니다."));
        }
        const statusData = Array.isArray(statusJson?.data) ? statusJson.data : [];
        if (requestSeq === requestSeqRef.current) {
          setStatuses(statusData as StatusRow[]);
        }
      }

      const params = new URLSearchParams();
      params.set("mode", mode);
      params.set("kind", kind);
      params.set("debug", "1");
      params.set("includeSources", includeSources.join(","));
      params.set("includeTimestamps", "1");
      params.set("limit", String(limit));
      params.set("sort", "recent");
      if (refreshStaleSources) params.set("refresh", "1");
      if (q.trim().length >= 2) params.set("q", q.trim());
      params.set("qMode", qMode);
      if (mode === "integrated" && kind === "deposit" && includeKdb) {
        params.set("includeKdbOnly", "1");
      }
      if (singleSourceId) params.set("sourceId", singleSourceId);
      if (mode === "merged" && append && singleSourceId && nextCursorRef.current) params.set("cursor", nextCursorRef.current);

      const unifiedRes = await fetch(`/api/products/unified?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const unifiedJson = await unifiedRes.json();
      if (!unifiedRes.ok || unifiedJson?.ok === false) {
        throw new Error(readApiErrorMessage(unifiedJson, "통합 목록을 불러오지 못했습니다."));
      }
      const items = Array.isArray(unifiedJson?.data?.items)
        ? unifiedJson.data.items
        : (Array.isArray(unifiedJson?.data?.merged) ? unifiedJson.data.merged : []);
      const pageInfo = (unifiedJson?.data?.pageInfo ?? null) as UnifiedPageInfo | null;
      const sourceMap = ((unifiedJson?.data?.sources ?? {}) as UnifiedSourcesMap) ?? {};
      const coverageInfo = (unifiedJson?.coverage ?? null) as CoverageInfo | null;
      const diagnosticsInfo = (unifiedJson?.diagnostics ?? null) as DiagnosticsInfo | null;
      const extrasKdbOnly = Array.isArray(unifiedJson?.data?.extras?.kdbOnly)
        ? (unifiedJson.data.extras.kdbOnly as KdbOnlyRow[])
        : [];
      if (requestSeq === requestSeqRef.current) {
        const next = items as UnifiedRow[];
        setRows((prev) => (append ? [...prev, ...next] : next));
        setKdbOnlyRows(extrasKdbOnly);
        setCoverage(coverageInfo);
        setDiagnostics(diagnosticsInfo);
        const nextCursorValue = typeof pageInfo?.nextCursor === "string" ? pageInfo.nextCursor : null;
        nextCursorRef.current = nextCursorValue;
        setNextCursor(nextCursorValue);
        setHasMore(mode === "merged" ? Boolean(pageInfo?.hasMore) : false);
        const nextCounts: Record<string, number> = {};
        for (const [sourceId, bucket] of Object.entries(sourceMap)) {
          const count = typeof bucket?.count === "number" ? bucket.count : NaN;
          if (Number.isFinite(count)) {
            nextCounts[sourceId] = count;
          }
        }
        setUnifiedSourceCounts(nextCounts);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error && error.message ? error.message : "데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
      setError(message);
      setUnifiedSourceCounts({});
      setCoverage(null);
      setDiagnostics(null);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [includeKdb, includeSources, kind, limit, mode, q, qMode, refreshStaleSources, singleSourceId]);

  const runSmokeSync = useCallback(async () => {
    setSyncing(true);
    setSyncError("");
    setSyncMessage("");
    try {
      const response = await fetch("/api/sync/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as { ok?: boolean; reportPath?: string | null; error?: { message?: string } };
      if (!response.ok || !json.ok) {
        setSyncError(json.error?.message ?? "스모크 업데이트에 실패했습니다.");
        return;
      }
      setSyncMessage("스모크 업데이트를 완료했습니다.");
      nextCursorRef.current = null;
      setNextCursor(null);
      setHasMore(false);
      await reload(false);
    } catch {
      setSyncError("스모크 업데이트에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }, [reload]);

  useEffect(() => {
    nextCursorRef.current = null;
    setNextCursor(null);
    setHasMore(false);
    void reload(false);
  }, [reload]);

  useEffect(() => {
    if (!autoRefresh) return;
    const ms = Math.max(5000, refreshSeconds * 1000);
    const timer = setInterval(() => {
      nextCursorRef.current = null;
      setNextCursor(null);
      setHasMore(false);
      void reload(false);
    }, ms);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshSeconds, reload]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startedAtMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of statuses) {
      const startedAtMs = toMs(row.lastRun?.startedAt ?? null);
      if (startedAtMs === null) continue;
      map.set(`${row.sourceId}:${row.kind}`, startedAtMs);
    }
    return map;
  }, [statuses]);

  const decorated = useMemo(() => {
    return rows.map((row) => {
      const baseMs = startedAtMap.get(`${row.sourceId}:${kind}`) ?? null;
      const firstMs = toMs(row.firstSeenAt);
      const updatedMs = toMs(row.updatedAt);
      const lastSeenMs = toMs(row.lastSeenAt);

      const isNew = baseMs !== null && firstMs !== null && firstMs >= baseMs;
      const isUpdated = baseMs !== null && updatedMs !== null && updatedMs >= baseMs && !(firstMs !== null && firstMs >= baseMs);
      const isTouched = baseMs !== null && lastSeenMs !== null && lastSeenMs >= baseMs;

      return { ...row, isNew, isUpdated, isTouched };
    });
  }, [rows, startedAtMap, kind]);

  const filtered = useMemo(() => {
    return decorated.filter((row) => {
      if (onlyNew && !row.isNew) return false;
      if (onlyUpdated && !row.isUpdated) return false;
      if (onlyTouched && !row.isTouched) return false;
      return true;
    });
  }, [decorated, onlyNew, onlyUpdated, onlyTouched]);

  const statusCards = useMemo(() => {
    return statuses
      .filter((row) => row.kind === kind)
      .map((row) => {
        const sourceCount = typeof unifiedSourceCounts[row.sourceId] === "number" ? unifiedSourceCounts[row.sourceId] : null;
        const totalCount = typeof row.lastRun?.totalCount === "number" && row.lastRun.totalCount > 0
          ? row.lastRun.totalCount
          : (sourceCount !== null && sourceCount > 0 ? sourceCount : null);
        const progressPct = totalCount ? Math.min(100, (row.counts / totalCount) * 100) : null;
        const remaining = totalCount ? Math.max(0, totalCount - row.counts) : null;
        return { row, totalCount, progressPct, remaining };
      });
  }, [statuses, kind, unifiedSourceCounts]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">통합 디버그 보기</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value === "integrated" ? "integrated" : "merged")}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            >
              <option value="merged">merged</option>
              <option value="integrated">integrated</option>
            </select>
          </label>
          <label className="text-sm">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "deposit" | "saving")}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            >
              <option value="deposit">deposit</option>
              <option value="saving">saving</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={includeFinlife} onChange={(e) => setIncludeFinlife(e.target.checked)} />FINLIFE</label>
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={includeKdb} onChange={(e) => setIncludeKdb(e.target.checked)} />KDB</label>

          <label className="text-sm">
            Limit
            <input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 200)))}
              className="ml-2 w-24 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Search
            <input
              type="text"
              value={q}
              placeholder="기관/상품명 (2글자 이상)"
              onChange={(e) => setQ(e.target.value)}
              className="ml-2 w-56 rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            qMode
            <select
              value={qMode}
              onChange={(e) => setQMode(e.target.value === "prefix" ? "prefix" : "contains")}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            >
              <option value="contains">contains (slow)</option>
              <option value="prefix">prefix (fast)</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={refreshStaleSources}
              onChange={(e) => setRefreshStaleSources(e.target.checked)}
            />
            stale 자동 동기화(refresh=1)
          </label>

          <button
            type="button"
            onClick={() => {
              nextCursorRef.current = null;
              setNextCursor(null);
              setHasMore(false);
              void reload(false);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runSmokeSync()}
            disabled={syncing || loading}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "스모크 업데이트 중..." : "스모크 업데이트"}
          </button>
          <button
            type="button"
            disabled={mode !== "merged" || !singleSourceId || !hasMore || autoRefresh || loading}
            onClick={() => void reload(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load more
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />NEW only</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyUpdated} onChange={(e) => setOnlyUpdated(e.target.checked)} />UPDATED only</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyTouched} onChange={(e) => setOnlyTouched(e.target.checked)} />TOUCHED only</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />Auto refresh</label>
          <label className="text-sm">
            Interval
            <select
              value={refreshSeconds}
              disabled={!autoRefresh}
              onChange={(e) => setRefreshSeconds(Number(e.target.value) || 7)}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              <option value={5}>5s</option>
              <option value={7}>7s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
            </select>
          </label>
          {mode === "merged" && !singleSourceId ? (
            <span className="text-amber-700">커서 페이징은 단일 소스 선택 시만 지원합니다. (멀티 소스: limit/q)</span>
          ) : null}
          {mode === "integrated" ? (
            <span className="text-slate-500">integrated: finlife canonical 기준으로 KDB를 배지로 통합하고 중복 행을 제거합니다.</span>
          ) : null}
          {singleSourceId && autoRefresh ? (
            <span className="text-slate-500">Auto refresh ON: 매 주기 첫 페이지로 재로딩됩니다.</span>
          ) : null}
          {syncMessage ? <span className="text-emerald-700">{syncMessage}</span> : null}
          {syncError ? <span className="text-rose-700">{syncError}</span> : null}
          <span className="text-slate-500">rows: {filtered.length}</span>
          {singleSourceId ? <span className="text-slate-500">nextCursor: {nextCursor ? "yes" : "none"}</span> : null}
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {statusCards.map(({ row, totalCount, progressPct, remaining }) => (
            <article key={`${row.sourceId}:${row.kind}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <SourceBadge sourceId={row.sourceId} />
                <span className={row.isFresh ? "text-emerald-700" : "text-amber-700"}>{row.isFresh ? "fresh" : "stale"}</span>
              </div>
              {totalCount && progressPct !== null ? (
                <div className="mb-2">
                  <div className="mb-1 h-2 w-full rounded bg-slate-200">
                    <div className="h-2 rounded bg-slate-600" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="text-xs text-slate-700">
                    Synced: {row.counts} / {totalCount} ({progressPct.toFixed(2)}%)
                  </div>
                  <div className="text-xs text-slate-500">Remaining: {remaining}</div>
                </div>
              ) : (
                <div className="mb-2 text-xs text-slate-500">totalCount: N/A</div>
              )}
              <div>count: {row.counts}</div>
              <div>lastSyncedAt: {fmtTs(row.lastSyncedAt)}</div>
              <div>lastAttemptAt: {fmtTs(row.lastAttemptAt)}</div>
              <div>run started: {fmtTs(row.lastRun?.startedAt)}</div>
              <div>run created/updated/touched: {row.lastRun?.createdItems ?? 0}/{row.lastRun?.updatedItems ?? 0}/{row.lastRun?.touchedItems ?? 0}</div>
              {row.lastError?.message ? <div className="mt-1 text-rose-700">error: {row.lastError.message}</div> : null}
            </article>
          ))}
      </section>

      {coverage ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">매칭 커버리지</h2>
          <p className="mt-1 text-sm text-slate-700">
            KDB {coverage.kdbBadged}/{coverage.totalProducts}
          </p>
          {diagnostics?.providerIndex ? (
            <p className="mt-2 text-xs text-slate-600">
              provider index: finlife {diagnostics.providerIndex.finlifeProviders} · kdb {diagnostics.providerIndex.kdbProvidersIndexed}
            </p>
          ) : null}
          {diagnostics?.matchSummary ? (
            <div className="mt-2 text-xs text-slate-600">
              <p>KDB match: exact {diagnostics.matchSummary.kdb.byExact}, normalized {diagnostics.matchSummary.kdb.byNormalized}, fuzzy {diagnostics.matchSummary.kdb.byFuzzy}, none {diagnostics.matchSummary.kdb.none}</p>
            </div>
          ) : null}
          {includeKdb && diagnostics?.providerIndex && diagnostics.providerIndex.kdbProvidersIndexed <= 2 ? (
            <p className="mt-2 text-xs text-amber-700">
              KDB 원천 데이터는 단일 기관 중심이라 FINLIFE 전체 대비 커버리지가 낮아도 정상일 수 있습니다. 필요하면 KDB 동기화 기간을 넓혀서 비교하세요.
            </p>
          ) : null}
          {Array.isArray(diagnostics?.unmatchedProviders) && diagnostics.unmatchedProviders.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">미매칭 기관 상위 목록</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {diagnostics.unmatchedProviders.map((row) => (
                  <li key={`unmatched-${row.providerName}`}>{row.providerName} ({row.count})</li>
                ))}
              </ul>
            </details>
          ) : null}
          {Array.isArray(diagnostics?.notes) && diagnostics.notes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-700">
              {diagnostics.notes.map((note) => (
                <li key={`diag-note-${note}`}>{note}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {mode === "integrated" && kdbOnlyRows.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">KDB only (미매칭) · {kdbOnlyRows.length}건</h2>
          <p className="mt-1 text-xs text-slate-500">finlife canonical에 매칭되지 않은 KDB 상품입니다.</p>
          <div className="mt-3 grid gap-2">
            {kdbOnlyRows.map((row) => (
              <article key={`kdb-only-${row.externalKey}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{row.providerName || "-"} · {row.productName || "-"}</p>
                <p className="mt-1 text-xs text-slate-600">{row.summary || "-"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Flags</th>
              <th className="px-3 py-2">firstSeenAt</th>
              <th className="px-3 py-2">updatedAt</th>
              <th className="px-3 py-2">lastSeenAt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const rowClass = row.isNew
                ? "border-l-4 border-emerald-500 bg-emerald-50"
                : row.isUpdated
                  ? "border-l-4 border-amber-500 bg-amber-50"
                  : "";
              return (
                <tr key={`${row.sourceId}:${row.externalKey}`} className={`border-t border-slate-100 ${rowClass}`}>
                  <td className="px-3 py-2"><SourceBadge sourceId={row.sourceId} /></td>
                  <td className="px-3 py-2">{row.providerName || "-"}</td>
                  <td className="px-3 py-2">
                    <div>{row.productName || "-"}</div>
                    {Array.isArray(row.badges) && row.badges.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.badges.map((badge) => (
                          <span key={`${row.externalKey}-${badge}`} className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px]">
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2"><RowFlags isNew={row.isNew} isUpdated={row.isUpdated} isTouched={row.isTouched} /></td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtTs(row.firstSeenAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtTs(row.updatedAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtTs(row.lastSeenAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {loading ? <p className="text-sm text-slate-500">불러오는 중...</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </main>
  );
}
