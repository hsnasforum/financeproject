"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyActionLink, bodyDenseActionRowClassName } from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type DigestDay } from "@/lib/planning/v3/news/digest";
import { type NewsScenarioPack } from "@/lib/planning/v3/news/scenarios";
import { cn } from "@/lib/utils";

type NewsDigestClientProps = {
  csrf?: string;
};

type DigestResponse = {
  ok?: boolean;
  data?: DigestDay | null;
  topicContradictions?: TopicContradictionRow[];
  error?: {
    code?: string;
    message?: string;
  };
};

type ScenarioResponse = {
  ok?: boolean;
  data?: NewsScenarioPack | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type RefreshResponse = {
  ok?: boolean;
  tookMs?: number;
  error?: {
    code?: string;
    message?: string;
  };
};

type NoteTargetType = "item" | "topic" | "scenario";

type NewsNoteRecord = {
  id: string;
  targetType: NoteTargetType;
  targetId: string;
  tags: string[];
  note: string;
  createdAt: string;
};

type NotesResponse = {
  ok?: boolean;
  data?: {
    notes?: NewsNoteRecord[];
    total?: number;
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type NoteTargetDraft = {
  targetType: NoteTargetType;
  targetId: string;
  label: string;
};

type TopicContradictionGrade = "high" | "med" | "low";

type TopicContradictionRow = {
  topicId: string;
  topicLabel: string;
  contradictionGrade: TopicContradictionGrade;
  upSignals: number;
  downSignals: number;
  signalBalance: number;
  summary: string;
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

function compactUrlLabel(value: string, maxLen = 72): string {
  const raw = asString(value);
  if (!raw) return "-";

  let normalized = raw;
  try {
    const parsed = new URL(raw);
    normalized = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    normalized = raw;
  }

  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLen - 3))}...`;
}

function seriesLabelFromId(seriesId: string): string {
  const normalized = asString(seriesId).toLowerCase();
  if (normalized === "kr_usdkrw") return "원/달러 환율";
  if (normalized === "kr_base_rate") return "기준금리";
  if (normalized === "kr_m2") return "M2 통화량";
  if (normalized === "us_cpi") return "미국 CPI";
  return seriesId;
}

function formatLegacyTriggerText(value: string): string {
  const raw = asString(value);
  if (!raw) return "-";

  const converted = raw
    .replace(/pctChange\(([A-Za-z0-9_-]+)\s*,\s*(\d+)\)\s*=\s*([+\-]?\d+(?:\.\d+)?)/g, (_, seriesId: string, window: string, score: string) => {
      return `${seriesLabelFromId(seriesId)} 변화율 ${score}% (최근 ${window}구간)`;
    })
    .replace(/zscore\(([A-Za-z0-9_-]+)\s*,\s*(\d+)\)\s*=\s*([+\-]?\d+(?:\.\d+)?)/g, (_, seriesId: string, window: string, score: string) => {
      return `${seriesLabelFromId(seriesId)} 표준점수 ${score}σ (최근 ${window}구간)`;
    })
    .replace(/데이터 부족\(([A-Za-z0-9_-]+)\)/g, (_, seriesId: string) => `데이터 부족 (${seriesLabelFromId(seriesId)})`);

  return converted;
}

function triggerStatusLabel(value: string | null | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "met") return "충족";
  if (normalized === "not_met") return "미충족";
  return "데이터 부족";
}

function confidenceLabel(value: string | null | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "상";
  if (normalized === "medium") return "중";
  if (normalized === "low") return "하";
  return asString(value) || "-";
}

function impactGradeLabel(value: string | null | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "상";
  if (normalized === "med" || normalized === "medium") return "중";
  if (normalized === "low") return "하";
  return "unknown";
}

function consensusLabel(value: string | null | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "높음";
  if (normalized === "med" || normalized === "medium") return "중간";
  return "낮음";
}

function contradictionGradeLabel(value: string | null | undefined): string {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high") return "높음";
  if (normalized === "med" || normalized === "medium") return "중간";
  return "낮음";
}

function isProfileMissingImpact(value: {
  cashflowRisk?: string;
  debtServiceRisk?: string;
  inflationPressureRisk?: string;
  fxPressureRisk?: string;
  incomeRisk?: string;
  bufferAdequacy?: string;
  rationale?: string[];
} | null | undefined): boolean {
  if (!value) return true;
  const grades = [
    value.cashflowRisk,
    value.debtServiceRisk,
    value.inflationPressureRisk,
    value.fxPressureRisk,
    value.incomeRisk,
    value.bufferAdequacy,
  ].map((row) => asString(row).toLowerCase());
  const allUnknown = grades.every((row) => row === "unknown");
  if (!allUnknown) return false;
  const joined = (value.rationale ?? []).join(" ").toLowerCase();
  return joined.includes("노출 프로필");
}

function parseTagsInput(input: string): string[] {
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

function noteKey(targetType: NoteTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export function NewsDigestClient({ csrf }: NewsDigestClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeletingId, setNoteDeletingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [digest, setDigest] = useState<DigestDay | null>(null);
  const [scenarios, setScenarios] = useState<NewsScenarioPack | null>(null);
  const [topicContradictions, setTopicContradictions] = useState<TopicContradictionRow[]>([]);
  const [notes, setNotes] = useState<NewsNoteRecord[]>([]);
  const [activeTarget, setActiveTarget] = useState<NoteTargetDraft | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [advancedScenario, setAdvancedScenario] = useState<Record<string, boolean>>({});
  const [advancedTopItem, setAdvancedTopItem] = useState<Record<string, boolean>>({});

  const fetchNotes = useCallback(async () => {
    const response = await fetch("/api/planning/v3/news/notes", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-requested-with": "XMLHttpRequest",
      },
    });
    const payload = (await response.json().catch(() => null)) as NotesResponse | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
    }
    return payload.data?.notes ?? [];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [digestRes, scenarioRes] = await Promise.all([
        fetch("/api/planning/v3/news/digest", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/planning/v3/news/scenarios", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const digestPayload = (await digestRes.json().catch(() => null)) as DigestResponse | null;
      const scenarioPayload = (await scenarioRes.json().catch(() => null)) as ScenarioResponse | null;

      if (!digestRes.ok || digestPayload?.ok !== true) {
        throw new Error(digestPayload?.error?.message ?? `HTTP ${digestRes.status}`);
      }
      setDigest(digestPayload?.data ?? null);
      setTopicContradictions(digestPayload?.topicContradictions ?? []);
      setScenarios((scenarioRes.ok && scenarioPayload?.ok === true) ? (scenarioPayload.data ?? null) : null);

      try {
        const loadedNotes = await fetchNotes();
        setNotes(loadedNotes);
      } catch {
        setNotes([]);
      }
    } catch (error) {
      setDigest(null);
      setTopicContradictions([]);
      setScenarios(null);
      setNotes([]);
      setErrorMessage(error instanceof Error ? error.message : "뉴스 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [fetchNotes]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryLine = useMemo(() => {
    if (!digest) return "요약 데이터 없음";
    return digest.summary.observation;
  }, [digest]);

  const notesByTarget = useMemo(() => {
    const out = new Map<string, NewsNoteRecord[]>();
    for (const row of notes) {
      const key = noteKey(row.targetType, row.targetId);
      const bucket = out.get(key) ?? [];
      bucket.push(row);
      out.set(key, bucket);
    }
    for (const bucket of out.values()) {
      bucket.sort((left, right) => {
        const leftTs = Date.parse(left.createdAt);
        const rightTs = Date.parse(right.createdAt);
        if (leftTs !== rightTs) return rightTs - leftTs;
        return right.id.localeCompare(left.id);
      });
    }
    return out;
  }, [notes]);

  const notesForTarget = useCallback((targetType: NoteTargetType, targetId: string) => {
    return notesByTarget.get(noteKey(targetType, targetId)) ?? [];
  }, [notesByTarget]);

  const contradictionByTopic = useMemo(() => {
    const out = new Map<string, TopicContradictionRow>();
    for (const row of topicContradictions) {
      const key = asString(row.topicId).toLowerCase();
      if (!key) continue;
      out.set(key, row);
    }
    return out;
  }, [topicContradictions]);

  const strongestContradiction = useMemo(() => {
    const weight = (grade: TopicContradictionGrade): number => {
      if (grade === "high") return 3;
      if (grade === "med") return 2;
      return 1;
    };
    return [...topicContradictions].sort((a, b) => {
      const diff = weight(b.contradictionGrade) - weight(a.contradictionGrade);
      if (diff !== 0) return diff;
      if (a.signalBalance !== b.signalBalance) return b.signalBalance - a.signalBalance;
      return a.topicId.localeCompare(b.topicId);
    })[0] ?? null;
  }, [topicContradictions]);

  function focusNoteTarget(target: NoteTargetDraft) {
    setActiveTarget(target);
    setNoteText("");
    setTagsText("");
  }

  async function reloadNotes() {
    try {
      const loaded = await fetchNotes();
      setNotes(loaded);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "메모를 불러오지 못했습니다.");
    }
  }

  async function handleSaveNote() {
    if (!activeTarget) {
      setErrorMessage("메모 대상을 먼저 선택해 주세요.");
      return;
    }

    const note = noteText.trim();
    if (!note) {
      setErrorMessage("메모 내용을 입력해 주세요.");
      return;
    }

    setNoteSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const payloadWithCsrf = withDevCsrf({
        targetType: activeTarget.targetType,
        targetId: activeTarget.targetId,
        tags: parseTagsInput(tagsText),
        note,
      });
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/news/notes", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });
      const payload = (await response.json().catch(() => null)) as NotesResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      setNotice("메모를 저장했습니다.");
      setNoteText("");
      setTagsText("");
      await reloadNotes();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    setNoteDeletingId(noteId);
    setErrorMessage("");
    setNotice("");
    try {
      const payloadWithCsrf = withDevCsrf({});
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch(`/api/planning/v3/news/notes/${noteId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setNotice("메모를 삭제했습니다.");
      await reloadNotes();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "메모 삭제에 실패했습니다.");
    } finally {
      setNoteDeletingId("");
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setNotice("");
    setErrorMessage("");
    try {
      const payloadWithCsrf = withDevCsrf({});
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/news/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadWithCsrf),
      });
      const payload = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setNotice(`뉴스 갱신 완료 (${Math.round(Number(payload?.tookMs ?? 0))}ms)`);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "뉴스 갱신에 실패했습니다.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          title="News Digest"
          description="RSS 기반 로컬 뉴스 동향/시나리오 요약"
          action={(
            <div className={bodyDenseActionRowClassName}>
              <BodyActionLink href="/planning/v3/news/trends">
                트렌드 보기
              </BodyActionLink>
              <BodyActionLink href="/planning/v3/news/explore">
                탐색
              </BodyActionLink>
              <BodyActionLink href="/planning/v3/news/alerts">
                알림함
              </BodyActionLink>
              <BodyActionLink href="/planning/v3/journal">
                저널
              </BodyActionLink>
              <BodyActionLink href="/planning/v3/news/settings">
                설정
              </BodyActionLink>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => { void handleRefresh(); }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
              >
                {refreshing ? "갱신 중..." : "수동 갱신"}
              </button>
            </div>
          )}
        />

        <div className="space-y-6">
          {notice || errorMessage ? (
            <div className="px-2">
              {notice ? <p className="text-xs font-bold text-emerald-600">✅ {notice}</p> : null}
              {errorMessage ? <p className="text-xs font-bold text-rose-600">❌ {errorMessage}</p> : null}
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">마지막 생성: {formatDateTime(digest?.generatedAt)}</p>
            </div>
          ) : null}

          <Card className="rounded-[2.5rem] p-8 shadow-sm">
            <SubSectionHeader title="내 판단 메모" description="기사/토픽/시나리오 카드에서 '메모'를 눌러 대상을 선택해 주세요." />
            {!activeTarget ? (
              <div className="rounded-2xl bg-slate-50 px-6 py-8 text-center border border-dashed border-slate-200">
                <p className="text-sm font-medium text-slate-500">선택된 메모 대상이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">대상</span>
                  <span className="text-sm font-bold text-slate-900">{activeTarget.label}</span>
                </div>
                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="판단 근거/가정/리스크 메모"
                  className="h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                />
                <input
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="태그(쉼표 또는 줄바꿈)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                />
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={noteSaving}
                    onClick={() => { void handleSaveNote(); }}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
                  >
                    {noteSaving ? "저장 중..." : "메모 저장"}
                  </button>
                  <button
                    type="button"
                    disabled={noteSaving}
                    onClick={() => {
                      setActiveTarget(null);
                      setNoteText("");
                      setTagsText("");
                    }}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    대상 해제
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card className="rounded-[2.5rem] p-8 shadow-sm">
            <SubSectionHeader title="오늘의 관찰" description="뉴스 동향 기반 종합 관찰 결과입니다." />
            {loading ? (
              <p className="text-sm text-slate-500 animate-pulse">불러오는 중...</p>
            ) : (
              <p className="rounded-[2rem] bg-emerald-50/50 border border-emerald-100/50 p-6 text-sm font-bold text-emerald-900 leading-relaxed tabular-nums">{summaryLine}</p>
            )}
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">근거 링크</p>
                {digest?.summary.evidenceLinks?.length ? (
                  <ul className="space-y-2.5 text-xs">
                    {digest.summary.evidenceLinks.slice(0, 5).map((url) => (
                      <li key={url} className="min-w-0">
                        <a
                          className="block max-w-full truncate text-emerald-700 font-bold underline decoration-emerald-200 underline-offset-4 hover:decoration-emerald-500 transition-all"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={url}
                        >
                          {compactUrlLabel(url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 italic">근거 데이터 없음</p>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">체크 변수</p>
                {digest?.watchlist?.length ? (
                  <ul className="space-y-3 text-xs text-slate-700">
                    {digest.watchlist.map((row) => (
                      <li key={`${row.seriesId}-${row.label}-${row.view}`} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                        <span className="font-bold">{row.label}:</span>
                        <span className="tabular-nums text-slate-600">{row.valueSummary}</span>
                        {row.status === "unknown" ? <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">데이터 부족</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 italic">체크 변수 없음</p>
                )}
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <div className="px-2">
              <SubSectionHeader title="Top Links" description="중요도 점수가 높은 핵심 기사들입니다." />
            </div>
            {!digest?.topItems?.length ? (
              <div className="rounded-[2rem] bg-slate-50 px-6 py-12 text-center border border-dashed border-slate-200">
                <p className="text-sm font-medium text-slate-500">표시할 기사가 없습니다.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {digest.topItems.slice(0, 10).map((item) => {
                  const related = notesForTarget("item", item.url);
                  return (
                  <li key={`${item.url}-${item.publishedAt}`} className="group rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 uppercase tracking-wider">{item.topicLabel}</span>
                        <span className="text-[10px] font-bold text-slate-400">{item.sourceName}</span>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full tabular-nums">SCORE {item.score.toFixed(2)}</span>
                    </div>

                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-base font-black text-slate-900 leading-snug tracking-tight hover:text-emerald-700 transition-colors">
                      {item.title}
                    </a>

                    <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed italic">근거: {asString(item.rationale) || "기본 점수 규칙 반영"}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAdvancedTopItem((prev) => ({ ...prev, [item.url]: !prev[item.url] }))}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        {advancedTopItem[item.url] ? "상세 분석 닫기" : "상세 분석"}
                      </button>
                      <button
                        type="button"
                        onClick={() => focusNoteTarget({ targetType: "item", targetId: item.url, label: item.title })}
                        className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-[10px] font-black text-white hover:bg-slate-800 transition-colors"
                      >
                        메모 추가
                      </button>
                    </div>

                    {advancedTopItem[item.url] ? (
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-[10px] font-bold text-slate-500 tabular-nums">
                        <p>소스: {Number(item.scoreParts?.source ?? 0).toFixed(2)}</p>
                        <p>최근성: {Number(item.scoreParts?.recency ?? 0).toFixed(2)}</p>
                        <p>키워드: {Number(item.scoreParts?.keyword ?? 0).toFixed(2)}</p>
                        <p>버스트: {Number(item.scoreParts?.burst ?? 0).toFixed(2)}</p>
                        <p className="text-rose-600">편중: {Number(item.scoreParts?.diversityPenalty ?? 0).toFixed(2)}</p>
                        <p className="text-rose-600">중복: {Number(item.scoreParts?.duplicatePenalty ?? 0).toFixed(2)}</p>
                      </div>
                    ) : null}

                    {related.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-slate-50 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">연결된 메모 ({related.length})</p>
                        {related.slice(0, 2).map((row) => (
                          <div key={row.id} className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                            <p className="text-sm font-medium text-slate-700 leading-relaxed">{row.note}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {row.tags.map((tag) => (
                                <span key={`${row.id}-${tag}`} className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">#{tag}</span>
                              ))}
                              <span className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(row.createdAt)}</span>
                              <button
                                type="button"
                                disabled={noteDeletingId === row.id}
                                onClick={() => { void handleDeleteNote(row.id); }}
                                className="ml-auto text-[10px] font-black text-rose-600 hover:underline disabled:opacity-60"
                              >
                                {noteDeletingId === row.id ? "삭제 중..." : "삭제"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="px-2">
              <SubSectionHeader title="Top Topics" description="최근 기사가 급증한 주요 키워드 그룹입니다." />
            </div>
            {!digest?.topTopics?.length ? (
              <div className="rounded-[2rem] bg-slate-50 px-6 py-12 text-center border border-dashed border-slate-200">
                <p className="text-sm font-medium text-slate-500">표시할 토픽이 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {digest.topTopics.slice(0, 8).map((topic) => {
                  const related = notesForTarget("topic", topic.topicId);
                  const contradiction = contradictionByTopic.get(asString(topic.topicId).toLowerCase());
                  return (
                    <div key={topic.topicId} className="group rounded-[2rem] border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-base font-black text-slate-900 tracking-tight">{topic.topicLabel}</p>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700 uppercase tracking-wider">{topic.burstLevel}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-500 tabular-nums">
                        기사 {topic.count.toLocaleString("ko-KR")}건 · 점수 합계 {topic.scoreSum.toFixed(2)}
                      </p>
                      {contradiction ? (
                        <div className="mt-3 rounded-xl bg-rose-50/50 border border-rose-100 p-3">
                          <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1">토픽 내부 상충: {contradictionGradeLabel(contradiction.contradictionGrade)}</p>
                          <p className="text-xs font-medium text-rose-900 leading-relaxed">{contradiction.summary}</p>
                        </div>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                        <p className="text-[10px] font-black text-slate-400">
                          {related.length > 0 ? `메모 ${related.length}건` : "메모 없음"}
                        </p>
                        <button
                          type="button"
                          onClick={() => focusNoteTarget({ targetType: "topic", targetId: topic.topicId, label: topic.topicLabel })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          메모 작성
                        </button>
                      </div>

                      {related.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {related.slice(0, 1).map((row) => (
                            <div key={row.id} className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                              <p className="text-xs font-medium text-slate-700 leading-relaxed line-clamp-2">{row.note}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="px-2">
              <SubSectionHeader title="시나리오 카드" description="현재 관찰 결과에 따른 미래 재무 시나리오 요약입니다." />
            </div>
            {!scenarios?.scenarios?.length ? (
              <div className="rounded-[2rem] bg-slate-50 px-6 py-12 text-center border border-dashed border-slate-200">
                <p className="text-sm font-medium text-slate-500">분석된 시나리오가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {scenarios.scenarios.map((row) => {
                  const related = notesForTarget("scenario", row.name);
                  return (
                    <div key={row.name} id={`scenario-${row.name}`} className="group rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-sm hover:shadow-md transition-all flex flex-col">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <p className="text-lg font-black text-slate-900 tracking-tight">{row.name}</p>
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-[10px] font-black text-sky-700 uppercase tracking-wider">신뢰도 {confidenceLabel(row.confidence)}</span>
                      </div>

                      <div className="space-y-4 flex-1">
                        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">트리거 상태: {triggerStatusLabel(row.triggerStatus)}</p>
                          <p className="text-xs font-bold text-slate-700 leading-relaxed">{formatLegacyTriggerText(row.triggerSummary)}</p>
                        </div>

                        <div>
                          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">관찰</p>
                          <p className="text-xs font-medium text-slate-600 leading-relaxed">{row.observation}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">트리거 요건</p>
                            <ul className="space-y-1.5 text-[11px] text-slate-600">
                              {row.trigger.slice(0, 2).map((line) => <li key={line} className="line-clamp-2 leading-snug">• {formatLegacyTriggerText(line)}</li>)}
                            </ul>
                          </div>
                          <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">내 영향 점검</p>
                            {row.personalImpact && !isProfileMissingImpact(row.personalImpact) ? (
                              <div className="space-y-1 text-[11px] font-bold text-slate-700">
                                <p className="flex justify-between">현금흐름 <span className="text-emerald-600">{impactGradeLabel(row.personalImpact.cashflowRisk)}</span></p>
                                <p className="flex justify-between">부채상환 <span className="text-emerald-600">{impactGradeLabel(row.personalImpact.debtServiceRisk)}</span></p>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">프로필 설정 필요</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => focusNoteTarget({ targetType: "scenario", targetId: row.name, label: `${row.name} 시나리오` })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          메모 추가
                        </button>
                        <Link href="#news-digest-scenarios-all" className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest">상세 분석 ▶</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
