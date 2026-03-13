"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyActionLink, bodyDenseActionRowClassName } from "@/components/ui/BodyTone";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type DigestDay } from "@/lib/planning/v3/news/digest";
import { type NewsScenarioPack } from "@/lib/planning/v3/news/scenarios";

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
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Digest</h1>
              <p className="text-sm text-slate-600">RSS 기반 로컬 뉴스 동향/시나리오 요약</p>
            </div>
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
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "갱신 중..." : "수동 갱신"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">마지막 생성 시각: {formatDateTime(digest?.generatedAt)}</p>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">내 판단 메모</h2>
          {!activeTarget ? (
            <p className="text-xs text-slate-600">기사/토픽/시나리오 카드에서 &quot;메모&quot;를 눌러 대상을 선택해 주세요.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-700">
                대상: <span className="font-semibold">{activeTarget.label}</span>
              </p>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="판단 근거/가정/리스크 메모"
                className="h-24 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
              <input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="태그(쉼표 또는 줄바꿈)"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={noteSaving}
                  onClick={() => { void handleSaveNote(); }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  대상 해제
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">오늘의 관찰</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">{summaryLine}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-bold text-slate-700">근거 링크</p>
              {digest?.summary.evidenceLinks?.length ? (
                <ul className="space-y-1 text-xs">
                  {digest.summary.evidenceLinks.slice(0, 5).map((url) => (
                    <li key={url} className="min-w-0">
                      <a
                        className="block max-w-full truncate text-emerald-700 underline underline-offset-2"
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
                <p className="text-xs text-slate-500">없음</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-bold text-slate-700">체크 변수</p>
              {digest?.watchlist?.length ? (
                <ul className="space-y-1 text-xs text-slate-700">
                  {digest.watchlist.map((row) => (
                    <li key={`${row.seriesId}-${row.label}-${row.view}`}>
                      - {row.label}: {row.valueSummary}
                      {row.status === "unknown" ? " (데이터 부족)" : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">없음</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Top Links</h2>
          {!digest?.topItems?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <ul className="space-y-2">
              {digest.topItems.slice(0, 10).map((item) => {
                const related = notesForTarget("item", item.url);
                return (
                <li key={`${item.url}-${item.publishedAt}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{item.topicLabel} · {item.sourceName} · 점수 {item.score.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-600">근거: {asString(item.rationale) || "기본 점수 규칙 반영"}</p>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline">
                    {item.title}
                  </a>
                  <button
                    type="button"
                    onClick={() => setAdvancedTopItem((prev) => ({ ...prev, [item.url]: !prev[item.url] }))}
                    className="mt-2 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {advancedTopItem[item.url] ? "고급 보기 닫기" : "고급 보기"}
                  </button>
                  {advancedTopItem[item.url] ? (
                    <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                      <li>소스 기여: {Number(item.scoreParts?.source ?? 0).toFixed(2)}</li>
                      <li>최근성 기여: {Number(item.scoreParts?.recency ?? 0).toFixed(2)}</li>
                      <li>키워드 기여: {Number(item.scoreParts?.keyword ?? 0).toFixed(2)}</li>
                      <li>버스트 기여: {Number(item.scoreParts?.burst ?? 0).toFixed(2)}</li>
                      <li>편중 감점: {Number(item.scoreParts?.diversityPenalty ?? 0).toFixed(2)}</li>
                      <li>중복 감점: {Number(item.scoreParts?.duplicatePenalty ?? 0).toFixed(2)}</li>
                    </ul>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-600">
                      {related.length > 0 ? `관련 메모 있음 (${related.length})` : "관련 메모 없음"}
                    </p>
                      <button
                        type="button"
                        onClick={() => focusNoteTarget({ targetType: "item", targetId: item.url, label: item.title })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        메모
                      </button>
                    </div>
                    {related.slice(0, 2).map((row) => (
                      <div key={row.id} className="mt-2 rounded-md bg-slate-50 p-2">
                        <p className="text-xs text-slate-700">{row.note}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {row.tags.map((tag) => (
                            <span key={`${row.id}-${tag}`} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">#{tag}</span>
                          ))}
                          <span className="text-[10px] text-slate-500">{formatDateTime(row.createdAt)}</span>
                          <button
                            type="button"
                            disabled={noteDeletingId === row.id}
                            onClick={() => { void handleDeleteNote(row.id); }}
                            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Top Topics</h2>
          {!digest?.topTopics?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <ul className="space-y-2">
              {digest.topTopics.slice(0, 8).map((topic) => {
                const related = notesForTarget("topic", topic.topicId);
                const contradiction = contradictionByTopic.get(asString(topic.topicId).toLowerCase());
                return (
                  <li key={topic.topicId} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{topic.topicLabel} ({topic.burstLevel})</p>
                    <p className="text-xs text-slate-600">
                      기사 수 {topic.count.toLocaleString("ko-KR")}건 · 점수 합계 {topic.scoreSum.toFixed(2)}
                    </p>
                    {contradiction ? (
                      <p className="mt-1 text-xs text-slate-600">
                        토픽 내부 상충: {contradictionGradeLabel(contradiction.contradictionGrade)} · {contradiction.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {related.length > 0 ? `관련 메모 있음 (${related.length})` : "관련 메모 없음"}
                      </p>
                      <button
                        type="button"
                        onClick={() => focusNoteTarget({ targetType: "topic", targetId: topic.topicId, label: topic.topicLabel })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        메모
                      </button>
                    </div>
                    {related.slice(0, 2).map((row) => (
                      <div key={row.id} className="mt-2 rounded-md bg-slate-50 p-2">
                        <p className="text-xs text-slate-700">{row.note}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {row.tags.map((tag) => (
                            <span key={`${row.id}-${tag}`} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">#{tag}</span>
                          ))}
                          <span className="text-[10px] text-slate-500">{formatDateTime(row.createdAt)}</span>
                          <button
                            type="button"
                            disabled={noteDeletingId === row.id}
                            onClick={() => { void handleDeleteNote(row.id); }}
                            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">시나리오 카드</h2>
          {!scenarios?.scenarios?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {scenarios.scenarios.map((row) => {
                const related = notesForTarget("scenario", row.name);
                return (
                  <div key={row.name} id={`scenario-${row.name}`} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-black text-slate-900">{row.name} (신뢰도 {confidenceLabel(row.confidence)})</p>
                    <p className="mt-1 text-xs text-slate-600">
                      트리거 상태: {triggerStatusLabel(row.triggerStatus)} · {formatLegacyTriggerText(row.triggerSummary)}
                    </p>
                    {asString(row.uncertaintyLabel) ? (
                      <p className="mt-1 text-xs text-slate-600">
                        불확실성: {row.uncertaintyLabel} · 컨센서스 {consensusLabel(row.consensusGrade)}
                      </p>
                    ) : null}
                    {strongestContradiction ? (
                      <p className="mt-1 text-xs text-slate-600">
                        상충 시그널: {contradictionGradeLabel(strongestContradiction.contradictionGrade)} · {strongestContradiction.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {related.length > 0 ? `관련 메모 있음 (${related.length})` : "관련 메모 없음"}
                      </p>
                      <button
                        type="button"
                        onClick={() => focusNoteTarget({ targetType: "scenario", targetId: row.name, label: `${row.name} 시나리오` })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        메모
                      </button>
                    </div>
                    {related.slice(0, 2).map((noteRow) => (
                      <div key={noteRow.id} className="mt-2 rounded-md bg-slate-50 p-2">
                        <p className="text-xs text-slate-700">{noteRow.note}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {noteRow.tags.map((tag) => (
                            <span key={`${noteRow.id}-${tag}`} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">#{tag}</span>
                          ))}
                          <span className="text-[10px] text-slate-500">{formatDateTime(noteRow.createdAt)}</span>
                          <button
                            type="button"
                            disabled={noteDeletingId === noteRow.id}
                            onClick={() => { void handleDeleteNote(noteRow.id); }}
                            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="mt-2 text-xs font-semibold text-slate-700">관찰</p>
                    <p className="mt-1 text-xs text-slate-600">{row.observation}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-700">트리거</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {row.trigger.slice(0, 3).map((line) => <li key={line}>- {formatLegacyTriggerText(line)}</li>)}
                    </ul>
                    <p className="mt-2 text-xs font-semibold text-slate-700">옵션</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {(row.options ?? []).slice(0, 3).map((line) => <li key={line}>- {line}</li>)}
                    </ul>
                    <p className="mt-2 text-xs font-semibold text-slate-700">모니터링</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {row.monitoringOptions.slice(0, 3).map((line) => <li key={line}>- {line}</li>)}
                    </ul>
                    <p className="mt-2 text-xs font-semibold text-slate-700">내 상황 영향</p>
                    {row.personalImpact && !isProfileMissingImpact(row.personalImpact) ? (
                      <div className="mt-1 space-y-1 text-xs text-slate-600">
                        <p>현금흐름 압력: {impactGradeLabel(row.personalImpact.cashflowRisk)} · 부채상환 압력: {impactGradeLabel(row.personalImpact.debtServiceRisk)}</p>
                        <p>물가 압력: {impactGradeLabel(row.personalImpact.inflationPressureRisk)} · 환율 압력: {impactGradeLabel(row.personalImpact.fxPressureRisk)}</p>
                        <p>소득 압력: {impactGradeLabel(row.personalImpact.incomeRisk)} · 완충력: {impactGradeLabel(row.personalImpact.bufferAdequacy)}</p>
                        <ul className="space-y-1">
                          {(row.personalImpact.rationale ?? []).slice(0, 3).map((line) => <li key={`${row.name}-impact-${line}`}>- {line}</li>)}
                        </ul>
                        <button
                          type="button"
                          onClick={() => setAdvancedScenario((prev) => ({ ...prev, [row.name]: !prev[row.name] }))}
                          className="mt-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {advancedScenario[row.name] ? "고급 보기 닫기" : "고급 보기"}
                        </button>
                        {advancedScenario[row.name] ? (
                          <p className="text-[10px] text-slate-500">watch: {(row.personalImpact.watch ?? []).join(", ") || "없음"}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">
                        Unknown(프로필 설정 필요) · <Link href="/planning/v3/exposure" className="underline underline-offset-2">노출 프로필 설정</Link>
                      </p>
                    )}
                    <p className="mt-2 text-xs font-semibold text-slate-700">스트레스 점검</p>
                    {row.stress ? (
                      <ul className="mt-1 space-y-1 text-xs text-slate-600">
                        {row.stress.pressureAreas.slice(0, 2).map((line) => <li key={`${row.name}-stress-p-${line}`}>- {line}</li>)}
                        {row.stress.monitoringCadence.slice(0, 1).map((line) => <li key={`${row.name}-stress-m-${line}`}>- {line}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">데이터 부족</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
