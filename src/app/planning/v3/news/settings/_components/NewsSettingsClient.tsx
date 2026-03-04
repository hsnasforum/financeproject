"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";

type NewsSettingsClientProps = {
  csrf?: string;
};

type SourceRow = {
  id: string;
  name: string;
  feedUrl: string;
  country: string;
  language: string;
  defaultEnabled: boolean;
  defaultWeight: number;
  overrideEnabled: boolean | null;
  overrideWeight: number | null;
  effectiveEnabled: boolean;
  effectiveWeight: number;
};

type TopicRow = {
  id: string;
  label: string;
  defaultKeywords: string[];
  overrideKeywords: string[] | null;
  effectiveKeywords: string[];
};

type GetSettingsResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
    sources?: SourceRow[];
    topics?: TopicRow[];
  } | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type SaveSettingsResponse = {
  ok?: boolean;
  data?: {
    updatedAt?: string | null;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type SourceDraft = {
  id: string;
  enabled: boolean;
  weight: string;
};

type TopicDraft = {
  id: string;
  keywordsText: string;
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

function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n|,/g)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function keywordsToTextarea(value: string[] | null | undefined): string {
  if (!Array.isArray(value) || value.length < 1) return "";
  return value.join("\n");
}

export function NewsSettingsClient({ csrf }: NewsSettingsClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [topicDrafts, setTopicDrafts] = useState<Record<string, TopicDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/planning/v3/news/settings", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
      });
      const payload = (await response.json().catch(() => null)) as GetSettingsResponse | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }

      const loadedSources = payload.data.sources ?? [];
      const loadedTopics = payload.data.topics ?? [];
      setUpdatedAt(payload.data.updatedAt ?? null);
      setSources(loadedSources);
      setTopics(loadedTopics);
      setSourceDrafts(Object.fromEntries(loadedSources.map((row) => [
        row.id,
        {
          id: row.id,
          enabled: row.overrideEnabled ?? row.defaultEnabled,
          weight: String(row.overrideWeight ?? row.defaultWeight),
        },
      ])));
      setTopicDrafts(Object.fromEntries(loadedTopics.map((row) => [
        row.id,
        {
          id: row.id,
          keywordsText: keywordsToTextarea(row.overrideKeywords),
        },
      ])));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "설정을 불러오지 못했습니다.");
      setSources([]);
      setTopics([]);
      setSourceDrafts({});
      setTopicDrafts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    for (const row of sources) {
      const draft = sourceDrafts[row.id];
      if (!draft) continue;
      const enabledChanged = draft.enabled !== row.defaultEnabled;
      const parsedWeight = Number(draft.weight);
      const validWeight = Number.isFinite(parsedWeight) ? parsedWeight : row.defaultWeight;
      const weightChanged = Math.abs(validWeight - row.defaultWeight) > 1e-9;
      if (enabledChanged || weightChanged) return true;
    }
    for (const row of topics) {
      const draft = topicDrafts[row.id];
      if (!draft) continue;
      const parsed = parseKeywords(draft.keywordsText);
      const defaults = row.defaultKeywords;
      const equal = parsed.length === defaults.length && parsed.every((token, idx) => token === defaults[idx]);
      if (!equal) return true;
    }
    return false;
  }, [sourceDrafts, sources, topicDrafts, topics]);

  function updateSourceEnabled(id: string, value: boolean) {
    setSourceDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, enabled: value, weight: "1" }),
        enabled: value,
      },
    }));
  }

  function updateSourceWeight(id: string, value: string) {
    setSourceDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, enabled: true, weight: value }),
        weight: value,
      },
    }));
  }

  function updateTopicKeywords(id: string, value: string) {
    setTopicDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { id, keywordsText: "" }),
        keywordsText: value,
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setErrorMessage("");
    setNotice("");
    try {
      const sourceOverrides = sources.map((row) => {
        const draft = sourceDrafts[row.id];
        const parsedWeight = Number(draft?.weight ?? row.defaultWeight);
        const weight = Number.isFinite(parsedWeight) ? parsedWeight : row.defaultWeight;
        const enabled = draft?.enabled ?? row.defaultEnabled;
        return {
          id: row.id,
          enabled: enabled === row.defaultEnabled ? undefined : enabled,
          weight: Math.abs(weight - row.defaultWeight) <= 1e-9 ? undefined : weight,
        };
      }).filter((row) => typeof row.enabled === "boolean" || typeof row.weight === "number");

      const topicOverrides = topics.map((row) => {
        const parsed = parseKeywords(topicDrafts[row.id]?.keywordsText ?? "");
        const defaults = row.defaultKeywords;
        const equal = parsed.length === defaults.length && parsed.every((token, idx) => token === defaults[idx]);
        return {
          id: row.id,
          keywords: equal ? undefined : parsed,
        };
      }).filter((row) => Array.isArray(row.keywords));

      const payloadWithCsrf = withDevCsrf({
        sources: sourceOverrides,
        topics: topicOverrides,
      });
      if (!payloadWithCsrf.csrf && asString(csrf)) {
        payloadWithCsrf.csrf = asString(csrf);
      }

      const response = await fetch("/api/planning/v3/news/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payloadWithCsrf),
      });
      const result = (await response.json().catch(() => null)) as SaveSettingsResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }

      setNotice("설정을 저장했습니다.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "설정 저장에 실패했습니다.");
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
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Settings</h1>
              <p className="text-sm text-slate-600">로컬 뉴스 소스/토픽 오버라이드 설정 (명시 저장)</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/planning/v3/news" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
                Digest로 돌아가기
              </Link>
              <button
                type="button"
                disabled={saving || loading || !dirty}
                onClick={() => { void handleSave(); }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "저장 중..." : "설정 저장"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500">마지막 저장 시각: {formatDateTime(updatedAt)}</p>
          {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
          {errorMessage ? <p className="text-xs font-semibold text-rose-700">{errorMessage}</p> : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Sources</h2>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <div className="space-y-3">
              {sources.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{row.name}</p>
                      <p className="truncate text-xs text-slate-500">{row.feedUrl}</p>
                      <p className="text-xs text-slate-500">{row.country} · {row.language} · default weight {row.defaultWeight}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={sourceDrafts[row.id]?.enabled ?? row.defaultEnabled}
                          onChange={(event) => updateSourceEnabled(row.id, event.target.checked)}
                        />
                        enabled
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        weight
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="3"
                          value={sourceDrafts[row.id]?.weight ?? String(row.defaultWeight)}
                          onChange={(event) => updateSourceWeight(row.id, event.target.value)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Topic Keyword Overrides</h2>
          <p className="text-xs text-slate-500">줄바꿈 또는 쉼표로 키워드를 구분하세요. 비워두면 SSOT 기본 키워드를 사용합니다.</p>
          {loading ? (
            <p className="text-sm text-slate-600">불러오는 중...</p>
          ) : (
            <div className="space-y-4">
              {topics.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-bold text-slate-900">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">default: {row.defaultKeywords.join(", ")}</p>
                  <textarea
                    value={topicDrafts[row.id]?.keywordsText ?? ""}
                    onChange={(event) => updateTopicKeywords(row.id, event.target.value)}
                    placeholder="override keywords..."
                    rows={4}
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-xs text-slate-700"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
