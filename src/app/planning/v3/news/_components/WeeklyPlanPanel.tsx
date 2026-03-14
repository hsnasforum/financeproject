"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { cn } from "@/lib/utils";

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
    <Card className="rounded-[2.5rem] p-8 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <SubSectionHeader
          title="주간 모니터링 계획"
          description="이번 주 집중적으로 살펴볼 토픽과 지표 ID를 관리합니다."
          className="mb-0"
        />
        <div className="text-right space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">마지막 저장: {formatDateTime(savedAt)}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">주차 시작: {asString(weekOf) || "-"}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">토픽 ID 리스트</span>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full tabular-nums">COUNT {topicCount}</span>
          </div>
          <textarea
            value={topicsText}
            onChange={(event) => setTopicsText(event.target.value)}
            rows={5}
            placeholder="예: rates, inflation, fx"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all"
            disabled={loading || saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">지표 Series ID 리스트</span>
            <span className="text-[10px] font-black text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full tabular-nums">COUNT {seriesCount}</span>
          </div>
          <textarea
            value={seriesText}
            onChange={(event) => setSeriesText(event.target.value)}
            rows={5}
            placeholder="예: kr_base_rate, kr_usdkrw"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all"
            disabled={loading || saving}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-6">
        <div className="flex-1 min-w-[200px]">
          {errorMessage ? <p className="text-xs font-bold text-rose-600">❌ {errorMessage}</p> : null}
          {notice ? <p className="text-xs font-bold text-emerald-600">✅ {notice}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 transition-all"
            disabled={loading || saving}
          >
            기존 계획 불러오기
          </button>
          <button
            type="button"
            onClick={() => void savePlan()}
            className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60 shadow-sm transition-all"
            disabled={loading || saving}
          >
            {saving ? "저장 중..." : "주간 계획 저장"}
          </button>
        </div>
      </div>
    </Card>
  );
}
