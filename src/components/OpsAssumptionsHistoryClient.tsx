"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DevUnlockShortcutLink } from "@/components/DevUnlockShortcutLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";
import { type AssumptionsSnapshot } from "@/lib/planning/assumptions/types";

type HistoryItem = {
  id: string;
  asOf?: string;
  fetchedAt: string;
  warningsCount: number;
  sourcesCount: number;
  korea: AssumptionsSnapshot["korea"];
};

type HistoryListPayload = {
  ok?: boolean;
  items?: HistoryItem[];
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type SnapshotDetailPayload = {
  ok?: boolean;
  snapshotId?: string;
  snapshot?: AssumptionsSnapshot;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type SetLatestPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsAssumptionsHistoryClientProps = {
  csrf: string;
};

const DIFF_FIELDS: Array<{ key: keyof AssumptionsSnapshot["korea"]; label: string }> = [
  { key: "policyRatePct", label: "Policy Rate" },
  { key: "callOvernightPct", label: "Call Overnight" },
  { key: "cd91Pct", label: "CD 91D" },
  { key: "koribor3mPct", label: "KORIBOR 3M" },
  { key: "msb364Pct", label: "MSB 364D" },
  { key: "baseRatePct", label: "Base Rate" },
  { key: "cpiYoYPct", label: "CPI YoY" },
  { key: "coreCpiYoYPct", label: "Core CPI YoY" },
  { key: "newDepositAvgPct", label: "New Deposit Avg" },
  { key: "newLoanAvgPct", label: "New Loan Avg" },
];

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function toHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "-";
  }
}

