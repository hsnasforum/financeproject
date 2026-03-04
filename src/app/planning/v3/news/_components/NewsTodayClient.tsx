"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { computeImpact } from "../../../../../../planning/v3/financeNews/impactModel";
import { type ImpactResult, type ScenarioForImpact } from "../../../../../../planning/v3/financeNews/contracts";
import { type ExposureProfile } from "../../../../../../planning/v3/exposure/contracts";

type NewsTodayClientProps = {
  csrf?: string;
};

type TodayResponse = {
  ok?: boolean;
  data?: {
    lastRefreshedAt?: string | null;
    digest?: {
      date?: string;
      observation?: string;
      evidence?: Array<{
        title?: string;
        url?: string;
        sourceId?: string;
        publishedAt?: string | null;
        topics?: string[];
      }>;
      watchlist?: string[];
      counterSignals?: string[];
    };
    scenarios?: {
      cards?: Array<{
        name?: string;
        observation?: string;
        triggers?: Array<{ kind?: string; topicId?: string; condition?: string }>;
        invalidation?: string[];
        indicators?: string[];
        options?: string[];
        linkedTopics?: string[];
      }>;
    };
  } | null;
  error?: { message?: string };
};

type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: { message?: string };
};

type RefreshResponse = {
  ok?: boolean;
  data?: {
    sourcesProcessed?: number;
    itemsFetched?: number;
    itemsNew?: number;
    itemsDeduped?: number;
    errorCount?: number;
    lastRefreshedAt?: string | null;
  };
  error?: { message?: string };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const text = asString(value);
  const ts = Date.parse(text);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeScenarioName(value: unknown): ScenarioForImpact["name"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "bull") return "Bull";
  if (normalized === "bear") return "Bear";
  return "Base";
}

function inferTriggerStatus(card: {
  triggers?: Array<{ condition?: string }>;
}): ScenarioForImpact["triggerStatus"] {
  const conditions = (card.triggers ?? []).map((row) => asString(row.condition).toLowerCase()).filter(Boolean);
  if (conditions.length < 1) return "unknown";
  if (conditions.some((row) => row === "high" || row === "med")) return "met";
  if (conditions.every((row) => row === "low")) return "not_met";
  return "unknown";
}

function gradeLabel(value: ImpactResult["cashflowRisk"]): string {
  if (value === "High") return "상";
  if (value === "Med") return "중";
  if (value === "Low") return "하";
  return "Unknown";
}

function unknownImpactResult(): ImpactResult {
  return {
    cashflowRisk: "Unknown",
    debtServiceRisk: "Unknown",
    inflationPressureRisk: "Unknown",
    fxPressureRisk: "Unknown",
    incomeRisk: "Unknown",
    bufferAdequacy: "Unknown",
    rationale: ["입력 데이터가 부족해 개인 영향은 unknown으로 유지됩니다."],
    watch: [],
  };
}

