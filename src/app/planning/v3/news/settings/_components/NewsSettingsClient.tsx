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

type SourceTransferItem = {
  url: string;
  weight: number;
  enabled: boolean;
};

type SourceIoGetResponse = {
  ok?: boolean;
  data?: {
    items?: SourceTransferItem[];
  } | null;
  error?: { message?: string };
};

type SourceIoPostResponse = {
  ok?: boolean;
  data?: {
    mode?: "dry_run" | "apply";
    preview?: {
      totalInput?: number;
      validRows?: number;
      createCount?: number;
      updateCount?: number;
      duplicateCount?: number;
      issueCount?: number;
    };
    applied?: {
      updatedOverrides?: number;
      customSources?: number;
    } | null;
  } | null;
  error?: { message?: string };
};

type IndicatorSeriesSpec = {
  id: string;
  sourceId: string;
  externalId: string;
  name: string;
  frequency: "D" | "W" | "M" | "Q" | "Y";
  units?: string;
  transform?: "none" | "pct_change" | "diff" | "log";
  notes?: string;
  enabled?: boolean;
};

type IndicatorCategory =
  | "rates"
  | "inflation"
  | "fx"
  | "growth"
  | "labor"
  | "credit"
  | "commodities"
  | "fiscal"
  | "liquidity"
  | "general";

type IndicatorCatalogRow = IndicatorSeriesSpec & {
  annotation: {
    seriesId: string;
    category: IndicatorCategory;
    label: string;
  };
  displayLabel: string;
};

type IndicatorSpecsGetResponse = {
  ok?: boolean;
  data?: {
    specs?: IndicatorSeriesSpec[];
    catalog?: IndicatorCatalogRow[];
  } | null;
  error?: { message?: string };
};

type IndicatorSpecsPostResponse = {
  ok?: boolean;
  data?: {
    mode?: "dry_run" | "apply";
    preview?: {
      totalInput?: number;
      validRows?: number;
      createCount?: number;
      updateCount?: number;
      duplicateCount?: number;
      issueCount?: number;
    };
    applied?: {
      overridesCount?: number;
      effectiveCount?: number;
    } | null;
  } | null;
  error?: { message?: string };
};

type ExposureProfile = {
  savedAt?: string;
  debt?: {
    hasDebt?: "yes" | "no" | "unknown";
    rateType?: "fixed" | "variable" | "mixed" | "none" | "unknown";
    repricingHorizon?: "short" | "medium" | "long" | "none" | "unknown";
  };
  inflation?: {
    essentialExpenseShare?: "low" | "medium" | "high" | "unknown";
    rentOrMortgageShare?: "low" | "medium" | "high" | "unknown";
    energyShare?: "low" | "medium" | "high" | "unknown";
  };
  fx?: {
    foreignConsumption?: "low" | "medium" | "high" | "unknown";
    foreignIncome?: "low" | "medium" | "high" | "unknown";
  };
  income?: {
    incomeStability?: "stable" | "moderate" | "fragile" | "unknown";
  };
  liquidity?: {
    monthsOfCashBuffer?: "low" | "medium" | "high" | "unknown";
  };
};

type ExposureResponse = {
  ok?: boolean;
  profile?: ExposureProfile | null;
  error?: {
    code?: string;
    message?: string;
  };
};

