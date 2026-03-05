"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type WeeklyPlanPanelProps = {
  csrf?: string;
};

type WeeklyPlanRecord = {
  savedAt?: string;
  weekOf?: string;
  topics?: string[];
  seriesIds?: string[];
};

type WeeklyPlanResponse = {
  ok?: boolean;
  data?: WeeklyPlanRecord | null;
  error?: {
    code?: string;
    message?: string;
  };
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

function parseListInput(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/\r?\n|,/g)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function joinList(values: string[] | undefined): string {
  if (!Array.isArray(values) || values.length < 1) return "";
  return values.join("\n");
}

export function WeeklyPlanPanel({ csrf }: WeeklyPlanPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [seriesText, setSeriesText] = useState("");

  const topicCount = useMemo(() => parseListInput(topicsText).length, [topicsText]);
  const seriesCount = useMemo(() => parseListInput(seriesText).length, [seriesText]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/weekly-plan", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as WeeklyPlanResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const plan = payload?.data ?? null;
      setSavedAt(plan?.savedAt ?? null);
      setWeekOf(asString(plan?.weekOf));
      setTopicsText(joinList(plan?.topics));
      setSeriesText(joinList(plan?.seriesIds));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "주간 계획을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePlan() {
    setSaving(true);
    setErrorMessage("");
    setNotice("");

    try {
      const response = await fetch("/api/planning/v3/news/weekly-plan", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withDevCsrf({
          csrf,
          weekOf: asString(weekOf) || undefined,
          topics: parseListInput(topicsText),
          seriesIds: parseListInput(seriesText),
        })),
      });

      const payload = (await response.json().catch(() => null)) as WeeklyPlanResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setSavedAt(payload.data.savedAt ?? null);
      setWeekOf(asString(payload.data.weekOf));
      setTopicsText(joinList(payload.data.topics));
      setSeriesText(joinList(payload.data.seriesIds));
      setNotice("주간 계획을 저장했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "주간 계획 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">주간 계획 (토픽/지표)</h2>
          <p className="text-xs text-slate-500">명시적 저장 방식이며 자동 저장은 비활성화되어 있습니다.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">저장 시각: {formatDateTime(savedAt)}</p>
          <p className="text-xs text-slate-500">주차 시작일: {asString(weekOf) || "-"}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-slate-700">
          토픽 ID 목록 (줄바꿈 또는 쉼표)
          <textarea
            value={topicsText}
            onChange={(event) => setTopicsText(event.target.value)}
            rows={5}
            placeholder="예: rates\ninflation\nfx"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            disabled={loading || saving}
          />
          <span className="text-[11px] text-slate-500">총 {topicCount.toLocaleString("ko-KR")}개</span>
        </label>

        <label className="space-y-1 text-xs font-semibold text-slate-700">
          Series ID 목록 (줄바꿈 또는 쉼표)
          <textarea
            value={seriesText}
            onChange={(event) => setSeriesText(event.target.value)}
            rows={5}
            placeholder="예: kr_base_rate\nkr_usdkrw\nkr_cpi"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            disabled={loading || saving}
          />
          <span className="text-[11px] text-slate-500">총 {seriesCount.toLocaleString("ko-KR")}개</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <div className="space-y-1">
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
            disabled={loading || saving}
          >
            다시 불러오기
          </button>
          <button
            type="button"
            onClick={() => void savePlan()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={loading || saving}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </Card>
  );
}
