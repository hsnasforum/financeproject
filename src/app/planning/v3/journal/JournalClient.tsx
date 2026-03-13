"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { reportHeroActionLinkClassName, ReportHeroCard, ReportHeroStatCard, ReportHeroStatGrid } from "@/components/ui/ReportTone";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type NewsScenarioPack } from "@/lib/news/types";

type JournalClientProps = {
  csrf?: string;
};

type JournalImpactSnapshot = {
  scenarioId: string;
  cashflowRisk: "High" | "Med" | "Low" | "Unknown";
  debtServiceRisk: "High" | "Med" | "Low" | "Unknown";
  inflationPressureRisk: "High" | "Med" | "Low" | "Unknown";
  fxPressureRisk: "High" | "Med" | "Low" | "Unknown";
  incomeRisk: "High" | "Med" | "Low" | "Unknown";
  bufferAdequacy: "High" | "Med" | "Low" | "Unknown";
};

type JournalEntry = {
  id: string;
  date: string;
  observations: string[];
  assumptions: string[];
  chosenOptions: string[];
  followUpChecklist: string[];
  linkedItems: string[];
  linkedIndicators: string[];
  linkedScenarioIds: string[];
  impactSnapshot: JournalImpactSnapshot[];
  watchSeriesIds: string[];
  createdAt: string;
  updatedAt: string;
};

type JournalListResponse = {
  ok?: boolean;
  entries?: JournalEntry[];
  error?: {
    message?: string;
  };
};

type JournalWriteResponse = {
  ok?: boolean;
  entry?: JournalEntry;
  error?: {
    message?: string;
  };
};

type ScenarioResponse = {
  ok?: boolean;
  data?: NewsScenarioPack | null;
};

type RoutineItem = {
  id: string;
  label: string;
  checked: boolean;
};

type DailyRoutineChecklist = {
  date: string;
  savedAt?: string | null;
  items: RoutineItem[];
};

type RoutineResponse = {
  ok?: boolean;
  checklist?: DailyRoutineChecklist;
  error?: {
    message?: string;
  };
};

