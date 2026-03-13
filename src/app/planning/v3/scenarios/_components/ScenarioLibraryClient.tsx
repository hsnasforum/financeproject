"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import {
  reportHeroActionLinkClassName,
  reportHeroPrimaryActionClassName,
  ReportHeroCard,
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
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
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [draftRows, setDraftRows] = useState<ScenarioDraftRow[]>([]);
  const [initialRowsJson, setInitialRowsJson] = useState("[]");

  const dirty = useMemo(() => JSON.stringify(draftRows) !== initialRowsJson, [draftRows, initialRowsJson]);
  const enabledCount = useMemo(() => draftRows.filter((row) => row.enabled).length, [draftRows]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
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
      setLoadError(loadError instanceof Error ? loadError.message : "시나리오 라이브러리를 불러오지 못했습니다.");
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

  const saveStatusValue = loadError ? "확인 필요" : (dirty ? "변경 있음" : "저장됨");
  const saveStatusDescription = loadError
    ? "현재 오버라이드를 다시 불러와 동기화 상태를 확인해 주세요."
    : (dirty ? "저장 버튼으로 반영" : "현재 오버라이드와 동기화");
  const currentStatusValue = loading ? "불러오는 중" : (loadError ? "불러오기 실패" : "편집 가능");
  const currentStatusDescription = loading
    ? "라이브러리 상태를 확인하는 중입니다."
    : loadError
      ? "저장 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요."
      : (saving ? "저장 처리 중" : "순서와 활성화를 조정할 수 있습니다.");
  const templateCountValue = loading ? "확인 중" : (loadError ? "확인 필요" : `${draftRows.length}개`);
  const templateCountDescription = loading
    ? "시나리오 목록을 불러오는 중입니다."
    : loadError
      ? "현재 템플릿 수를 확인하지 못했습니다."
      : "현재 불러온 시나리오 수";
  const enabledCountValue = loading ? "확인 중" : (loadError ? "확인 필요" : `${enabledCount}개`);
  const enabledCountDescription = loading
    ? "활성 상태를 계산하는 중입니다."
    : loadError
      ? "활성 상태를 다시 불러와 확인해 주세요."
      : "브리핑에 반영될 활성 상태";

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
        <ReportHeroCard
          kicker="Scenario Library"
          title="시나리오 우선순위를 같은 규칙으로 관리합니다"
          description="뉴스에서 쓰는 시나리오 템플릿의 활성화와 순서를 조정해, 브리핑과 저널에서 먼저 보여줄 흐름을 정리합니다."
          action={(
            <>
              <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>
                뉴스로 이동
              </Link>
              <button
                type="button"
                disabled={loading || saving || !dirty}
                onClick={() => { void handleSave(); }}
                className={`${reportHeroPrimaryActionClassName} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </>
          )}
        >
          <p className="text-xs text-white/60">마지막 저장 시각: {formatDateTime(updatedAt)} · 자동 저장은 비활성화되어 있습니다.</p>
          <ReportHeroStatGrid>
            <ReportHeroStatCard label="전체 템플릿" value={templateCountValue} description={templateCountDescription} />
            <ReportHeroStatCard label="활성 템플릿" value={enabledCountValue} description={enabledCountDescription} />
            <ReportHeroStatCard label="저장 상태" value={saveStatusValue} description={saveStatusDescription} />
            <ReportHeroStatCard label="현재 상태" value={currentStatusValue} description={currentStatusDescription} />
          </ReportHeroStatGrid>
          {notice ? <p className="text-xs font-semibold text-emerald-300">{notice}</p> : null}
          {loadError ? <p className="text-xs font-semibold text-rose-300">{loadError}</p> : null}
          {error ? <p className="text-xs font-semibold text-rose-300">{error}</p> : null}
        </ReportHeroCard>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">템플릿 목록</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : loadError ? (
            <p className="text-sm text-slate-600">시나리오 라이브러리를 다시 불러오지 못했습니다.</p>
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2 text-xs"
                            disabled={index === 0}
                            onClick={() => moveRow(index, -1)}
                          >
                            위
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2 text-xs"
                            disabled={index >= draftRows.length - 1}
                            onClick={() => moveRow(index, 1)}
                          >
                            아래
                          </Button>
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
