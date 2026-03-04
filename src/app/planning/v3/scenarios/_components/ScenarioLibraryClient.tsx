"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type ScenarioLibraryClientProps = {
  csrf?: string;
};

type ScenarioRow = {
  topicId: string;
  topicLabel: string;
  defaultEnabled: boolean;
  defaultOrder: number;
  overrideEnabled: boolean | null;
  overrideOrder: number | null;
  effectiveEnabled: boolean;
  effectiveOrder: number;
};

type ScenarioGetResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
    rows?: ScenarioRow[];
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type ScenarioPostResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
    rows?: ScenarioRow[];
    overrideCount?: number;
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type ScenarioDraftRow = {
  topicId: string;
  topicLabel: string;
  enabled: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const parsed = Date.parse(asString(value));
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function rowsToDraft(rows: ScenarioRow[]): ScenarioDraftRow[] {
  return rows
    .slice()
    .sort((a, b) => a.effectiveOrder - b.effectiveOrder || a.topicId.localeCompare(b.topicId))
    .map((row) => ({
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      enabled: row.effectiveEnabled,
    }));
}

export function ScenarioLibraryClient({ csrf }: ScenarioLibraryClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [draftRows, setDraftRows] = useState<ScenarioDraftRow[]>([]);
  const [initialRowsJson, setInitialRowsJson] = useState("[]");

  const dirty = useMemo(() => JSON.stringify(draftRows) !== initialRowsJson, [draftRows, initialRowsJson]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/planning/v3/scenarios/library", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
      });
      const payload = (await response.json().catch(() => null)) as ScenarioGetResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const nextRows = rowsToDraft(payload.data.rows ?? []);
      setUpdatedAt(payload.data.updatedAt ?? null);
      setDraftRows(nextRows);
      setInitialRowsJson(JSON.stringify(nextRows));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "시나리오 라이브러리를 불러오지 못했습니다.");
      setUpdatedAt(null);
      setDraftRows([]);
      setInitialRowsJson("[]");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function moveRow(index: number, direction: -1 | 1) {
    setDraftRows((prev) => {
      const nextIndex = index + direction;
      if (index < 0 || index >= prev.length) return prev;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = prev.slice();
      const [picked] = next.splice(index, 1);
      next.splice(nextIndex, 0, picked);
      return next;
    });
  }

  function setEnabled(index: number, value: boolean) {
    setDraftRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, enabled: value } : row)));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = withDevCsrf({
        items: draftRows.map((row, index) => ({
          topicId: row.topicId,
          enabled: row.enabled,
          order: index,
        })),
      });
      if (!body.csrf && asString(csrf)) body.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/scenarios/library", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as ScenarioPostResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const nextRows = rowsToDraft(payload.data.rows ?? []);
      setDraftRows(nextRows);
      setInitialRowsJson(JSON.stringify(nextRows));
      setUpdatedAt(payload.data.updatedAt ?? null);
      setNotice(`저장 완료: 오버라이드 ${Math.max(0, Number(payload.data.overrideCount ?? 0))}건`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "시나리오 라이브러리 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 시나리오 라이브러리</h1>
              <p className="text-sm text-slate-600">SSOT 템플릿의 활성화와 순서를 로컬 오버라이드로 관리합니다.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                뉴스로 이동
              </Link>
              <button
                type="button"
                disabled={loading || saving || !dirty}
                onClick={() => { void handleSave(); }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">마지막 저장 시각: {formatDateTime(updatedAt)}</p>
          <p className="text-xs text-slate-500">자동 저장은 비활성화되어 있으며, 저장 버튼으로만 반영됩니다.</p>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">템플릿 목록</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : draftRows.length < 1 ? (
            <p className="text-sm text-slate-600">표시할 템플릿이 없습니다.</p>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-2">순서</th>
                    <th className="px-2 py-2">토픽</th>
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2">활성</th>
                    <th className="px-2 py-2">이동</th>
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row, index) => (
                    <tr key={`scenario-library-${row.topicId}`} className="border-t border-slate-200 text-slate-700">
                      <td className="px-2 py-2 font-mono text-xs">{index + 1}</td>
                      <td className="px-2 py-2 font-semibold">{row.topicLabel}</td>
                      <td className="px-2 py-2 font-mono text-xs">{row.topicId}</td>
                      <td className="px-2 py-2">
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(event) => setEnabled(index, event.target.checked)}
                          />
                          {row.enabled ? "활성" : "비활성"}
                        </label>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                            disabled={index === 0}
                            onClick={() => moveRow(index, -1)}
                          >
                            위
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40"
                            disabled={index >= draftRows.length - 1}
                            onClick={() => moveRow(index, 1)}
                          >
                            아래
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