type DraftState = {
  date: string;
  observations: string;
  assumptions: string;
  chosenOptions: string;
  followUpChecklist: string;
  linkedItems: string;
  linkedIndicators: string;
  selectedScenarioIds: string[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function todayKstString(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function parseLineList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/\r?\n|,/g)) {
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = asString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function emptyDraft(): DraftState {
  return {
    date: todayKstString(),
    observations: "",
    assumptions: "",
    chosenOptions: "",
    followUpChecklist: "",
    linkedItems: "",
    linkedIndicators: "",
    selectedScenarioIds: [],
  };
}

function gradeLabel(value: JournalImpactSnapshot[keyof JournalImpactSnapshot] | string): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "상";
  if (normalized === "med" || normalized === "medium") return "중";
  if (normalized === "low") return "하";
  return "unknown";
}

function countNonEmptyLines(value: string): number {
  return parseLineList(value).length;
}

export function JournalClient({ csrf }: JournalClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineSaving, setRoutineSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [entriesLoadError, setEntriesLoadError] = useState("");
  const [scenarioLoadError, setScenarioLoadError] = useState("");
  const [routineErrorMessage, setRoutineErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [routineNotice, setRoutineNotice] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [scenarios, setScenarios] = useState<NewsScenarioPack | null>(null);
  const [routine, setRoutine] = useState<DailyRoutineChecklist | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  const load = useCallback(async () => {
    setLoading(true);
    setEntriesLoadError("");
    setScenarioLoadError("");
    try {
      const [entriesRes, scenariosRes] = await Promise.all([
        fetch("/api/planning/v3/journal/entries", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
        fetch("/api/planning/v3/news/scenarios", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
      ]);

      const entriesPayload = (await entriesRes.json().catch(() => null)) as JournalListResponse | null;
      const scenariosPayload = (await scenariosRes.json().catch(() => null)) as ScenarioResponse | null;

      if (!entriesRes.ok || entriesPayload?.ok !== true) {
        throw new Error(entriesPayload?.error?.message ?? `HTTP ${entriesRes.status}`);
      }

      setEntries(entriesPayload.entries ?? []);
      if (scenariosRes.ok && scenariosPayload?.ok === true) {
        setScenarios(scenariosPayload.data ?? null);
        setScenarioLoadError("");
      } else {
        setScenarios(null);
        setScenarioLoadError("연결 시나리오를 불러오지 못했습니다. 저장된 저널은 계속 확인할 수 있습니다.");
      }
    } catch (error) {
      setEntriesLoadError(error instanceof Error ? error.message : "저널을 불러오지 못했습니다.");
      setEntries([]);
      setScenarios(null);
      setScenarioLoadError("");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoutine = useCallback(async (date: string) => {
    const safeDate = asString(date);
    if (!safeDate) {
      setRoutine(null);
      return;
    }
    setRoutineLoading(true);
    setRoutineErrorMessage("");
    try {
      const response = await fetch(`/api/planning/v3/routines/daily?date=${encodeURIComponent(safeDate)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
      });
      const payload = (await response.json().catch(() => null)) as RoutineResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.checklist) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setRoutine({
        date: asString(payload.checklist.date) || safeDate,
        savedAt: asString(payload.checklist.savedAt) || null,
        items: (payload.checklist.items ?? [])
          .map((row) => ({
            id: asString(row.id),
            label: asString(row.label),
            checked: Boolean(row.checked),
          }))
          .filter((row) => row.id.length > 0 && row.label.length > 0),
      });
    } catch (error) {
      setRoutine(null);
      setRoutineErrorMessage(error instanceof Error ? error.message : "체크리스트를 불러오지 못했습니다.");
    } finally {
      setRoutineLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRoutine(draft.date);
  }, [draft.date, loadRoutine]);

  const availableScenarioIds = useMemo(() => {
    return (scenarios?.scenarios ?? []).map((row) => row.name);
  }, [scenarios]);

  const selectedScenarios = useMemo(() => {
    const set = new Set(draft.selectedScenarioIds);
    return (scenarios?.scenarios ?? []).filter((row) => set.has(row.name));
  }, [draft.selectedScenarioIds, scenarios]);

  const selectedImpactSnapshot = useMemo(() => {
    const out: JournalImpactSnapshot[] = [];
    for (const row of selectedScenarios) {
      if (!row.personalImpact) continue;
      out.push({
        scenarioId: row.name,
        cashflowRisk: row.personalImpact.cashflowRisk,
        debtServiceRisk: row.personalImpact.debtServiceRisk,
        inflationPressureRisk: row.personalImpact.inflationPressureRisk,
        fxPressureRisk: row.personalImpact.fxPressureRisk,
        incomeRisk: row.personalImpact.incomeRisk,
        bufferAdequacy: row.personalImpact.bufferAdequacy,
      });
    }
    return out;
  }, [selectedScenarios]);

  const selectedWatchSeriesIds = useMemo(() => {
    return dedupe(selectedScenarios.flatMap((row) => row.personalImpact?.watch ?? []));
  }, [selectedScenarios]);
  const routineCheckedCount = useMemo(() => {
    if (!routine) return 0;
    return routine.items.filter((row) => row.checked).length;
  }, [routine]);
  const latestEntry = entries[0] ?? null;
  const savedEntriesValue = loading ? "확인 중" : (entriesLoadError ? "확인 필요" : `${entries.length}건`);
  const savedEntriesDescription = loading
    ? "저장된 기록을 불러오는 중입니다."
    : entriesLoadError
      ? "저장 상태를 확인하지 못했습니다."
      : `최근 업데이트 ${formatDateTime(latestEntry?.updatedAt ?? null)}`;
  const draftSummary = useMemo(() => ([
    { label: "관찰", value: countNonEmptyLines(draft.observations) },
    { label: "가정", value: countNonEmptyLines(draft.assumptions) },
    { label: "옵션", value: countNonEmptyLines(draft.chosenOptions) },
    { label: "후속 항목", value: countNonEmptyLines(draft.followUpChecklist) },
  ]), [draft.assumptions, draft.chosenOptions, draft.followUpChecklist, draft.observations]);

  function toggleScenario(id: string) {
    setDraft((prev) => {
      const set = new Set(prev.selectedScenarioIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return {
        ...prev,
        selectedScenarioIds: [...set],
      };
    });
  }

  function toggleRoutineItem(id: string) {
    setRoutine((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((row) => (row.id === id ? { ...row, checked: !row.checked } : row)),
      };
    });
    setRoutineNotice("");
  }

  async function handleSaveRoutine() {
    if (!routine || routineSaving) return;
    setRoutineSaving(true);
    setRoutineErrorMessage("");
    setRoutineNotice("");

    try {
      const payloadWithCsrf = withDevCsrf({
        checklist: {
          date: draft.date,
          items: routine.items.map((row) => ({
            id: row.id,
            checked: row.checked,
          })),
        },
      });
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/routines/daily", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });

      const payload = (await response.json().catch(() => null)) as RoutineResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.checklist) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setRoutineNotice("일일 체크리스트를 저장했습니다.");
      setRoutine({
        date: asString(payload.checklist.date) || draft.date,
        savedAt: asString(payload.checklist.savedAt) || null,
        items: (payload.checklist.items ?? [])
          .map((row) => ({
            id: asString(row.id),
            label: asString(row.label),
            checked: Boolean(row.checked),
          }))
          .filter((row) => row.id.length > 0 && row.label.length > 0),
      });
    } catch (error) {
      setRoutineErrorMessage(error instanceof Error ? error.message : "체크리스트 저장에 실패했습니다.");
    } finally {
      setRoutineSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrorMessage("");
    setNotice("");

    try {
      const payloadWithCsrf = withDevCsrf({
        entry: {
          date: draft.date,
          observations: parseLineList(draft.observations),
          assumptions: parseLineList(draft.assumptions),
          chosenOptions: parseLineList(draft.chosenOptions),
          followUpChecklist: parseLineList(draft.followUpChecklist),
          linkedItems: parseLineList(draft.linkedItems),
          linkedIndicators: parseLineList(draft.linkedIndicators),
          linkedScenarioIds: dedupe(draft.selectedScenarioIds),
          impactSnapshot: selectedImpactSnapshot,
          watchSeriesIds: selectedWatchSeriesIds,
        },
      });
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/journal/entries", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });

      const payload = (await response.json().catch(() => null)) as JournalWriteResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setNotice("저널을 저장했습니다.");
      setDraft((prev) => ({
        ...emptyDraft(),
        date: prev.date,
      }));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저널 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <ReportHeroCard
          kicker="Daily Journal"
          title="오늘 기록"
          description="뉴스를 보고 느낀 점과 대응 계획을 정리하고, 오늘 체크리스트와 연결해 저장합니다."
          action={(
            <Link href="/planning/v3/news" className={reportHeroActionLinkClassName}>
              뉴스로 돌아가기
            </Link>
          )}
        >
          <ReportHeroStatGrid>
            <ReportHeroStatCard label="오늘 체크" value={routine ? `${routineCheckedCount}/${routine.items.length}` : "-"} description="체크리스트 완료 수" />
            <ReportHeroStatCard label="연결 시나리오" value={`${draft.selectedScenarioIds.length}개`} description="개인 영향 스냅샷에 반영" />
            <ReportHeroStatCard label="저장된 기록" value={savedEntriesValue} description={savedEntriesDescription} />
            <ReportHeroStatCard label="watch series" value={`${selectedWatchSeriesIds.length}개`} description="선택 시나리오 기준" />
          </ReportHeroStatGrid>
          {notice ? <p className="text-xs font-semibold text-emerald-300">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-300">{errorMessage}</p> : null}
          {entriesLoadError ? <p className="text-xs font-semibold text-rose-300">{entriesLoadError}</p> : null}
        </ReportHeroCard>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">오늘 점검</h2>
              <p className="text-xs text-slate-500">기준일을 고르고, 먼저 체크리스트를 점검한 뒤 기록을 남기면 흐름이 단순해집니다.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-700">
                <span className="font-semibold">기준일</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, date: event.target.value }));
                    setRoutineNotice("");
                    setRoutineErrorMessage("");
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
            </div>

            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">일일 체크리스트</p>
                  <p className="text-xs text-slate-600">저널 기준일({draft.date})과 연결되며 자동 저장되지 않습니다.</p>
                  <p className="text-xs text-slate-500">마지막 저장: {formatDateTime(routine?.savedAt ?? null)}</p>
                </div>
                <button
                  type="button"
                  disabled={routineSaving || routineLoading || !routine}
                  onClick={() => { void handleSaveRoutine(); }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {routineSaving ? "저장 중..." : "체크리스트 저장"}
                </button>
              </div>
              {routineNotice ? <p className="text-xs font-semibold text-emerald-700">{routineNotice}</p> : null}
              {routineErrorMessage ? <p className="text-xs font-semibold text-rose-700">{routineErrorMessage}</p> : null}
              {routineLoading ? (
                <p className="text-xs text-slate-600">체크리스트 불러오는 중...</p>
              ) : routine && routine.items.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {routine.items.map((row) => (
                    <label key={`routine-${row.id}`} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => toggleRoutineItem(row.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      <span>{row.label}</span>
                    </label>
                  ))}
                </div>
              ) : routineErrorMessage ? null : (
                <p className="text-xs text-slate-600">체크리스트 항목이 없습니다.</p>
              )}
            </div>
          </Card>

          <Card className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">저장 전 요약</h2>
              <p className="text-xs text-slate-500">오늘 기록에 어떤 내용이 담기는지 먼저 확인하고 저장할 수 있습니다.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {draftSummary.map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{item.value}개</p>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">선택된 시나리오</p>
              <p className="mt-1 text-xs text-slate-600">{draft.selectedScenarioIds.join(", ") || "없음"}</p>
              <p className="mt-2 text-xs font-semibold text-slate-700">watch series</p>
              <p className="mt-1 text-xs text-slate-600">{selectedWatchSeriesIds.join(", ") || "없음"}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">저장될 영향 스냅샷</p>
              {selectedImpactSnapshot.length < 1 ? (
                <p className="mt-1 text-xs text-slate-500">선택한 시나리오의 개인 영향 등급이 없으면 비어 있습니다.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {selectedImpactSnapshot.map((row) => (
                    <li key={`impact-${row.scenarioId}`}>
                      {row.scenarioId}: 현금흐름 {gradeLabel(row.cashflowRisk)} · 부채 {gradeLabel(row.debtServiceRisk)} · 물가 {gradeLabel(row.inflationPressureRisk)} · 환율 {gradeLabel(row.fxPressureRisk)} · 소득 {gradeLabel(row.incomeRisk)} · 완충 {gradeLabel(row.bufferAdequacy)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">저널 작성</h2>
            <p className="text-xs text-slate-500">생각 정리, 실행 선택, 근거 연결을 순서대로 채우면 기록이 읽기 쉬워집니다.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">상황 정리</p>
                <div className="mt-3 grid gap-3">
                  <TextareaField
                    label="관찰"
                    placeholder="뉴스/지표 관찰 내용을 줄바꿈으로 입력"
                    value={draft.observations}
                    onChange={(value) => setDraft((prev) => ({ ...prev, observations: value }))}
                  />
                  <TextareaField
                    label="가정"
                    placeholder="시나리오 가정"
                    value={draft.assumptions}
                    onChange={(value) => setDraft((prev) => ({ ...prev, assumptions: value }))}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">대응 계획</p>
                <div className="mt-3 grid gap-3">
                  <TextareaField
                    label="선택 옵션"
                    placeholder="방어/균형/공격 등 선택 옵션"
                    value={draft.chosenOptions}
                    onChange={(value) => setDraft((prev) => ({ ...prev, chosenOptions: value }))}
                  />
                  <TextareaField
                    label="후속 체크리스트"
                    placeholder="다음 점검 항목"
                    value={draft.followUpChecklist}
                    onChange={(value) => setDraft((prev) => ({ ...prev, followUpChecklist: value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">근거 연결</p>
                <div className="mt-3 grid gap-3">
                  <TextareaField
                    label="연결 기사 링크"
                    placeholder="URL 또는 아이템 ID"
                    value={draft.linkedItems}
                    onChange={(value) => setDraft((prev) => ({ ...prev, linkedItems: value }))}
                  />
                  <TextareaField
                    label="연결 지표"
                    placeholder="seriesId 목록"
                    value={draft.linkedIndicators}
                    onChange={(value) => setDraft((prev) => ({ ...prev, linkedIndicators: value }))}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">연결 시나리오</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scenarioLoadError ? (
                    <p className="text-xs font-semibold text-rose-700">{scenarioLoadError}</p>
                  ) : availableScenarioIds.length < 1 ? (
                    <p className="text-xs text-slate-500">시나리오 데이터가 없어서 영향 스냅샷 연결은 비활성입니다.</p>
                  ) : availableScenarioIds.map((id) => {
                    const selected = draft.selectedScenarioIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleScenario(id)}
                        className={`rounded border px-2 py-1 text-xs font-semibold ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                      >
                        {id}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => { void handleSave(); }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저널 저장"}
            </button>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">저장된 엔트리</h2>
            <p className="text-xs text-slate-500">최근 기록이 위로 옵니다.</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : entriesLoadError ? (
            <p className="text-sm text-slate-600">저장된 엔트리를 다시 불러오지 못했습니다.</p>
          ) : entries.length < 1 ? (
            <p className="text-sm text-slate-600">저장된 엔트리가 없습니다.</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{entry.date}</p>
                    <p className="text-xs text-slate-500">업데이트: {formatDateTime(entry.updatedAt)}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-700">시나리오 연결 {entry.linkedScenarioIds.length}건 · watch {entry.watchSeriesIds.length}건</p>
                  {entry.observations.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-600">{entry.observations.slice(0, 2).join(" / ")}</p>
                  ) : null}
                  {entry.impactSnapshot.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {entry.impactSnapshot.slice(0, 3).map((row) => (
                        <li key={`${entry.id}-${row.scenarioId}`}>
                          {row.scenarioId}: 부채 {gradeLabel(row.debtServiceRisk)} · 물가 {gradeLabel(row.inflationPressureRisk)} · 환율 {gradeLabel(row.fxPressureRisk)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function TextareaField(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-slate-700">
      <span className="font-semibold">{props.label}</span>
      <textarea
        rows={4}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
      />
    </label>
  );
}
