"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
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

export function JournalClient({ csrf }: JournalClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [routineSaving, setRoutineSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [routineErrorMessage, setRoutineErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [routineNotice, setRoutineNotice] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [scenarios, setScenarios] = useState<NewsScenarioPack | null>(null);
  const [routine, setRoutine] = useState<DailyRoutineChecklist | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
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
      setScenarios((scenariosRes.ok && scenariosPayload?.ok === true) ? (scenariosPayload.data ?? null) : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저널을 불러오지 못했습니다.");
      setEntries([]);
      setScenarios(null);
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
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 Journal</h1>
              <p className="text-sm text-slate-600">관찰/가정/옵션과 시나리오 영향 스냅샷을 명시적으로 저장합니다.</p>
            </div>
            <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
              뉴스로 돌아가기
            </Link>
          </div>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">저널 작성</h2>
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
            ) : (
              <p className="text-xs text-slate-600">체크리스트 항목이 없습니다.</p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
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

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">연결 시나리오</p>
            <div className="flex flex-wrap gap-2">
              {availableScenarioIds.length < 1 ? (
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
            <p className="mt-1 text-xs text-slate-500">watch series: {selectedWatchSeriesIds.join(", ") || "없음"}</p>
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
          <h2 className="text-sm font-bold text-slate-900">저장된 엔트리</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : entries.length < 1 ? (
            <p className="text-sm text-slate-600">저장된 엔트리가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{entry.date}</p>
                  <p className="text-xs text-slate-500">업데이트: {formatDateTime(entry.updatedAt)}</p>
                  <p className="mt-1 text-xs text-slate-700">시나리오 연결 {entry.linkedScenarioIds.length}건 · watch {entry.watchSeriesIds.length}건</p>
                  {entry.impactSnapshot.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
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