export function NewsTodayClient({ csrf }: NewsTodayClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<TodayResponse["data"]>(null);
  const [profile, setProfile] = useState<ExposureProfile | null>(null);
  const [advancedImpact, setAdvancedImpact] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [todayResponse, exposureResponse] = await Promise.all([
        fetch("/api/planning/v3/news/today", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/planning/v3/exposure/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      const todayPayload = (await todayResponse.json().catch(() => null)) as TodayResponse | null;
      if (!todayResponse.ok || todayPayload?.ok !== true) {
        throw new Error(todayPayload?.error?.message ?? `HTTP ${todayResponse.status}`);
      }
      setData(todayPayload.data ?? null);

      const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      if (exposureResponse.ok && exposurePayload?.ok === true) {
        setProfile(exposurePayload.profile ?? null);
      } else {
        setProfile(null);
      }
    } catch (error) {
      setData(null);
      setProfile(null);
      setErrorMessage(error instanceof Error ? error.message : "오늘 뉴스 요약을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotice("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(withDevCsrf({ csrf })),
      });
      const payload = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      setNotice(`수동 갱신 완료: 신규 ${payload.data?.itemsNew ?? 0}건, 중복 ${payload.data?.itemsDeduped ?? 0}건`);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "갱신 중 오류가 발생했습니다.");
    } finally {
      setRefreshing(false);
    }
  }, [csrf, load]);

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News</h1>
              <p className="text-sm text-slate-600">오늘 digest와 시나리오를 로컬에서 수동 갱신/확인합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news/trends" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">트렌드</Link>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {refreshing ? "갱신 중..." : "수동 갱신"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            마지막 갱신 시각: {formatDateTime(data?.lastRefreshedAt ?? null)}
          </p>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Observation</h2>
          {loading ? <p className="text-sm text-slate-600">불러오는 중...</p> : <p className="text-sm text-slate-800">{asString(data?.digest?.observation) || "데이터 없음"}</p>}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Evidence (links)</h2>
          {!data?.digest?.evidence?.length ? (
            <p className="text-sm text-slate-600">근거 링크 없음</p>
          ) : (
            <ul className="space-y-2">
              {data.digest.evidence.slice(0, 5).map((row, index) => (
                <li key={`${asString(row.url)}-${index}`} className="text-sm text-slate-800">
                  <a href={asString(row.url)} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline underline-offset-2">
                    {asString(row.title) || asString(row.url) || "링크"}
                  </a>
                  <span className="ml-2 text-xs text-slate-500">{asString(row.sourceId)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Watchlist</h2>
          {!data?.digest?.watchlist?.length ? (
            <p className="text-sm text-slate-600">체크 변수 없음</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.digest.watchlist.map((row, index) => (
                <li key={`${row}-${index}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  {asString(row)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Counter-signals</h2>
          {!data?.digest?.counterSignals?.length ? (
            <p className="text-sm text-slate-600">반대 시그널 없음</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
              {data.digest.counterSignals.map((row, index) => (
                <li key={`${row}-${index}`}>{asString(row)}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Scenarios</h2>
          {!data?.scenarios?.cards?.length ? (
            <p className="text-sm text-slate-600">시나리오 없음</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {data.scenarios.cards.map((card, index) => (
                (() => {
                  const scenario: ScenarioForImpact = {
                    name: normalizeScenarioName(card.name),
                    triggerStatus: inferTriggerStatus(card),
                    linkedTopics: (card.linkedTopics ?? []).map((row) => asString(row).toLowerCase()).filter(Boolean),
                    confirmIndicators: (card.indicators ?? []).map((row) => asString(row).toLowerCase()).filter(Boolean),
                    leadingIndicators: [],
                    observation: asString(card.observation),
                    triggerSummary: (card.triggers ?? []).map((row) => `${asString(row.topicId)}:${asString(row.condition)}`).join(" · "),
                  };

                  let impact = unknownImpactResult();
                  try {
                    impact = computeImpact({
                      profile,
                      scenario,
                    });
                  } catch {
                    impact = unknownImpactResult();
                  }
                  const key = `${asString(card.name)}-${index}`;
                  const showAdvanced = advancedImpact[key] === true;
                  const isProfileMissing = profile === null;

                  return (
                    <div key={key} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-black text-slate-900">{asString(card.name) || "Scenario"}</p>
                      <p className="mt-1 text-xs text-slate-700">{asString(card.observation) || "-"}</p>
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">연결 토픽: {(card.linkedTopics ?? []).join(", ") || "-"}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">트리거: {scenario.triggerSummary || "-"}</p>
                      <p className="mt-1 text-[11px] text-slate-500">옵션: {(card.options ?? []).slice(0, 2).join(" / ") || "-"}</p>

                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold text-slate-700">내 상황 영향(요약)</p>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-emerald-700 underline underline-offset-2"
                            onClick={() => setAdvancedImpact((prev) => ({ ...prev, [key]: !showAdvanced }))}
                          >
                            {showAdvanced ? "고급 닫기" : "고급 보기"}
                          </button>
                        </div>

                        {isProfileMissing ? (
                          <p className="mt-1 text-[11px] text-slate-600">
                            Unknown (프로필 설정 필요){" "}
                            <Link href="/planning/v3/exposure" className="font-semibold text-emerald-700 underline underline-offset-2">설정하기</Link>
                          </p>
                        ) : (
                          <>
                            <p className="mt-1 text-[11px] text-slate-700">
                              부채 {gradeLabel(impact.debtServiceRisk)} · 물가 {gradeLabel(impact.inflationPressureRisk)} · 환율 {gradeLabel(impact.fxPressureRisk)} · 완충력 {gradeLabel(impact.bufferAdequacy)}
                            </p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
                              {impact.rationale.slice(0, 3).map((line, lineIndex) => (
                                <li key={`${key}-rationale-${lineIndex}`}>{line}</li>
                              ))}
                            </ul>
                          </>
                        )}

                        {showAdvanced ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            watch seriesIds: {impact.watch.length > 0 ? impact.watch.join(", ") : "-"}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
