"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type DigestDay, type NewsScenarioPack } from "@/lib/news/types";

type NewsDigestClientProps = {
  csrf?: string;
};

type DigestResponse = {
  ok?: boolean;
  data?: DigestDay | null;
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

export function NewsDigestClient({ csrf }: NewsDigestClientProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [digest, setDigest] = useState<DigestDay | null>(null);
  const [scenarios, setScenarios] = useState<NewsScenarioPack | null>(null);

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
      setScenarios((scenarioRes.ok && scenarioPayload?.ok === true) ? (scenarioPayload.data ?? null) : null);
    } catch (error) {
      setDigest(null);
      setScenarios(null);
      setErrorMessage(error instanceof Error ? error.message : "뉴스 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryLine = useMemo(() => {
    if (!digest) return "요약 데이터 없음";
    return digest.summary.observation;
  }, [digest]);

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
            <div className="flex items-center gap-2">
              <Link href="/planning/v3/news/trends" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                트렌드 보기
              </Link>
              <Link href="/planning/v3/news/settings" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                설정
              </Link>
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
          <h2 className="text-sm font-bold text-slate-900">오늘의 관찰</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">{summaryLine}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">근거 링크</p>
              {digest?.summary.evidenceLinks?.length ? (
                <ul className="space-y-1 text-xs">
                  {digest.summary.evidenceLinks.slice(0, 5).map((url) => (
                    <li key={url}>
                      <a className="text-emerald-700 underline underline-offset-2" href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">없음</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">체크 변수</p>
              {digest?.watchlist?.length ? (
                <ul className="space-y-1 text-xs text-slate-700">
                  {digest.watchlist.map((row) => (
                    <li key={`${row.seriesId}-${row.label}-${row.view}`}>
                      - {row.label}: {row.valueSummary}
                      {row.status === "unknown" ? " (unknown)" : ""}
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
              {digest.topItems.slice(0, 10).map((item) => (
                <li key={`${item.url}-${item.publishedAt}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{item.topicLabel} · {item.sourceName} · {item.score}</p>
                  <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline">
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Scenario Cards</h2>
          {!scenarios?.scenarios?.length ? (
            <p className="text-sm text-slate-600">데이터 없음</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {scenarios.scenarios.map((row) => (
                <div key={row.name} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-black text-slate-900">{row.name} ({row.confidence})</p>
                  <p className="mt-1 text-xs text-slate-600">Trigger: {row.triggerStatus} · {row.triggerSummary}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-700">관찰</p>
                  <p className="mt-1 text-xs text-slate-600">{row.observation}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-700">Trigger</p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {row.trigger.slice(0, 3).map((line) => <li key={line}>- {line}</li>)}
                  </ul>
                  <p className="mt-2 text-xs font-semibold text-slate-700">옵션</p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {(row.options ?? []).slice(0, 3).map((line) => <li key={line}>- {line}</li>)}
                  </ul>
                  <p className="mt-2 text-xs font-semibold text-slate-700">Monitoring</p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {row.monitoringOptions.slice(0, 3).map((line) => <li key={line}>- {line}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