type ExposureDraft = {
  hasDebt: "unknown" | "yes" | "no";
  rateType: "fixed" | "variable" | "mixed" | "none" | "unknown";
  repricingHorizon: "short" | "medium" | "long" | "none" | "unknown";
  essentialExpenseShare: "low" | "medium" | "high" | "unknown";
  rentOrMortgageShare: "low" | "medium" | "high" | "unknown";
  energyShare: "low" | "medium" | "high" | "unknown";
  foreignConsumption: "low" | "medium" | "high" | "unknown";
  foreignIncome: "low" | "medium" | "high" | "unknown";
  incomeStability: "stable" | "moderate" | "fragile" | "unknown";
  monthsOfCashBuffer: "low" | "medium" | "high" | "unknown";
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

function formatIndicatorCategory(value: IndicatorCategory | string | undefined): string {
  const normalized = asString(value).toLowerCase();
  const map: Record<string, string> = {
    rates: "금리",
    inflation: "물가",
    fx: "환율",
    growth: "성장",
    labor: "고용",
    credit: "신용",
    commodities: "원자재",
    fiscal: "재정",
    liquidity: "유동성",
    general: "일반",
  };
  return map[normalized] ?? "일반";
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

function emptyExposureDraft(): ExposureDraft {
  return {
    hasDebt: "unknown",
    rateType: "unknown",
    repricingHorizon: "unknown",
    essentialExpenseShare: "unknown",
    rentOrMortgageShare: "unknown",
    energyShare: "unknown",
    foreignConsumption: "unknown",
    foreignIncome: "unknown",
    incomeStability: "unknown",
    monthsOfCashBuffer: "unknown",
  };
}

function profileToDraft(profile: ExposureProfile | null | undefined): ExposureDraft {
  if (!profile) return emptyExposureDraft();
  return {
    hasDebt: profile.debt?.hasDebt ?? "unknown",
    rateType: profile.debt?.rateType ?? "unknown",
    repricingHorizon: profile.debt?.repricingHorizon ?? "unknown",
    essentialExpenseShare: profile.inflation?.essentialExpenseShare ?? "unknown",
    rentOrMortgageShare: profile.inflation?.rentOrMortgageShare ?? "unknown",
    energyShare: profile.inflation?.energyShare ?? "unknown",
    foreignConsumption: profile.fx?.foreignConsumption ?? "unknown",
    foreignIncome: profile.fx?.foreignIncome ?? "unknown",
    incomeStability: profile.income?.incomeStability ?? "unknown",
    monthsOfCashBuffer: profile.liquidity?.monthsOfCashBuffer ?? "unknown",
  };
}

function draftToProfile(draft: ExposureDraft): Omit<ExposureProfile, "savedAt"> {
  return {
    debt: {
      hasDebt: draft.hasDebt,
      rateType: draft.rateType,
      repricingHorizon: draft.repricingHorizon,
    },
    inflation: {
      essentialExpenseShare: draft.essentialExpenseShare,
      rentOrMortgageShare: draft.rentOrMortgageShare,
      energyShare: draft.energyShare,
    },
    fx: {
      foreignConsumption: draft.foreignConsumption,
      foreignIncome: draft.foreignIncome,
    },
    income: {
      incomeStability: draft.incomeStability,
    },
    liquidity: {
      monthsOfCashBuffer: draft.monthsOfCashBuffer,
    },
  };
}

export function NewsSettingsClient({ csrf }: NewsSettingsClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [exposureUpdatedAt, setExposureUpdatedAt] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, SourceDraft>>({});
  const [topicDrafts, setTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [exposureDraft, setExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [initialExposureDraft, setInitialExposureDraft] = useState<ExposureDraft>(emptyExposureDraft());
  const [sourcesJson, setSourcesJson] = useState("[]");
  const [sourcesIoLoading, setSourcesIoLoading] = useState(false);
  const [sourcesIoSummary, setSourcesIoSummary] = useState("");
  const [specsJson, setSpecsJson] = useState("[]");
  const [specsIoLoading, setSpecsIoLoading] = useState(false);
  const [specsIoSummary, setSpecsIoSummary] = useState("");
  const [indicatorCatalog, setIndicatorCatalog] = useState<IndicatorCatalogRow[]>([]);

  const applyIndicatorSpecsResponse = useCallback((payload: IndicatorSpecsGetResponse | null | undefined) => {
    const specs = payload?.data?.specs ?? [];
    const catalog = payload?.data?.catalog ?? [];
    setSpecsJson(`${JSON.stringify(specs, null, 2)}\n`);
    setIndicatorCatalog([...catalog].sort((a, b) => asString(a.id).localeCompare(asString(b.id))));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [settingsResponse, exposureResponse, specsResponse] = await Promise.all([
        fetch("/api/planning/v3/news/settings", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
        fetch("/api/planning/v3/exposure/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
        fetch("/api/planning/v3/indicators/specs", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "x-requested-with": "XMLHttpRequest",
          },
        }),
      ]);
      const settingsPayload = (await settingsResponse.json().catch(() => null)) as GetSettingsResponse | null;
      const exposurePayload = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      const specsPayload = (await specsResponse.json().catch(() => null)) as IndicatorSpecsGetResponse | null;
      if (!settingsResponse.ok || settingsPayload?.ok !== true || !settingsPayload.data) {
        throw new Error(settingsPayload?.error?.message ?? `HTTP ${settingsResponse.status}`);
      }
      if (!exposureResponse.ok || exposurePayload?.ok !== true) {
        throw new Error(exposurePayload?.error?.message ?? `HTTP ${exposureResponse.status}`);
      }
      if (specsResponse.ok && specsPayload?.ok === true) {
        applyIndicatorSpecsResponse(specsPayload);
      } else {
        setIndicatorCatalog([]);
      }

      const loadedSources = settingsPayload.data.sources ?? [];
      const loadedTopics = settingsPayload.data.topics ?? [];
      const nextExposureDraft = profileToDraft(exposurePayload.profile ?? null);
      setUpdatedAt(settingsPayload.data.updatedAt ?? null);
      setSources(loadedSources);
      setTopics(loadedTopics);
      setExposureUpdatedAt(exposurePayload.profile?.savedAt ?? null);
      setExposureDraft(nextExposureDraft);
      setInitialExposureDraft(nextExposureDraft);
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
      setExposureDraft(emptyExposureDraft());
      setInitialExposureDraft(emptyExposureDraft());
      setIndicatorCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [applyIndicatorSpecsResponse]);

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
    if (JSON.stringify(exposureDraft) !== JSON.stringify(initialExposureDraft)) return true;
    return false;
  }, [exposureDraft, initialExposureDraft, sourceDrafts, sources, topicDrafts, topics]);

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

  function updateExposure<K extends keyof ExposureDraft>(key: K, value: ExposureDraft[K]) {
    setExposureDraft((prev) => ({
      ...prev,
      [key]: value,
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

      const exposurePayloadWithCsrf = withDevCsrf({
        profile: draftToProfile(exposureDraft),
      });
      if (!exposurePayloadWithCsrf.csrf && asString(csrf)) {
        exposurePayloadWithCsrf.csrf = asString(csrf);
      }
      const exposureResponse = await fetch("/api/planning/v3/exposure/profile", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(exposurePayloadWithCsrf),
      });
      const exposureResult = (await exposureResponse.json().catch(() => null)) as ExposureResponse | null;
      if (!exposureResponse.ok || exposureResult?.ok !== true) {
        throw new Error(exposureResult?.error?.message ?? `HTTP ${exposureResponse.status}`);
      }

      setNotice("설정을 저장했습니다.");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "설정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExportSources() {
    setSourcesIoLoading(true);
    setErrorMessage("");
    setSourcesIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/news/sources", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as SourceIoGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const items = result.data?.items ?? [];
      setSourcesJson(`${JSON.stringify(items, null, 2)}\n`);
      setSourcesIoSummary(`내보내기 완료: ${items.length}개 소스`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "소스 내보내기에 실패했습니다.");
    } finally {
      setSourcesIoLoading(false);
    }
  }

  async function handleImportSources(mode: "dry_run" | "apply") {
    setSourcesIoLoading(true);
    setErrorMessage("");
    setSourcesIoSummary("");
    try {
      const parsed = JSON.parse(sourcesJson) as unknown;
      const items = Array.isArray(parsed) ? parsed : [];
      const payload = withDevCsrf({ mode, items });
      if (!payload.csrf && asString(csrf)) payload.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/news/sources", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as SourceIoPostResponse | null;
      if (!response.ok || result?.ok !== true || !result.data?.preview) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const preview = result.data.preview;
      setSourcesIoSummary(
        `${mode === "apply" ? "적용" : "Dry-run"}: 입력 ${preview.totalInput ?? 0}, 유효 ${preview.validRows ?? 0}, 신규 ${preview.createCount ?? 0}, 갱신 ${preview.updateCount ?? 0}, 중복 ${preview.duplicateCount ?? 0}, 이슈 ${preview.issueCount ?? 0}`,
      );
      if (mode === "apply") {
        await load();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "소스 import 처리에 실패했습니다.");
    } finally {
      setSourcesIoLoading(false);
    }
  }

  async function handleExportSpecs() {
    setSpecsIoLoading(true);
    setErrorMessage("");
    setSpecsIoSummary("");
    try {
      const response = await fetch("/api/planning/v3/indicators/specs", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const result = (await response.json().catch(() => null)) as IndicatorSpecsGetResponse | null;
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      applyIndicatorSpecsResponse(result);
      const specs = result.data?.specs ?? [];
      setSpecsIoSummary(`내보내기 완료: ${specs.length}개 series spec`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "series spec 내보내기에 실패했습니다.");
    } finally {
      setSpecsIoLoading(false);
    }
  }

  async function handleImportSpecs(mode: "dry_run" | "apply") {
    setSpecsIoLoading(true);
    setErrorMessage("");
    setSpecsIoSummary("");
    try {
      const parsed = JSON.parse(specsJson) as unknown;
      const specs = Array.isArray(parsed) ? parsed : [];
      const payload = withDevCsrf({ mode, specs });
      if (!payload.csrf && asString(csrf)) payload.csrf = asString(csrf);

      const response = await fetch("/api/planning/v3/indicators/specs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as IndicatorSpecsPostResponse | null;
      if (!response.ok || result?.ok !== true || !result.data?.preview) {
        throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      }
      const preview = result.data.preview;
      setSpecsIoSummary(
        `${mode === "apply" ? "적용" : "Dry-run"}: 입력 ${preview.totalInput ?? 0}, 유효 ${preview.validRows ?? 0}, 신규 ${preview.createCount ?? 0}, 갱신 ${preview.updateCount ?? 0}, 중복 ${preview.duplicateCount ?? 0}, 이슈 ${preview.issueCount ?? 0}`,
      );
      if (mode === "apply") {
        await load();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "series spec import 처리에 실패했습니다.");
    } finally {
      setSpecsIoLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="space-y-5">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-black text-slate-900">Planning v3 News Settings</h1>
              <p className="text-sm text-slate-600">로컬 뉴스 소스/토픽/노출 프로필 오버라이드 설정 (명시 저장)</p>
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
          <p className="text-xs text-slate-500">설정 저장 시각: {formatDateTime(updatedAt)} · 노출 프로필 저장 시각: {formatDateTime(exposureUpdatedAt)}</p>
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
                      <p className="text-xs text-slate-500">{row.country} · {row.language} · 기본 가중치 {row.defaultWeight}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={sourceDrafts[row.id]?.enabled ?? row.defaultEnabled}
                          onChange={(event) => updateSourceEnabled(row.id, event.target.checked)}
                        />
                        사용
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        가중치
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
          <h2 className="text-sm font-bold text-slate-900">RSS Sources Import / Export</h2>
          <p className="text-xs text-slate-500">JSON 배열 형식: <code>{"[{\"url\":\"https://example.com/rss.xml\",\"weight\":1.2,\"enabled\":true}]"}</code> · 본문/아이템 데이터는 포함되지 않습니다.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleExportSources(); }}
              disabled={sourcesIoLoading}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => { void handleImportSources("dry_run"); }}
              disabled={sourcesIoLoading}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              Dry-run
            </button>
            <button
              type="button"
              onClick={() => { void handleImportSources("apply"); }}
              disabled={sourcesIoLoading}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              적용
            </button>
          </div>
          <textarea
            value={sourcesJson}
            onChange={(event) => setSourcesJson(event.target.value)}
            rows={8}
            className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
            placeholder="RSS source JSON 배열"
          />
          {sourcesIoSummary ? <p className="text-xs font-semibold text-emerald-700">{sourcesIoSummary}</p> : null}
        </Card>

        <Card id="indicator-series-specs" className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Indicator SeriesSpec Import / Export</h2>
          <p className="text-xs text-slate-500">series spec만 import/export 하며 키/토큰은 포함되지 않습니다. import는 strict validation + dry-run을 먼저 수행하세요.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleExportSpecs(); }}
              disabled={specsIoLoading}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => { void handleImportSpecs("dry_run"); }}
              disabled={specsIoLoading}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              Dry-run
            </button>
            <button
              type="button"
              onClick={() => { void handleImportSpecs("apply"); }}
              disabled={specsIoLoading}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              적용
            </button>
          </div>
          <textarea
            value={specsJson}
            onChange={(event) => setSpecsJson(event.target.value)}
            rows={10}
            className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700"
            placeholder="SeriesSpec JSON 배열"
          />
          {specsIoSummary ? <p className="text-xs font-semibold text-emerald-700">{specsIoSummary}</p> : null}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Indicator Catalog ({indicatorCatalog.length})</p>
            {indicatorCatalog.length < 1 ? (
              <p className="text-xs text-slate-500">카탈로그 데이터가 없습니다.</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-2 py-1">Series ID</th>
                      <th className="px-2 py-1">표시 라벨</th>
                      <th className="px-2 py-1">카테고리</th>
                      <th className="px-2 py-1">소스</th>
                      <th className="px-2 py-1">주기</th>
                      <th className="px-2 py-1">사용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicatorCatalog.map((row) => (
                      <tr key={`catalog-${row.id}`} className="border-t border-slate-200 text-slate-700">
                        <td className="px-2 py-1 font-mono">{row.id}</td>
                        <td className="px-2 py-1">{asString(row.displayLabel) || asString(row.annotation?.label) || asString(row.name)}</td>
                        <td className="px-2 py-1">{formatIndicatorCategory(row.annotation?.category)}</td>
                        <td className="px-2 py-1">{asString(row.sourceId)}</td>
                        <td className="px-2 py-1">{asString(row.frequency)}</td>
                        <td className="px-2 py-1">{row.enabled === false ? "비활성" : "활성"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
                  <p className="mt-1 text-xs text-slate-500">기본 키워드: {row.defaultKeywords.join(", ")}</p>
                  <textarea
                    value={topicDrafts[row.id]?.keywordsText ?? ""}
                    onChange={(event) => updateTopicKeywords(row.id, event.target.value)}
                    placeholder="로컬 오버라이드 키워드 입력"
                    rows={4}
                    className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-xs text-slate-700"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Exposure Profile</h2>
          <p className="text-xs text-slate-500">저장은 명시적으로만 반영되며, 미입력 항목은 unknown으로 평가됩니다.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">부채 보유</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.hasDebt} onChange={(event) => updateExposure("hasDebt", event.target.value as ExposureDraft["hasDebt"])}>
                <option value="unknown">미입력</option>
                <option value="yes">있음</option>
                <option value="no">없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">금리 유형</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.rateType} onChange={(event) => updateExposure("rateType", event.target.value as ExposureDraft["rateType"])}>
                <option value="unknown">미입력</option>
                <option value="fixed">고정</option>
                <option value="variable">변동</option>
                <option value="mixed">혼합</option>
                <option value="none">해당 없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">재조정 민감도</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.repricingHorizon} onChange={(event) => updateExposure("repricingHorizon", event.target.value as ExposureDraft["repricingHorizon"])}>
                <option value="unknown">미입력</option>
                <option value="short">단기</option>
                <option value="medium">중기</option>
                <option value="long">장기</option>
                <option value="none">해당 없음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">필수지출 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.essentialExpenseShare} onChange={(event) => updateExposure("essentialExpenseShare", event.target.value as ExposureDraft["essentialExpenseShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">주거비 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.rentOrMortgageShare} onChange={(event) => updateExposure("rentOrMortgageShare", event.target.value as ExposureDraft["rentOrMortgageShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">에너지비 비중</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.energyShare} onChange={(event) => updateExposure("energyShare", event.target.value as ExposureDraft["energyShare"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">해외소비 노출</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.foreignConsumption} onChange={(event) => updateExposure("foreignConsumption", event.target.value as ExposureDraft["foreignConsumption"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">외화소득 노출</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.foreignIncome} onChange={(event) => updateExposure("foreignIncome", event.target.value as ExposureDraft["foreignIncome"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">소득 안정성</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.incomeStability} onChange={(event) => updateExposure("incomeStability", event.target.value as ExposureDraft["incomeStability"])}>
                <option value="unknown">미입력</option>
                <option value="stable">안정</option>
                <option value="moderate">보통</option>
                <option value="fragile">취약</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-700">
              <span className="font-semibold">현금완충력</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1" value={exposureDraft.monthsOfCashBuffer} onChange={(event) => updateExposure("monthsOfCashBuffer", event.target.value as ExposureDraft["monthsOfCashBuffer"])}>
                <option value="unknown">미입력</option>
                <option value="low">낮음</option>
                <option value="medium">중간</option>
                <option value="high">높음</option>
              </select>
            </label>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