export function OpsAssumptionsHistoryClient(props: OpsAssumptionsHistoryClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState<AssumptionsSnapshot | null>(null);
  const [selectedForDiffA, setSelectedForDiffA] = useState("");
  const [selectedForDiffB, setSelectedForDiffB] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [settingLatest, setSettingLatest] = useState(false);
  const [currentLatestId, setCurrentLatestId] = useState("");
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [errorFixHref, setErrorFixHref] = useState("");

  const hasCsrf = props.csrf.trim().length > 0;

  const loadLatestRef = useCallback(async () => {
    if (!hasCsrf) return;
    try {
      const response = await fetch(`/api/ops/assumptions/latest?csrf=${encodeURIComponent(props.csrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { snapshotId?: string } | null;
      if (response.ok && typeof payload?.snapshotId === "string") {
        setCurrentLatestId(payload.snapshotId);
      } else {
        setCurrentLatestId("");
      }
    } catch {
      setCurrentLatestId("");
    }
  }, [hasCsrf, props.csrf]);

  const loadHistory = useCallback(async () => {
    if (!hasCsrf) {
      setLoading(false);
      setError("Dev unlock/CSRF가 없어 조회할 수 없습니다.");
      setHistory([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/ops/assumptions/history?limit=30&csrf=${encodeURIComponent(props.csrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as HistoryListPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "스냅샷 히스토리 조회에 실패했습니다.");
        setErrorFixHref(apiError.fixHref ?? "");
        throw new Error(apiError.message);
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      setHistory(items);
      setErrorFixHref("");
      setSelectedId((prev) => prev || items[0]?.id || "");
      setSelectedForDiffA((prev) => prev || items[0]?.id || "");
      setSelectedForDiffB((prev) => prev || items[1]?.id || "");
    } catch (loadError) {
      setHistory([]);
      setError(loadError instanceof Error ? loadError.message : "스냅샷 히스토리 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [hasCsrf, props.csrf]);

  const loadDetail = useCallback(async (id: string) => {
    if (!hasCsrf || !id) {
      setSelectedSnapshot(null);
      return;
    }

    try {
      const response = await fetch(`/api/ops/assumptions/history/${encodeURIComponent(id)}?csrf=${encodeURIComponent(props.csrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as SnapshotDetailPayload | null;
      if (!response.ok || !payload?.ok || !payload.snapshot) {
        const apiError = resolveClientApiError(payload, "스냅샷 상세 조회에 실패했습니다.");
        setErrorFixHref(apiError.fixHref ?? "");
        throw new Error(apiError.message);
      }
      setSelectedSnapshot(payload.snapshot);
      setErrorFixHref("");
    } catch (detailError) {
      setSelectedSnapshot(null);
      setError(detailError instanceof Error ? detailError.message : "스냅샷 상세 조회 중 오류가 발생했습니다.");
    }
  }, [hasCsrf, props.csrf]);

  const selectHistoryRow = useCallback((id: string) => {
    if (!id) return;
    if (id === selectedId) {
      void loadDetail(id);
      return;
    }
    setSelectedId(id);
  }, [loadDetail, selectedId]);

  const setLatest = useCallback(async () => {
    if (!hasCsrf || !selectedId) return;
    setSettingLatest(true);
    setError("");
    setErrorFixHref("");
    setNotice("");
    try {
      const response = await fetch("/api/ops/assumptions/set-latest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf: props.csrf,
          snapshotId: selectedId,
          confirm: confirmText,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SetLatestPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "latest 포인터 변경에 실패했습니다.");
        setErrorFixHref(apiError.fixHref ?? "");
        throw new Error(apiError.message);
      }
      setNotice(payload.message ?? "latest 포인터를 변경했습니다.");
      setConfirmText("");
      await loadLatestRef();
    } catch (setLatestError) {
      setError(setLatestError instanceof Error ? setLatestError.message : "latest 포인터 변경 중 오류가 발생했습니다.");
    } finally {
      setSettingLatest(false);
    }
  }, [confirmText, hasCsrf, loadLatestRef, props.csrf, selectedId]);

  const historyById = useMemo(() => {
    const map = new Map<string, HistoryItem>();
    history.forEach((row) => map.set(row.id, row));
    return map;
  }, [history]);

  const diffRows = useMemo(() => {
    const left = historyById.get(selectedForDiffA);
    const right = historyById.get(selectedForDiffB);
    if (!left || !right) return [];

    const rows: Array<{ label: string; left: string; right: string; delta: string }> = [];
    for (const field of DIFF_FIELDS) {
      const a = left.korea[field.key];
      const b = right.korea[field.key];
      if (typeof a !== "number" && typeof b !== "number") continue;
      const delta = (typeof a === "number" ? a : 0) - (typeof b === "number" ? b : 0);
      rows.push({
        label: field.label,
        left: formatPct(a),
        right: formatPct(b),
        delta: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%p`,
      });
    }
    rows.push({
      label: "Warnings Count",
      left: String(left.warningsCount),
      right: String(right.warningsCount),
      delta: `${left.warningsCount - right.warningsCount >= 0 ? "+" : ""}${left.warningsCount - right.warningsCount}`,
    });
    return rows;
  }, [historyById, selectedForDiffA, selectedForDiffB]);

  useEffect(() => {
    void loadHistory();
    void loadLatestRef();
  }, [loadHistory, loadLatestRef]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [loadDetail, selectedId]);

  return (
    <PageShell>
      <PageHeader
        title="Assumptions History"
        description="스냅샷 히스토리 조회/비교/롤백(Set as latest) 화면입니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory()} disabled={loading}>
              {loading ? "로딩 중..." : "새로고침"}
            </Button>
            <Link href="/ops/assumptions">
              <Button type="button" variant="outline" size="sm">Assumptions</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
          </div>
        )}
      />
      {notice ? (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {notice}
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-black text-slate-900">History</h2>
        <p className="mt-2 text-sm text-slate-600">현재 latest snapshotId: <span className="font-semibold">{currentLatestId || "-"}</span></p>
        {!hasCsrf ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">
            Dev unlock/CSRF가 없어 조회/롤백이 차단됩니다.{" "}
            <DevUnlockShortcutLink className="text-amber-700" />
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-semibold text-rose-600">
            {error}
            {errorFixHref ? (
              <>
                {" "}
                <Link href={errorFixHref} className="underline">{errorFixHref}</Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">asOf</th>
                <th className="px-2 py-2">fetchedAt</th>
                <th className="px-2 py-2">Policy</th>
                <th className="px-2 py-2">CPI</th>
                <th className="px-2 py-2">Deposit</th>
                <th className="px-2 py-2">Warnings</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className={row.id === selectedId ? "bg-emerald-50" : ""}>
                  <td className="px-2 py-2 font-mono">{row.id}</td>
                  <td className="px-2 py-2">{row.asOf ?? "-"}</td>
                  <td className="px-2 py-2">{formatDateTime(row.fetchedAt)}</td>
                  <td className="px-2 py-2">{formatPct(row.korea.policyRatePct ?? row.korea.baseRatePct)}</td>
                  <td className="px-2 py-2">{formatPct(row.korea.cpiYoYPct)}</td>
                  <td className="px-2 py-2">{formatPct(row.korea.newDepositAvgPct ?? row.korea.cd91Pct)}</td>
                  <td className="px-2 py-2">{row.warningsCount}</td>
                  <td className="px-2 py-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => selectHistoryRow(row.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-black text-slate-900">Snapshot Detail</h2>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">snapshotId: <span className="font-semibold">{selectedId || "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">asOf: <span className="font-semibold">{selectedSnapshot?.asOf ?? "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">fetchedAt: <span className="font-semibold">{formatDateTime(selectedSnapshot?.fetchedAt)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">warnings: <span className="font-semibold">{selectedSnapshot?.warnings.length ?? 0}</span></div>
        </div>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
          {DIFF_FIELDS.map((field) => {
            const value = selectedSnapshot?.korea[field.key];
            if (typeof value !== "number") return null;
            return (
              <div key={field.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {field.label}: <span className="font-semibold">{formatPct(value)}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-black text-slate-900">Warnings ({selectedSnapshot?.warnings.length ?? 0})</h3>
            {selectedSnapshot?.warnings.length ? (
              <ul className="mt-2 space-y-1 text-xs text-rose-700">
                {selectedSnapshot.warnings.map((warning, index) => <li key={`${warning}-${index}`}>- {warning}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">경고 없음</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">Sources ({selectedSnapshot?.sources.length ?? 0})</h3>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                checked={showSourceDetails}
                onChange={(event) => setShowSourceDetails(event.target.checked)}
                type="checkbox"
              />
              고급 보기(소스 URL)
            </label>
            {selectedSnapshot?.sources.length ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {selectedSnapshot.sources.map((source, index) => (
                  <li key={`${source.name}-${index}`}>
                    - {source.name} ({formatDateTime(source.fetchedAt)})
                    {showSourceDetails ? ` / ${toHost(source.url)} / ${source.url}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">소스 정보 없음</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-black text-slate-900">Diff</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="font-semibold" htmlFor="diff-left">Left</label>
          <select
            id="diff-left"
            value={selectedForDiffA}
            onChange={(event) => setSelectedForDiffA(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">선택</option>
            {history.map((row) => <option key={`left-${row.id}`} value={row.id}>{row.id}</option>)}
          </select>
          <label className="font-semibold" htmlFor="diff-right">Right</label>
          <select
            id="diff-right"
            value={selectedForDiffB}
            onChange={(event) => setSelectedForDiffB(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">선택</option>
            {history.map((row) => <option key={`right-${row.id}`} value={row.id}>{row.id}</option>)}
          </select>
        </div>

        {diffRows.length > 0 ? (
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2">Field</th>
                  <th className="px-2 py-2">Left</th>
                  <th className="px-2 py-2">Right</th>
                  <th className="px-2 py-2">Delta (Left-Right)</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-2 py-2">{row.label}</td>
                    <td className="px-2 py-2">{row.left}</td>
                    <td className="px-2 py-2">{row.right}</td>
                    <td className="px-2 py-2">{row.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">비교할 스냅샷 2개를 선택하세요.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-black text-slate-900">Set As Latest</h2>
        <p className="mt-2 text-sm text-slate-600">
          confirm 입력: <span className="font-mono">SET_LATEST {selectedId || "{snapshotId}"}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:w-[420px]"
            placeholder={selectedId ? `SET_LATEST ${selectedId}` : "SET_LATEST {snapshotId}"}
          />
          <Button type="button" size="sm" onClick={() => void setLatest()} disabled={!selectedId || settingLatest || !hasCsrf}>
            {settingLatest ? "적용 중..." : "Set as latest"}
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
